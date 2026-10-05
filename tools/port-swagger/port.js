// Ports @fastify/swagger (MIT) to @xufa/openapi: its library as it is (lib/, but lib/xufa and lib/ui.js, ours), with the
// packages it needs replaced by lib/xufa (json-schema-resolver, rfdc, yaml: @xufa/yaml); its examples; and its tests
// (node:test), converted by tools/node-test-to-vyntra with fastify as @xufa/http. index.js is ours (it marks the
// plugin as fastify-plugin does), and so are test/xufa and test/shims.
//
// node tools/port-swagger/port.js <fastify-swagger>  (a checkout of github.com/fastify/fastify-swagger)
const fs = require('node:fs');
const path = require('node:path');
const { convert } = require('../node-test-to-vyntra/convert');

const [swagger] = process.argv.slice(2);
if (!swagger) {
  console.error('Usage: node tools/port-swagger/port.js <fastify-swagger>');
  process.exit(1);
}
const PACKAGE = path.join(__dirname, '../../packages/openapi');
const version = JSON.parse(fs.readFileSync(path.join(swagger, 'package.json'), 'utf8')).version;

// LF, as the repository keeps it (a checkout on Windows may have made it CRLF).
const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const relative = (fromFile, target) => {
  const rel = path.relative(path.dirname(fromFile), target).replace(/\\/g, '/');
  return rel.startsWith('.') ? rel : `./${rel}`;
};
const requireOf = (name) => new RegExp(`require\\((['"])${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\1\\)`, 'g');

// The files of a folder, by their path relative to it.
function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full, base) : [path.relative(base, full)];
  });
}

// --- The library.
const LIB = path.join(PACKAGE, 'lib');
for (const entry of fs.existsSync(LIB) ? fs.readdirSync(LIB) : []) {
  if (entry !== 'xufa' && entry !== 'ui.js') fs.rmSync(path.join(LIB, entry), { recursive: true, force: true });
}
let libFiles = 0;
for (const file of walk(path.join(swagger, 'lib'))) {
  const target = path.join(LIB, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const code = read(path.join(swagger, 'lib', file))
    .replace(
      requireOf('json-schema-resolver'),
      `require('${relative(target, path.join(LIB, 'xufa/json-schema-resolver'))}')`
    )
    .replace(/require\((['"])rfdc\1\)\(\{[^)]*\}\)/g, `require('${relative(target, path.join(LIB, 'xufa/clone'))}')`)
    .replace(requireOf('yaml'), `require('${relative(target, path.join(LIB, 'xufa/yaml'))}')`);
  const left = code.match(/require\((['"])(?!\.|node:)[^'"]+\1\)/g);
  if (left) console.warn(`lib/${file}: requires left: ${left.join(', ')}`);
  fs.writeFileSync(target, code);
  libFiles += 1;
}
fs.copyFileSync(path.join(swagger, 'LICENSE'), path.join(PACKAGE, 'LICENSE.fastify-swagger'));

// --- The examples (the tests use them).
const EXAMPLES = path.join(PACKAGE, 'examples');
fs.rmSync(EXAMPLES, { recursive: true, force: true });
for (const file of walk(path.join(swagger, 'examples'))) {
  const target = path.join(EXAMPLES, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const text = read(path.join(swagger, 'examples', file));
  fs.writeFileSync(
    target,
    file.endsWith('.js')
      ? text.replace(requireOf('fastify'), "require('@xufa/http')").replace(requireOf('../index'), "require('..')")
      : text
  );
}

// --- The tests: test/xufa and test/shims are ours.
const TESTS = path.join(PACKAGE, 'test');
for (const entry of fs.existsSync(TESTS) ? fs.readdirSync(TESTS) : []) {
  if (!['xufa', 'shims', 'types'].includes(entry)) fs.rmSync(path.join(TESTS, entry), { recursive: true, force: true });
}
let testFiles = 0;
let todos = 0;
for (const file of walk(path.join(swagger, 'test'))) {
  // The test of ESM loads the plugin with node:test from a .mjs: test/xufa has ours.
  if (file.startsWith(`esm${path.sep}`) || !file.endsWith('.test.js')) continue;
  const target = path.join(TESTS, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const converted = convert(read(path.join(swagger, 'test', file)), path.basename(file));
  todos += converted.todos.length;
  for (const todo of converted.todos) console.log(`  TODO test/${file}: ${todo}`);
  const code = converted.code
    .replace(requireOf('fastify'), "require('@xufa/http')")
    .replace(
      requireOf('fastify/lib/errors'),
      `require('${relative(target, path.join(TESTS, 'shims/fastify-errors'))}')`
    )
    .replace(requireOf('@fastify/swagger'), `require('${relative(target, PACKAGE)}')`);
  fs.writeFileSync(target, fixups(file.replace(/\\/g, '/'), code));
  testFiles += 1;
}

// Changes of single tests that the conversion cannot make.
function fixups(file, code) {
  if (file !== 'spec/openapi/route.test.js') return code;
  // node's loose deepEqual ignores symbol keys, and toEqual compares them: the parameters of cookies (which keep a
  // symbol of the plugin) are compared as JSON, as deepEqual compared them.
  const start = code.indexOf("test('cookie and query with serialization type'");
  if (start < 0) throw new Error(`${file}: the fixup of the parameters no longer applies`);
  let fixed = code;
  for (const name of ['cookiesPath', 'querystringPath']) {
    const assertion = `expect(${name}.parameters).toEqual([`;
    const from = fixed.indexOf(assertion, start);
    const end = fixed.indexOf('\n  ])', from);
    if (from < 0 || end < 0) throw new Error(`${file}: the fixup of ${name} no longer applies`);
    fixed =
      fixed.slice(0, from) +
      `expect(asJson(${name}.parameters)).toEqual(asJson([` +
      fixed.slice(from + assertion.length, end) +
      '\n  ]))' +
      fixed.slice(end + '\n  ])'.length);
  }
  return fixed.replace(
    "'use strict'\n",
    "'use strict'\n\nconst asJson = (value) => JSON.parse(JSON.stringify(value))\n"
  );
}
console.log(`@fastify/swagger ${version}: ${libFiles} files of lib, ${testFiles} test files, ${todos} TODOs`);
