// Ports Express 5's tests (MIT) to packages/express/test/upstream: they check @xufa/express (its own implementation of
// Express's API) as they check Express. Its test files (mocha), test/support, test/fixtures, and the examples the
// acceptance tests run, made tests of @xufa/test:
// - requires of Express's root and lib point at the package's index and lib/utils.js;
// - mocha's hooks before() and after() are beforeAll() and afterAll() (the package after's after() stays); the
//   suite's context (this.app, this.env in hooks and tests) a context of the file (ctx); each file loads
//   test/support/env.js first (mocha's --require of it);
// - paths of fixtures given from the package's root; this.timeout() dropped, this.skip() a return;
// - supertest and after are the package's test/support/supertest.cjs (@xufa/test/supertest, with the paths of
//   supertest 6, that Express tests with) and after.cjs.
//
// node tools/port-express/port.js <express>  (a checkout of github.com/expressjs/express at a tag)
import fs from 'node:fs';
import path from 'node:path';

const [express] = process.argv.slice(2);
if (!express) {
  console.error('Usage: node tools/port-express/port.js <express>');
  process.exit(1);
}
const PACKAGE = path.join(import.meta.dirname, '../../packages/express');
const UPSTREAM = path.join(PACKAGE, 'test/upstream');
const INDEX = path.join(PACKAGE, 'index.js');
const UTILS = path.join(PACKAGE, 'lib/utils.js');
// The packages the tests require that are files of the package.
const SUPPORT = {
  supertest: path.join(PACKAGE, 'test/support/supertest.cjs'),
  after: path.join(PACKAGE, 'test/support/after.cjs'),
};

const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const relative = (fromFile, target) => {
  const rel = path.relative(path.dirname(fromFile), target).replace(/\\/g, '/');
  return rel.startsWith('.') ? rel : `./${rel}`;
};

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full, base) : [path.relative(base, full)];
  });
}

// Where a file of Express's checkout is in the package: its root and lib/express the package's index, lib/utils
// lib/utils.js, test and examples test/upstream.
function mapped(file) {
  const rel = path.relative(express, file).split(path.sep).join('/');
  const bare = rel.replace(/\.js$/, '');
  if (bare === '' || bare === 'index' || bare === 'lib/express') return INDEX;
  if (bare === 'lib/utils') return UTILS;
  if (rel.startsWith('test/')) return path.join(UPSTREAM, rel.slice(5));
  if (rel.startsWith('examples/')) return path.join(UPSTREAM, rel);
  return null;
}

// A file of Express's tests or examples: its relative requires pointing where their files are in the package, those
// of supertest and after at test/support, paths of fixtures given from the package's root.
function portFile(text, source, target) {
  return text
    .replace(/require\((['"])(\.[^'"]*)\1\)/g, (whole, quote, request) => {
      const to = mapped(path.resolve(path.dirname(source), request));
      return to ? `require('${relative(target, to)}')` : whole;
    })
    .replace(
      /require\((['"])(supertest|after)\1\)/g,
      (whole, quote, name) => `require('${relative(target, SUPPORT[name])}')`
    )
    .replace(/(['"])test\/fixtures\//g, '$1test/upstream/fixtures/');
}

// A test file of mocha as one of @xufa/test.
function portTest(text, target) {
  const ported = text
    .replace(/^\s*this\.timeout\(\d+\).*$\n?/gm, '')
    .replace(/this\.skip\(\)/g, 'return done() // (mocha: this.skip())')
    .replace(/^(\s*)(before|after)\((?=\s*(?:function|async|\())/gm, '$1$2All(')
    .replace(/\bthis\.(app|env)\b/g, 'ctx.$1');
  const env = `require('${relative(target, path.join(UPSTREAM, 'support/env.js'))}')\n`;
  const context = ported.includes('ctx.') ? '// (mocha: the context of the suites, this.)\nvar ctx = {}\n' : '';
  const strict = ported.match(/^'use strict'\n\n?/);
  const head = `${env}${context}\n`;
  return strict ? `'use strict'\n\n${head}${ported.slice(strict[0].length)}` : `${head}${ported}`;
}

// (Its contents, not the folder: a shell may be in it.)
if (fs.existsSync(UPSTREAM)) {
  for (const entry of fs.readdirSync(UPSTREAM)) fs.rmSync(path.join(UPSTREAM, entry), { recursive: true, force: true });
}
fs.mkdirSync(UPSTREAM, { recursive: true });
fs.writeFileSync(path.join(UPSTREAM, 'package.json'), '{\n  "type": "commonjs"\n}\n');

let tests = 0;
for (const file of walk(path.join(express, 'test'))) {
  const source = path.join(express, 'test', file);
  const isTest = file.endsWith('.js') && !file.startsWith('support') && !file.startsWith('fixtures');
  const target = path.join(UPSTREAM, isTest ? file.replace(/\.js$/, '.test.js') : file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (file.endsWith('.js') && !file.startsWith('fixtures')) {
    const text = portFile(read(source), source, target);
    fs.writeFileSync(target, isTest ? portTest(text, target) : text);
    if (isTest) tests += 1;
  } else {
    fs.copyFileSync(source, target);
  }
}
const used = new Set();
for (const file of walk(path.join(UPSTREAM, 'acceptance'))) {
  for (const [, example] of read(path.join(UPSTREAM, 'acceptance', file)).matchAll(
    /require\('\.\.\/examples\/([^/'"]+)/g
  )) {
    used.add(example);
  }
}
for (const example of used) {
  for (const file of walk(path.join(express, 'examples', example))) {
    const target = path.join(UPSTREAM, 'examples', example, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const source = path.join(express, 'examples', example, file);
    if (file.endsWith('.js')) fs.writeFileSync(target, portFile(read(source), source, target));
    else fs.copyFileSync(source, target);
  }
}
fs.copyFileSync(path.join(express, 'LICENSE'), path.join(UPSTREAM, 'LICENSE'));
console.log(`test/upstream: ${tests} files, ${used.size} examples`);
