// sequelize.connectionManager, as Sequelize has it: connections of the pool for code of your own (getConnection,
// releaseConnection), the numbers of the pool (pool.size...), validate(), and _connect(config), through which every
// connection of PostgreSQL is opened (so it can be wrapped or stubbed). @xufa/orm reads the values of every type
// itself: there are no type parsers to refresh or clear.

// The numbers of a pool of @xufa/pg as those of sequelize-pool (size, available, using, waiting, maxSize).
function poolNumbers(pool) {
  return {
    get size() {
      return pool.totalCount;
    },
    get available() {
      return pool.idleCount;
    },
    get using() {
      return pool.totalCount - pool.idleCount;
    },
    get waiting() {
      return pool.waitingCount;
    },
    get maxSize() {
      return pool.max;
    },
  };
}

// SQLite has one connection.
const ONE = Object.freeze({ size: 1, available: 1, using: 0, waiting: 0, maxSize: 1 });

class ConnectionManager {
  constructor(sequelize) {
    this.sequelize = sequelize;
    this.dialect = sequelize.dialect;
    this.dialectName = sequelize.dialectName;
    this.config = sequelize.config;
    this.versionPromise = null;
    // With replication, the pools by kind (read, write) and acquire() of each (see Sequelize#installReplication).
    this.xufaPools = null;
  }

  get xufaPool() {
    return this.sequelize.xufaDb.backend.pool || null;
  }

  // The pool: its numbers; with replication, { read, write }, each with acquire().
  get pool() {
    if (this.xufaPools) return this.xufaPools;
    const pool = this.xufaPool;
    return pool && pool.totalCount !== undefined ? poolNumbers(pool) : ONE;
  }

  // Every new connection of a pool of PostgreSQL is opened by _connect(options of the pool).
  xufaOpenThrough(pool) {
    const open = Object.getPrototypeOf(pool).openConnection;
    if (typeof open !== 'function') return;
    pool.xufaOpen = (options) => open.call(pool, options);
    pool.openConnection = (options) => this._connect(options, pool);
  }

  // Opens a connection (a Connection of @xufa/pg, logged in), with the options of its pool.
  async _connect(options, pool = this.xufaPool) {
    return pool.xufaOpen(options);
  }

  async _disconnect(connection) {
    if (connection && typeof connection.end === 'function') await connection.end();
  }

  // A connection for code of your own, until releaseConnection(): a client of @xufa/pg in PostgreSQL (query(),
  // processID; with replication, of a replica for options.type SELECT, unless useMaster); in SQLite, the database.
  async getConnection(options = {}) {
    const { sequelize } = this;
    await sequelize.xufaConnect();
    const pool = this.xufaPool;
    if (!pool || typeof pool.connect !== 'function') return sequelize.xufaDb.backend.db || sequelize.xufaDb.backend;
    const take = () => pool.connect();
    let client;
    try {
      client = await (options.type === 'SELECT' ? sequelize.xufaReading(options, take) : take());
    } catch (err) {
      throw sequelize.xufaError(err);
    }
    if (!client.xufaManaged) {
      client.xufaManaged = true;
      // An error of the connection (as pg's 'error' event): it is not valid any more, and leaves the pool.
      client.on('error', (err) => {
        client.xufaInvalid = true;
        if (!client.released) client.release(err || true);
      });
      client.end = () => client.connection.end();
    }
    return client;
  }

  async releaseConnection(connection) {
    if (connection && typeof connection.release === 'function' && !connection.released) connection.release();
  }

  // A connection that must not be used again: closed instead of given back.
  async destroyConnection(connection) {
    if (connection && typeof connection.release === 'function' && !connection.released) connection.release(true);
    else if (connection && connection.connection) connection.connection.destroy();
  }

  // Whether a connection can still be used.
  validate(connection) {
    if (!connection || !connection.connection) return Boolean(connection);
    return !connection.xufaInvalid && !connection.connection.closed;
  }

  // Type parsers: none here (see above).
  refreshTypeParser() {}

  _refreshTypeParser() {}

  _clearTypeParser() {}

  async close() {
    await this.sequelize.close();
  }
}

module.exports = { ConnectionManager, poolNumbers };
