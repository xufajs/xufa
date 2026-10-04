// @xufa/pg: a PostgreSQL driver with no dependencies, with the API of pg (node-postgres): Client, Pool, query().
// Queries that run again are prepared once per connection, and the queries of a pool are pipelined.
const { Client, Pool, PoolClient, parseConfig } = require('./lib/client');
const { Connection } = require('./lib/connection');
const types = require('./lib/types');
const copy = require('./lib/copy');
const errors = require('./lib/errors');

const { escapeIdentifier, escapeLiteral } = types;

module.exports = {
  Client,
  Pool,
  PoolClient,
  Connection,
  parseConfig,
  escapeIdentifier,
  escapeLiteral,
  types,
  copy,
  ...errors,
};
