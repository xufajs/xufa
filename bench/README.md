# Benchmarks

Three kinds, from the whole server to one function:

| Script       | Measures                                                                                   | Use it to                                |
| ------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `run.js`     | HTTP over the loopback: requests per second, latency and server processor time per request | Compare the servers as clients see them  |
| `inproc.js`  | The request handler called in the process, without sockets                                 | Compare the cost of the frameworks alone |
| `micro/*.js` | One library against the one it replaces (logger, router, serializer, jwt...)               | Work on a package                        |

Every framework and scenario runs in a process of its own, so that no measure inherits the optimizations (or the
garbage) of another. The scenarios are in `scenarios/`: each one builds the same routes for xufa and fastify (and
`node:http` when it can), and its response is checked before it is measured. The scenarios `openapi-*` build their
routes from an OpenAPI document with `openapi.operations` of `@xufa/openapi` (`lib/openapi-app.js`), on each framework,
with and without `validateResponses`; their reports are `results/openapi-linux-1` and `-2`.

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
node bench/micro/expression.js  # @xufa/expression against jexl, expr-eval, filtrex, SandboxJS and new Function
node bench/micro/template.js    # @xufa/template against Handlebars, Mustache, Nunjucks, Eta and EJS
node bench/micro/jwt.js         # @xufa/jwt against jsonwebtoken
node bench/micro/jwt-async.js   # node:crypto signing and verifying, synchronous against in the thread pool
node bench/micro/marshal.js     # @xufa/marshal against JSON, v8.serialize (and the serializer of Agentic, given its path)
node bench/micro/websocket.js   # @xufa/websocket against ws, each without and with bufferutil
```

`expression.js` and `template.js` take `[ms per measure] [rounds]` (1000 and 3) and run each engine and case in a process
of its own, the median of the rounds shown; each result is checked (against JavaScript, or against the output of
@xufa/template) before it is measured. Two measures: compiled once and run, and compiled and run each time (a one-off
expression or template). `new Function` is no sandbox: the bound of what can be done. Expressions and templates run on four contexts of different values in turn,
so that V8 does not fold them on values that never change. Eta
and EJS run the JavaScript of their templates (no sandbox either); Handlebars, Mustache and Nunjucks, as
@xufa/template, do not.

The serializers are measured as a response uses them: with `Buffer.byteLength()` of what they return, which makes
V8 flatten a string joined with `+` (a cost that `.length` would hide).

`jwt.js` signs, verifies and decodes the same claims with the same keys (as PEM text, as most applications give
them, and a KeyObject for RS256), with the options of a real token (`expiresIn`, `issuer`, `audience`).

`websocket.js` takes `[rounds] [ms per measure]` (3 and 2000): messages echoed over the loopback, 64 in flight, by a
client and a server of the same library, each library without bufferutil (`WS_NO_BUFFER_UTIL`) and with it. Every echo of the warm-up is checked against what was sent, and a library
that corrupts the payload (or fails) is shown as `FAILED` and makes the run exit with 1. Two cases go over several
chunks of the socket: 1 MB sent in 16 fragments of 64 KB (echoed whole), and 256 KB of random bytes with deflate
(they do not compress).

## Views: `view.js`

```sh
node bench/view.js [--rows 10000,50000,200000] [--requests 7] [--modes string,stream]
```

A table of `rows` customers in a layout, sent by `reply.view` (the plugin of @xufa/template) on a real server: rendered
whole (`string`) or in chunks made as the client reads them (`stream`). Each mode and size runs in a server of its own;
the parent takes the requests over the loopback and shows the median: the time to the first byte, the time of the whole
page, and the peak of the memory (rss) of the server over its start while it sends them.

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

## Latest results

On an Intel Core i7-13700H (20 threads) with Node.js 22.21.1: Windows 11, and Linux on the same machine (Ubuntu 26.04
on WSL2). The pages of the documentation show them as charts (`docs/benchmarks.html`, made by `pnpm docs`).

### HTTP: xufa / fastify

Requests a second of xufa over those of fastify 5.12.5 (more than 1: xufa is faster). In the process: `inproc.js`,
5 rounds of 2 s; over the loopback: `run.js`, 3 rounds of 6 s, 100 connections, pipelining 10. ⚠: rounds more than
10% apart.

| Scenario      | Linux, in the process | Linux, loopback | Windows, in the process | Windows, loopback |
| ------------- | --------------------: | --------------: | ----------------------: | ----------------: |
| big-json      |               1.96x ⚠ |           1.66x |                   1.66x |             1.39x |
| hello-schema  |               1.12x ⚠ |           1.19x |                   1.15x |             1.02x |
| hooks         |                 1.17x |           1.19x |                   1.17x |             0.97x |
| headers       |               1.24x ⚠ |           1.17x |                   1.24x |             1.05x |
| params        |               1.17x ⚠ |           1.16x |                   1.20x |             1.02x |
| post-json     |                 1.18x |           1.16x |                 1.15x ⚠ |             1.00x |
| text          |                 1.17x |           1.14x |                   1.17x |           1.01x ⚠ |
| async         |               1.12x ⚠ |           1.13x |                 1.20x ⚠ |             0.99x |
| many-routes   |                 1.18x |           1.13x |                   1.18x |             0.98x |
| hello         |                 1.18x |           1.11x |                   1.13x |             1.02x |
| plugins       |               1.16x ⚠ |           1.09x |                   1.19x |             1.01x |
| post-validate |                 1.21x |           1.09x |                   1.16x |           2.05x ⚠ |
| query         |                 1.12x |           1.09x |                   1.11x |           0.80x ⚠ |
| not-found     |               1.16x ⚠ |           1.06x |                   1.10x |             1.03x |
| error         |                 1.06x |           1.02x |                   0.98x |             0.92x |

Reports: `results/inproc-linux-2`, `results/full-linux-2` (Linux), `results/inproc-6`, `results/full-5` (Windows).

- **In the process**, xufa is ahead in every scenario on Linux and in all but `error` on Windows, where both spend
  most of the time in the stack trace that the handler's `new Error()` captures. Most of the lead on small responses
  comes from writing the head of responses without `res.writeHead()` (`fastHead`, on by default).
- **Over the loopback on Linux**, xufa is ahead in every scenario, and faster than `node:http` answering by hand on
  `hello` (118k against 115k requests a second).
- **Over the loopback on Windows**, the socket takes most of the time of a small response, and the two are about even
  on small responses (1.39x on a large JSON one); its last scenarios were noisy (⚠), so their numbers (0.80x,
  2.05x) say little.

### Linux from Windows

`pnpm bench:linux` runs a script of `bench/` in the Linux of WSL (a copy of the repository with Node.js for Linux, made
and kept up to date by it) and brings its report back to `results/` (see `tools/bench-linux`):

```sh
pnpm bench:linux inproc --rounds 5 --duration 2 --out results/inproc-linux-3
pnpm bench:linux run --duration 6 --warmup 2 --out results/full-linux-3
```

### The others

The latest report of each benchmark: `results/router-2` (@xufa/router and find-my-way), `results/logger-2` (@xufa/logger
and pino), `results/serializer-1` (@xufa/serializer, fast-json-stringify and `JSON.stringify`), `results/postgres-7`
(@xufa/pg and pg), `results/mongo-7` (@xufa/mongo and mongodb), `results/orm-8` (@xufa/orm and Sequelize),
`results/expression-4`, `results/template-5`, `results/view-1` (large pages) and `results/marshal-1` (@xufa/marshal, JSON, v8.serialize and the serializer of Agentic), `results/jwt-2` and `results/jwt-linux-2` (@xufa/jwt and
jsonwebtoken), `results/websocket-4` (@xufa/websocket and ws).

### JWT: @xufa/jwt / jsonwebtoken

Windows (`results/jwt-2`):

| Case                    | jsonwebtoken ops/s | @xufa/jwt ops/s | xufa / jsonwebtoken |
| ----------------------- | -----------------: | --------------: | ------------------: |
| HS256 sign              |             36,108 |         163,734 |               4.53x |
| HS256 verify            |             29,784 |         148,351 |               4.98x |
| HS256 decode            |            286,184 |         398,189 |               1.39x |
| RS256 sign              |              1,029 |           1,766 |               1.72x |
| RS256 verify            |             17,478 |          35,945 |               2.06x |
| RS256 verify, KeyObject |             35,549 |          36,278 |               1.02x |
| ES256 sign              |             10,911 |          31,912 |               2.92x |
| ES256 verify            |              8,478 |          13,442 |               1.59x |
| EdDSA sign              |                n/a |          25,127 |                 n/a |
| EdDSA verify            |                n/a |          10,123 |                 n/a |

Linux (`results/jwt-linux-2`, WSL2):

| Case                    | jsonwebtoken ops/s | @xufa/jwt ops/s | xufa / jsonwebtoken |
| ----------------------- | -----------------: | --------------: | ------------------: |
| HS256 sign              |             50,333 |         190,018 |               3.78x |
| HS256 verify            |             42,095 |         173,407 |               4.12x |
| HS256 decode            |            329,705 |         440,447 |               1.34x |
| RS256 sign              |              1,095 |           1,788 |               1.63x |
| RS256 verify            |             22,211 |          38,025 |               1.71x |
| RS256 verify, KeyObject |             36,709 |          37,537 |               1.02x |
| ES256 sign              |             13,049 |          33,934 |               2.60x |
| ES256 verify            |              9,028 |          13,077 |               1.45x |
| EdDSA sign              |                n/a |          27,347 |                 n/a |
| EdDSA verify            |                n/a |          10,098 |                 n/a |

The signatures are the same work (node:crypto); the difference is the key. jsonwebtoken tries every key given as
text as a PEM key first, which throws for a secret (two thirds of the time of HS256), and parses a PEM again on each
call. @xufa/jwt does not try what has no `-----BEGIN`, and keeps the KeyObjects of keys given as strings. With a
KeyObject, nothing is parsed by either: the same speed. Decoding (and so verifying) parses the header once and
splits the token once, where jws does each twice and three times. jsonwebtoken has no EdDSA.
