// A server of the benchmark: node express/server.js <express | xufa> <port>. Prints "ready" once it listens.
const { build } = require('./app');

const [name, port] = process.argv.slice(2);
// eslint-disable-next-line global-require -- the implementation measured, by name
// (BENCH_SAME: Express in both places, express.js --same.)
const express = name === 'xufa' && !process.env.BENCH_SAME ? require('@xufa/express') : require('express');
const app = build(express);
const server = app.listen(Number(port), '127.0.0.1', () => process.stdout.write('ready\n'));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.stdin.on('end', () => process.exit(0));
process.stdin.resume();
