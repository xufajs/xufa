// Ports the test suite of ws (mocha and node:assert) to @xufa/websocket (vyntra). The files are copied to
// packages/websocket/test/ws with their requires rewritten (the package, its lib), mocha's before/after renamed, and
// this.skip() as done.skip() (vyntra gives the test context on the done callback); the fixtures (certificates) and
// the helpers (duplex-pair.js) are copied as they are. The tests themselves are not changed.
//
// With a checkout of @fastify/websocket too, its tests (node:test) are converted by tools/node-test-to-vyntra to
// packages/websocket/test/fastify, with fastify as @xufa/http, the plugin as lib/plugin.js and ws as the package.
//
// node tools/port-ws/port.js <ws> [<fastify-websocket>]
//   (checkouts of github.com/websockets/ws and github.com/fastify/fastify-websocket)
const fs = require('node:fs');
const path = require('node:path');

const [ws, fastifyWebsocket] = process.argv.slice(2);
if (!ws) {
  console.error('Usage: node tools/port-ws/port.js <ws> [<fastify-websocket>]');
  process.exit(1);
}
const PACKAGE = path.join(__dirname, '../../packages/websocket');
const TESTS = path.join(PACKAGE, 'test/ws');

function port(text) {
  let out = text.replace(/\r\n/g, '\n');
  out = out
    .replace(/require\((['"])\.\.\1\)/g, "require('../..')")
    .replace(/require\((['"])\.\.\/lib\/([\w-]+)\1\)/g, "require('../../lib/$2')")
    .replace(/(^|[^\w.])before\(/g, '$1beforeAll(')
    .replace(/(^|[^\w.])after\(/g, '$1afterAll(')
    // it(...).timeout(ms) of mocha: the timeout as the last argument of it().
    .replace(/\}\)\.timeout\((\d+)\);/g, '}, $1);')
    // The certificates, by a path from the root of ws (where mocha runs): here, test/ws/fixtures.
    .replace(/(['`])test\/fixtures\//g, '$1test/ws/fixtures/');
  // Every this.skip() of ws is in a test of a done callback.
  const skips = (out.match(/this\.skip\(\)/g) || []).length;
  out = out.replace(/this\.skip\(\)/g, 'done.skip()');
  return { text: out, skips };
}

fs.rmSync(TESTS, { recursive: true, force: true });
fs.mkdirSync(path.join(TESTS, 'fixtures'), { recursive: true });
let files = 0;
let skips = 0;
for (const name of fs.readdirSync(path.join(ws, 'test'))) {
  const source = path.join(ws, 'test', name);
  if (name === 'fixtures') {
    for (const fixture of fs.readdirSync(source)) {
      fs.copyFileSync(path.join(source, fixture), path.join(TESTS, 'fixtures', fixture));
    }
  } else if (name.endsWith('.test.js') || name === 'duplex-pair.js') {
    const ported = port(fs.readFileSync(source, 'utf8'));
    fs.writeFileSync(path.join(TESTS, name), ported.text);
    files += 1;
    skips += ported.skips;
  }
}
console.log(`ws: ${files} files, ${skips} skips as done.skip()`);

if (fastifyWebsocket) {
  const { convert } = require('../node-test-to-vyntra/convert'); // eslint-disable-line global-require
  const to = path.join(PACKAGE, 'test/fastify');
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(to, { recursive: true });
  let count = 0;
  let todos = 0;
  for (const name of fs.readdirSync(path.join(fastifyWebsocket, 'test')).filter((file) => file.endsWith('.test.js'))) {
    const source = fs.readFileSync(path.join(fastifyWebsocket, 'test', name), 'utf8').replace(/\r\n/g, '\n');
    const converted = convert(source, name);
    todos += converted.todos.length;
    const code = converted.code
      .replace(/require\((['"])fastify\1\)/g, "require('@xufa/http')")
      .replace(/require\((['"])\.\.\1\)/g, "require('../../lib/plugin')")
      .replace(/require\((['"])ws\1\)/g, "require('../..')")
      // t.after() left in helpers outside the tests (the converter rewrites those inside): they are given the
      // context of vyntra, whose onTestFinished() is node:test's after().
      .replace(/\bt\.after\(/g, 't.onTestFinished(');
    fs.writeFileSync(path.join(to, name), code);
    count += 1;
  }
  console.log(`@fastify/websocket: ${count} files, ${todos} TODOs`);
}
