// Ports multer's tests (MIT) to packages/http/test/multer/upstream: they check @xufa/http's multer (its own
// implementation of multer's API, on @xufa/http's parser of multipart bodies) as they check multer. Its test files
// (mocha) and test/files, made tests of @xufa/test:
// - require('../') is @xufa/http/multer; form-data is @xufa/http/form-data; the other packages its tests use are
//   test/multer/support's (deep-equal, fs-temp, rimraf, concat-stream, testdata-w3c-json-form), and express is @xufa/express;
// - mocha's hooks before() and after() are beforeAll() and afterAll(); this.timeout() dropped.
//
// node tools/port-multer/port.js <multer>  (a checkout of github.com/expressjs/multer at a tag)
import fs from 'node:fs';
import path from 'node:path';

const [multer] = process.argv.slice(2);
if (!multer) {
  console.error('Usage: node tools/port-multer/port.js <multer>');
  process.exit(1);
}
const TESTS = path.join(import.meta.dirname, '../../packages/http/test/multer');
const UPSTREAM = path.join(TESTS, 'upstream');

const REQUIRES = {
  '../': '../../../multer.js',
  'form-data': '../../../form-data.js',
  'deep-equal': '../support/deep-equal.js',
  'fs-temp': '../support/fs-temp.js',
  rimraf: '../support/rimraf.js',
  'concat-stream': '../support/concat-stream.js',
  'testdata-w3c-json-form': '../support/testdata-w3c-json-form.js',
  '../lib/remove-uploaded-files': '../support/remove-uploaded-files.js',
  express: '../../../../express/index.js',
};

function port(source, name) {
  let code = source.replace(/\r\n/g, '\n');
  code = code.replace(/require\('([^']+)'\)/g, (whole, id) => (REQUIRES[id] ? `require('${REQUIRES[id]}')` : whole));
  code = code.replace(/^(\s*)before\(/gm, '$1beforeAll(').replace(/^(\s*)after\(/gm, '$1afterAll(');
  code = code.replace(/^\s*this\.timeout\([^)]*\)\n/gm, '');
  // (Paths with the separator of the system: the tests look for '/folder-' in them.)
  code = code.replace(/indexOf\('\/([\w-]+)'\)/g, "indexOf(require('path').sep + '$1')");
  // (Test files end in .test.js; the helper keeps its name.)
  const header = `// Ported from multer's test/${name} (MIT License) by tools/port-multer/port.js: do not edit, change the tool.\n`;
  return header + code;
}

fs.rmSync(UPSTREAM, { recursive: true, force: true });
fs.mkdirSync(path.join(UPSTREAM, 'files'), { recursive: true });
const testDir = path.join(multer, 'test');
let count = 0;
for (const name of fs.readdirSync(testDir)) {
  const file = path.join(testDir, name);
  if (name === 'files') {
    for (const fixture of fs.readdirSync(file)) {
      fs.copyFileSync(path.join(file, fixture), path.join(UPSTREAM, 'files', fixture));
    }
    continue;
  }
  if (!name.endsWith('.js')) continue;
  const target = name === '_util.js' ? name : name.replace(/\.js$/, '.test.js');
  fs.writeFileSync(path.join(UPSTREAM, target), port(fs.readFileSync(file, 'utf8'), name));
  count += 1;
}
fs.copyFileSync(path.join(multer, 'LICENSE'), path.join(TESTS, 'LICENSE.multer'));
console.log(`port-multer: ${count} files of multer's tests in ${path.relative(process.cwd(), UPSTREAM)}`);
