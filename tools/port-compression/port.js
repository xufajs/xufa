// Ports compression's tests (MIT) to packages/http/test/compression/upstream: they check @xufa/http/compression (its
// own implementation of compression's API) as they check compression. Its test file (mocha), made a test of
// @xufa/test:
// - require('..') is @xufa/http/compression; supertest is @xufa/test/supertest; after, bytes and safe-buffer are
//   test/compression/support's;
// - mocha's hooks before() and after() are beforeAll() and afterAll() (the package after's after() stays).
//
// node tools/port-compression/port.js <compression>  (a checkout of github.com/expressjs/compression at a tag)
import fs from 'node:fs';
import path from 'node:path';

const [compression] = process.argv.slice(2);
if (!compression) {
  console.error('Usage: node tools/port-compression/port.js <compression>');
  process.exit(1);
}
const TESTS = path.join(import.meta.dirname, '../../packages/http/test/compression');
const UPSTREAM = path.join(TESTS, 'upstream');

const REQUIRES = {
  '..': '../../../compression.js',
  supertest: '@xufa/test/supertest',
  after: '../support/after.js',
  bytes: '../support/bytes.js',
  'safe-buffer': '../support/safe-buffer.js',
};

function port(source, name) {
  let code = source.replace(/\r\n/g, '\n');
  code = code.replace(/require\('([^']+)'\)/g, (whole, id) => (REQUIRES[id] ? `require('${REQUIRES[id]}')` : whole));
  code = code.replace(/^(\s*)before\(/gm, '$1beforeAll(').replace(/^(\s*)after\(function/gm, '$1afterAll(function');
  return `// Ported from compression's test/${name} (MIT License) by tools/port-compression/port.js: do not edit, change the tool.\n${code}`;
}

fs.rmSync(UPSTREAM, { recursive: true, force: true });
fs.mkdirSync(UPSTREAM, { recursive: true });
let count = 0;
for (const name of fs.readdirSync(path.join(compression, 'test'))) {
  if (!name.endsWith('.js')) continue;
  const source = fs.readFileSync(path.join(compression, 'test', name), 'utf8');
  fs.writeFileSync(path.join(UPSTREAM, name.replace(/\.js$/, '.test.js')), port(source, name));
  count += 1;
}
fs.copyFileSync(path.join(compression, 'LICENSE'), path.join(TESTS, 'LICENSE.compression'));
console.log(`port-compression: ${count} files of compression's tests in ${path.relative(process.cwd(), UPSTREAM)}`);
