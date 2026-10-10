# @xufa/pg

A PostgreSQL driver with no dependencies, with the API of [pg](https://node-postgres.com) (node-postgres) for what
applications use: `Client`, `Pool`, `query(text, values)`. The PostgreSQL backend of [@xufa/orm](../orm) is made with
it.

```js
import { Pool } from '@xufa/pg';

const pool = new Pool({ connectionString: 'postgres://user:password@localhost:5432/app', max: 10 });

const { rows } = await pool.query('SELECT id, name FROM users WHERE name ILIKE $1', ['a%']);

const client = await pool.connect(); // a connection of its own, for a transaction
try {
  await client.query('BEGIN');
  await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [100, 1]);
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}
await pool.end();
```

- `Client(config)`: `connect()`, `query(text, values)` or `query({ text, values, rowMode: 'array' })`, `end()`
  (after the queries already sent, which the server runs; new ones are refused), `escapeIdentifier()` and
  `escapeLiteral()` (also exported); events `notice`, `notification` (LISTEN/NOTIFY), `error`, `end`. A text of
  several statements runs as a simple query (it may have several statements: their results are an array).
- `Pool(config)`: `query()`, `connect()` (a `PoolClient`: `query()`, `release(err)`), `end()` (it waits for the queries
  sent and for the clients given by `connect()` to be released), `totalCount`, `idleCount`, `waitingCount`; options
  `max` (10), `idleTimeoutMillis` (10000) and `acquireTimeoutMillis` (how long a query or `connect()` waits for a
  connection, free or being opened; 0, the default, for no limit; past it, an error of code `ACQUIRE_TIMEOUT`).
  `pool.openConnection(options)` opens its connections: it can be replaced. `using client = await pool.connect()`
  releases the client at the end of its block, and `await using` ends a `Client` or a `Pool` (explicit resource
  management).
- Config: a connection string, or `host` (a unix socket by its directory: `/var/run/postgresql`), `port`, `user`,
  `password` (both can be functions, sync or async, asked for every connection: tokens of AWS RDS IAM...),
  `database`, `ssl` (true or the options of `tls.connect`), `application_name`, `options`, `connectionTimeoutMillis`
  (to connect and log in: 30000, 0 for no limit), `statement_timeout`, `lock_timeout`,
  `idle_in_transaction_session_timeout`, `types` (parsers by oid, as pg's `setTypeParser`; those types are read as
  text; a parser that throws fails its query, not the connection), `prepare` (false not to prepare statements),
  `binary` (false to use only the text format).
- Connection strings are read as libpq reads them: `postgres://user:password@host:port/database?...` with `host`,
  `port`, `dbname`, `user`, `password`, `application_name`, `options` and `connect_timeout` (seconds); `sslmode`
  with its meaning in libpq (`disable`, `allow`, `prefer`: TLS when the server has it, `require`: encrypted without
  checking the certificate, unless `sslrootcert` is given, `verify-ca`: the chain, `verify-full`: the chain and the
  host; and pg's `no-verify`), `ssl=true|false`, `sslcert`, `sslkey`, `sslrootcert` (files; `system` for the CAs of
  the system) and `sslpassword`. The `PG*` variables are read too: `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`,
  `PGDATABASE`, `PGAPPNAME`, `PGOPTIONS`, `PGCONNECT_TIMEOUT`, `PGSSLMODE`, `PGSSLCERT`, `PGSSLKEY`, `PGSSLROOTCERT`.
- TLS: the certificate is checked against the host (an IP address too), and data a server sends before TLS is set up
  is refused (as libpq does since CVE-2021-23222).
- COPY, on `Client`, `PoolClient` and `Pool` (which takes a connection for it):
  - `forgetStatements()`: after changes of the schema (tables or types dropped and made again), the statements
    prepared are prepared again (each connection closes them before its next query; queries in a transaction then
    find the new types, instead of failing).
  - `copyRows(table, columns, rows)`: loads rows (arrays, or objects by column) and gives their number (the table is
    `'schema.table'`, or `[schema, table]` for names with dots). The types
    of the columns are read from the table, and the rows go in the binary format of COPY (the server parses
    nothing) when every column has a binary encoder (numbers, booleans, text, json and jsonb, dates and timestamps,
    bytea, uuid, and arrays of them), in the text format otherwise (numeric...).
  - `copyFrom(sql, data)`: `COPY ... FROM STDIN` with data in the format of the COPY (a Buffer, a string, or an
    iterable or async iterable of them); `{ rowCount }`. An error of the data fails the COPY (nothing is copied).
  - `copyTo(sql)`: `COPY ... TO STDOUT` as an async iterator of Buffers (the socket waits while too much is unread).
- Cancelling: `query({ text, values, signal })` with an AbortSignal, or `timeout` (milliseconds; `query_timeout` for
  every query of a client or pool), rejects at once (`AbortError`, or the code `QUERY_TIMEOUT`) and asks the server
  to stop the query (CancelRequest). Such a query has its connection to itself (it is not pipelined), so the cancel
  stops it and no other.
- Authentication: SCRAM-SHA-256 (bound to the TLS channel, SCRAM-SHA-256-PLUS, when the server offers it), MD5 and
  cleartext passwords, and OAuth tokens (`oauthBearerToken`, a string or a function: OAUTHBEARER of PostgreSQL 18).
  As libpq: `require_auth` names the methods the server may ask for (`scram-sha-256`, `password,md5`, `!password`,
  `none`...) and `channel_binding` (`prefer` by default, `require`, `disable`) whether SCRAM is bound to the channel
  (with `require`, a server that asks for a password instead is refused, without sending it). Every request of the
  server is checked before it is answered, a server that asks twice is refused, and so is one that makes the
  connection usable without authenticating it. From the config, the connection string or `PGREQUIREAUTH` and
  `PGCHANNELBINDING`.
- Several hosts: `host` and `port` as lists (`'db1,db2'`, arrays, or `postgres://u@db1:5432,db2:5433/app`) are tried
  in order until one connects; `target_session_attrs` (`read-write`, `read-only`, `primary`, `standby`,
  `prefer-standby`) skips those that are not what is asked for (read from what PostgreSQL 14 and later report, or
  asked to older servers), and `load_balance_hosts=random` tries them in a random order. Each connection of a pool
  finds its host.
- Describing: `query({ text, describe: true })` gives `{ params, fields }`, the types (oids) of the parameters and the
  columns of a text, without running it.
- Tracing: `node:diagnostics_channel` with the channels of pg: `pg:query`, `pg:connection` and `pg:pool:connect`
  (tracing channels: their contexts have the query, the client and its result or error) and `pg:pool:release` and
  `pg:pool:remove`. Nothing is made when no one subscribes.
- Errors: `DatabaseError`, with the fields of pg (`code`, the SQLSTATE: `23505` for unique violations; `detail`,
  `constraint`, `table`...), and `ConnectionError`.

## Types

Floats are exact also in the text format of servers before PostgreSQL 12 (the connection sets
`extra_float_digits` to 3 there). Values are parsed as in pg: integers and floats are numbers, `numeric` a string, `boolean`, `json` and `jsonb`, `bytea`
(Buffers), `timestamptz` (Dates), `date` and `timestamp` (local Dates), arrays of them, and other types are strings.
**Unlike pg, `bigint` (int8) is a number when it is a safe integer** (a bigint otherwise; pg gives strings).
Parameters: strings, numbers, bigints, booleans, Dates, Buffers (binary), arrays (PostgreSQL arrays), objects (JSON)
and values with `toPostgres()`.

## Performance

- Queries are prepared once per connection the second time their text runs (named statements by their text, up to
  1000; those prepared before a change of their tables are prepared again): after that, only their values are sent.
  The first time, a query runs as in pg (unnamed, or a simple query without values), so texts that run once (with
  their values written in them, as Sequelize does) do not fill the cache of statements. Queries without values are
  prepared too, except texts of several statements, which run as simple queries (as in pg).
- Prepared queries send their parameters and read their results in the binary format for the types that have it
  (integers, floats, booleans, timestamps, dates, bytea, uuid): the server neither formats nor parses them as text,
  and the client reads them with one call. `binary: false` turns it off.
- Queries are pipelined: a Pool sends the queries of `pool.query()` to the least busy connection without waiting for
  the ones before (pg runs one query at a time on a connection), and opens connections only when all are busy.
- Values are parsed from the bytes of the rows (numbers and dates without making strings), and rows are made by a
  function compiled for their columns.

`node bench/postgres.js` compares it with pg on a server of yours.

## Tests

The tests that need a server use `XUFA_PG_URL` (`postgres://xufa:xufa@127.0.0.1:5432/xufa_test` by default, and `off`
to skip them) and only touch the tables they create.

## License

MIT.
