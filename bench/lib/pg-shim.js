// @xufa/pg with the interface Sequelize 6 uses of pg (its dialectModule): a Client with callback connect(), query()
// and end(), the parameterStatus events of client.connection, and types. @xufa/pg parses the values itself (binary
// when it can), so the type parsers Sequelize gives are not used, and those it asks for return values as they are.
// Values are those of pg: int8 and date are strings (@xufa/pg gives numbers or bigints, and Dates).
const { EventEmitter } = require('node:events');
const pg = require('@xufa/pg');

// With a callback it returns nothing (Sequelize promisifies end()).
function callback(promise, cb) {
  if (!cb) return promise;
  promise.then((result) => cb(null, result), cb);
  return undefined;
}

const asText = (value) => value;
const PG_TYPES = { 20: asText, 1082: asText };

class Client extends EventEmitter {
  constructor(config = {}) {
    super();
    const { types, ...options } = config;
    this.client = new pg.Client({ ...options, types: PG_TYPES });
    // Sequelize listens here for the parameters the server sends when connecting.
    this.connection = new EventEmitter();
    this._ending = false;
  }

  connect(cb) {
    const connecting = this.client.connect().then(() => {
      const { parameters } = this.client.connection;
      for (const parameterName of Object.keys(parameters)) {
        this.connection.emit('parameterStatus', { parameterName, parameterValue: parameters[parameterName] });
      }
      this.client.on('error', (err) => this.emit('error', err));
      this.client.on('end', () => this.emit('end'));
      this.client.on('notice', (notice) => this.emit('notice', notice));
    });
    return callback(connecting, cb);
  }

  query(text, values, cb) {
    if (typeof values === 'function') return callback(this.client.query(text), values);
    return callback(this.client.query(text, values), cb);
  }

  end(cb) {
    this._ending = true;
    return callback(this.client.end(), cb);
  }
}

const identity = (value) => value;
const types = {
  getTypeParser: () => identity,
  setTypeParser() {},
  arrayParser: { create: (value) => ({ parse: () => value }) },
};

module.exports = { Client, types, native: null };
