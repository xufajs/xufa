// PostgresBackend: PostgreSQL with @xufa/pg. Options: `url` (postgres://...) and the options of its Pool (max...),
// or a `pool` of your own. Queries run on the pool (pipelined); a transaction takes a connection of its own, which
// the queries made in it (in its async context) use; transactions inside it are savepoints.
const { SqlBackend } = require('./sql/backend');
const { postgres } = require('./sql/dialects');

// Rows with Raw values (SQL of their own) are not copied.
const hasRaw = (row) => Object.values(row).some((value) => value && value.kind === 'raw');

// Inserts of this number of rows or more are made with COPY.
const COPY_ROWS = 500;

class PostgresBackend extends SqlBackend {
  constructor(options = {}) {
    super(options, postgres);
    const { Pool } = require('@xufa/pg');
    // copyRows: inserts of that number of rows or more use COPY (500; false never).
    const { url, pool, copyRows, ...rest } = options;
    this.ownPool = !pool;
    this.pool = pool || new Pool({ connectionString: url || 'postgres://127.0.0.1:5432/postgres', ...rest });
  }

  async connect() {
    await this.pool.query('SELECT 1');
  }

  async close() {
    if (this.ownPool) await this.pool.end();
  }

  // The connection of the transaction of this async context, or the pool.
  get target() {
    const store = this.context.getStore();
    return store ? store.client : this.pool;
  }

  // Large inserts are made with COPY (binary): the keys the database gives are taken from the sequence of the table
  // first, in one query, so the rows are copied with them.
  async insert(meta, rows, options = {}) {
    const threshold = this.options.copyRows === undefined ? COPY_ROWS : this.options.copyRows;
    if (threshold === false || rows.length < threshold || options.conflict || rows.some(hasRaw)) {
      return super.insert(meta, rows, options);
    }
    const { pk } = meta;
    const target = this.target;
    // The keys the database gives (a composite one is given).
    const missing =
      !pk || pk.composite ? [] : rows.filter((row) => row[pk.attname] === undefined || row[pk.attname] === null);
    if (missing.length) {
      const { rows: keys } = await target.query(
        'SELECT nextval(pg_get_serial_sequence($1, $2)) AS id FROM generate_series(1, $3)',
        [postgres.quoteTable(meta.table, meta.schema), pk.column, missing.length]
      );
      missing.forEach((row, i) => {
        row[pk.attname] = keys[i].id;
      });
    }
    const fields = meta.fields;
    const columns = fields.map((field) => field.column);
    // Values as they are (Dates, numbers...); json as its text (a string would be taken as JSON text).
    const json = fields.map((field) => field.dbType === 'json');
    const values = rows.map((row) =>
      fields.map((field, i) => {
        const value = row[field.attname];
        if (field.encrypted) return field.seal(value);
        return json[i] && value !== null && value !== undefined ? JSON.stringify(value) : value;
      })
    );
    await target.copyRows(meta.schema ? [meta.schema, meta.table] : [meta.table], columns, values);
    if (!pk || pk.composite) return rows.map(() => null);
    return rows.map((row) => {
      const key = this.dialect.decode(pk.dbType, row[pk.attname]);
      return pk.fromDb ? pk.fromDb(key) : key;
    });
  }

  // The tables of the schema in use by their names, and those of other schemas as 'schema.table'.
  async tables() {
    const rows = await this.query(
      `SELECT CASE WHEN schemaname = current_schema() THEN tablename ELSE schemaname || '.' || tablename END AS name
       FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')`,
      []
    );
    return rows.map((row) => row.name);
  }

  async query(sql, params) {
    return (await this.target.query(sql, params)).rows;
  }

  async execute(sql, params) {
    return (await this.target.query(sql, params)).rowCount;
  }

  forgetStatements() {
    if (typeof this.pool.forgetStatements === 'function') this.pool.forgetStatements();
  }

  // Queries do not wait for transactions: each transaction has its connection.
  run(fn) {
    return fn();
  }

  async transaction(fn, options) {
    const store = this.context.getStore();
    if (store) return super.transaction(fn, options);
    const client = await this.pool.connect();
    let failed = null;
    try {
      return await this.context.run({ client, depth: 0 }, async () => {
        await client.query('BEGIN');
        let result;
        try {
          result = await fn();
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        }
        await client.query('COMMIT');
        return result;
      });
    } catch (err) {
      failed = err;
      throw err;
    } finally {
      // A connection whose ROLLBACK or COMMIT failed is not reused.
      client.release(failed && client.connection.transactionStatus !== 'I' ? failed : undefined);
    }
  }

  savepoint(name) {
    return this.execute(`SAVEPOINT ${name}`, []);
  }

  releaseSavepoint(name) {
    return this.execute(`RELEASE SAVEPOINT ${name}`, []);
  }

  rollbackToSavepoint(name) {
    return this.execute(`ROLLBACK TO SAVEPOINT ${name}`, []);
  }
}

module.exports = { PostgresBackend };
