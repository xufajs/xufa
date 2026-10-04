# Benchmarks

Three kinds, from the whole server to one function:

| Script       | Measures                                                                                   | Use it to                                |
| ------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `run.js`     | HTTP over the loopback: requests per second, latency and server processor time per request | Compare the servers as clients see them  |
| `inproc.js`  | The request handler called in the process, without sockets                                 | Compare the cost of the frameworks alone |
| `micro/*.js` | One library against the one it replaces (logger, router, serializer)                       | Work on a package                        |

Every framework and scenario runs in a process of its own, so that no measure inherits the optimizations (or the
garbage) of another. The scenarios are in `scenarios/`: each one builds the same routes for xufa and fastify (and
`node:http` when it can), and its response is checked before it is measured.

## HTTP: `run.js`

```sh
node bench/run.js [--scenarios hello,big-json] [--frameworks xufa,fastify,node] [--duration 10] [--warmup 3]
                  [--rounds 3] [--connections 100] [--pipelining 10] [--workers 4] [--out results/name]
```

autocannon loads each server, the frameworks taking turns round after round, and the median of the rounds is shown.

- **Use `--workers 4`** (or more): a single autocannon process saturates before the servers do.
- **Read the server processor time per request** (µs/req) as much as the requests per second: when the network or
  the client limits the throughput, all servers show the same requests per second, but not the same cost.
- **⚠ marks rounds more than 10% apart**: something else used the machine during the run; run it again. Close
  browsers and games, and prefer Linux: on Windows the loopback is slow and noisy (node:http alone costs about 20 µs a
  request there).
- `BENCH_SERVER_FLAGS='--no-turbo-inlining'` passes flags to the servers (V8 experiments).

`profile.js <framework> <scenario> <dir>` profiles one server under load (`--cpu-prof`): open the `.cpuprofile` in
Chrome's DevTools.

## In process: `inproc.js`

```sh
node bench/inproc.js [--scenarios ...] [--frameworks ...] [--duration 3] [--warmup 1] [--rounds 3] [--concurrency 32]
```

The requests are given to the request listener of the server with node's own `IncomingMessage` and
`ServerResponse`, over sockets that discard what is written: no network, no HTTP parsing. The difference between a
framework and `node:http` here is the cost of the framework. Rounds more than 10% apart are marked ⚠.

## Libraries: `micro/`

```sh
node bench/micro/logger.js      # @xufa/logger against pino
node bench/micro/router.js      # @xufa/router against find-my-way
node bench/micro/serializer.js  # @xufa/serializer against fast-json-stringify and JSON.stringify
```

The serializers are measured as a response uses them: with `Buffer.byteLength()` of what they return, which makes
V8 flatten a string joined with `+` (a cost that `.length` would hide).

## PostgreSQL driver: `postgres.js`

```sh
node bench/postgres.js [--url postgres://xufa:xufa@127.0.0.1:5432/xufa_test] [--rounds 5] [--scale 1] [--only a,b]
                       [--pool 10]
```

@xufa/pg against pg (node-postgres), both through a Pool of the same size, each round in a process of its own. The
report has two tables:

- **Driver-bound**: the server does little (small queries, a small table read again and again, values of 1 MB, many
  parameters), so the time is the driver's: encoding, decoding, the messages and the pool. These tell the drivers
  apart.
- **Server-bound** (`aggregate group by`, `update many`): PostgreSQL scans or rewrites 10,000 rows per query, on a
  table just made and vacuumed. Both drivers wait for the server; equal results there are expected.

## ORMs: `orm.js`

```sh
node bench/orm.js [--dialects postgres,sqlite] [--rounds 5] [--orms xufa,sequelize,sequelize-xufa-pg,xufa-sequelize]
```

@xufa/orm against Sequelize 6, and the same Sequelize code on @xufa/sequelize, on PostgreSQL and SQLite.

## Results

`results/` keeps the reports of runs (`--out`): a `.md` table and a `.json` with every round and the machine.
