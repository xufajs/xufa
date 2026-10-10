// @xufa/pg: a PostgreSQL driver with no dependencies, with the API of pg (node-postgres): Client, Pool, query().
// Queries that run again are prepared once per connection, and the queries of a pool are pipelined.
import { Client, Pool, PoolClient, parseConfig } from './lib/client.js';
import { Connection } from './lib/connection.js';
import * as types from './lib/types.js';
import * as copy from './lib/copy.js';

const { escapeIdentifier, escapeLiteral } = types;

export * from './lib/errors.js';

export { Client, Pool, PoolClient, Connection, parseConfig, escapeIdentifier, escapeLiteral, types, copy };
