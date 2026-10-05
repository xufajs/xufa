// Ports js-yaml 4.1.0 (MIT) to @xufa/yaml: its library as it is (lib/, and index.js), and its test suite (mocha) to
// packages/yaml/test, where the requires of the tests reach the package as they reached js-yaml (the tree is kept).
// The files of the suites (00-units.js...) become *.test.js; mocha's before/after become beforeAll/afterAll. The
// library and the tests are not otherwise changed.
//
// node tools/port-yaml/port.js <js-yaml>  (a checkout of github.com/nodeca/js-yaml at the tag 4.1.0)
const fs = require('node:fs');
const path = require('node:path');

const [jsYaml] = process.argv.slice(2);
if (!jsYaml) {
  console.error('Usage: node tools/port-yaml/port.js <js-yaml>');
  process.exit(1);
}
const PACKAGE = path.join(__dirname, '../../packages/yaml');
const version = JSON.parse(fs.readFileSync(path.join(jsYaml, 'package.json'), 'utf8')).version;
if (version !== '4.1.0') console.warn(`js-yaml ${version}: the port is of 4.1.0`);

// LF, as the repository keeps it (a checkout on Windows may have made it CRLF): samples are compared byte by byte.
const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

function copy(from, to, transform = (text) => text, rename = (name) => name) {
  fs.mkdirSync(to, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    if (entry.isDirectory()) {
      count += copy(source, path.join(to, entry.name), transform);
    } else if (/\.(js|yml|yaml|txt|json)$/.test(entry.name)) {
      const text = entry.name.endsWith('.js') ? transform(read(source)) : read(source);
      fs.writeFileSync(path.join(to, rename(entry.name)), text);
      count += 1;
    } else {
      fs.copyFileSync(source, path.join(to, entry.name));
      count += 1;
    }
  }
  return count;
}

const mochaToVyntra = (text) =>
  text.replace(/(^|[^\w.])before\(/g, '$1beforeAll(').replace(/(^|[^\w.])after\(/g, '$1afterAll(');

fs.rmSync(path.join(PACKAGE, 'lib'), { recursive: true, force: true });
const lib = copy(path.join(jsYaml, 'lib'), path.join(PACKAGE, 'lib'));
fs.writeFileSync(
  path.join(PACKAGE, 'index.js'),
  `// @xufa/yaml: js-yaml ${version} (MIT, LICENSE.js-yaml), with no dependencies: YAML 1.2 load and dump.\n` +
    read(path.join(jsYaml, 'index.js'))
);
fs.copyFileSync(path.join(jsYaml, 'LICENSE'), path.join(PACKAGE, 'LICENSE.js-yaml'));

// The tests: kept as they are (test/types and test/xufa are ours, left alone).
const tests = path.join(PACKAGE, 'test');
for (const entry of fs.existsSync(tests) ? fs.readdirSync(tests) : []) {
  if (entry !== 'types' && entry !== 'xufa') fs.rmSync(path.join(tests, entry), { recursive: true, force: true });
}
const count = copy(path.join(jsYaml, 'test'), tests, mochaToVyntra, (name) =>
  /^\d\d-[\w-]+\.js$/.test(name) ? name.replace(/\.js$/, '.test.js') : name
);
console.log(`js-yaml ${version}: ${lib} files of lib, ${count} files of tests`);
