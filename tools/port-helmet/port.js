// Ports helmet's tests (MIT) to packages/http/test/helmet/upstream: they check @xufa/http/helmet (its own implementation
// of helmet's API) as they check helmet. Its tests are TypeScript on node:test, made modules of JavaScript (types out)
// and tests of @xufa/test:
// - node:test's describe and it are @xufa/test's; t.mock.method() is test/helmet/support's mockMethod(), put back after
//   each test; supertest is @xufa/test/supertest;
// - `..` is @xufa/http/helmet, and each middleware of `../middlewares/<name>` its export of lib/helmet.js;
// - skipped, with the reason (SKIPPED): tests of helmet's own repository (its sources, and its package built and
//   installed in projects of TypeScript).
//
// node tools/port-helmet/port.js <helmet>  (a checkout of github.com/helmetjs/helmet at a tag)
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const [helmet] = process.argv.slice(2);
if (!helmet) {
  console.error('Usage: node tools/port-helmet/port.js <helmet>');
  process.exit(1);
}
const TESTS = path.join(import.meta.dirname, '../../packages/http/test/helmet');
const UPSTREAM = path.join(TESTS, 'upstream');
const SKIPPED = {
  'source-files.test.ts': "it checks the characters of helmet's own source files",
  'project-setups.test.ts':
    "it builds helmet's package with npm and type-checks projects of TypeScript that install it",
};

const camel = (name) => name.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());

function transpile(source, file) {
  return ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
}

function port(source, name) {
  let code = transpile(source.replace(/\r\n/g, '\n'), name);
  code = code.replace(/from "node:test";/g, "from '@xufa/test';");
  code = code.replace(/from "supertest";/g, "from '@xufa/test/supertest';");
  code = code.replace(/from "\.\/helpers";/g, "from './helpers.js';");
  code = code.replace(/from "\.\.";/g, "from '../../../helmet.js';");
  // A middleware's module: its default (and named) exports are lib/helmet.js's.
  code = code.replace(
    /import (\w+)(?:, \{([^}]*)\})? from "\.\.\/middlewares\/([\w-]+)";/g,
    (whole, local, named, dir) => {
      const names = [camel(dir) === local ? local : `${camel(dir)} as ${local}`];
      if (named)
        names.push(
          ...named
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        );
      return `import { ${names.join(', ')} } from '../../../lib/helmet.js';`;
    }
  );
  if (code.includes('t.mock.method(')) {
    code = code.replace(/(\w+)\.mock\.method\(/g, 'mockMethod(');
    // (node:test gives a test its context t; @xufa/test reads a parameter as done: mockMethod needs no t.)
    code = code
      .replace(/, \(t\) => \{/g, ', () => {')
      .replace(/\(t\) => mockMethod/g, '() => mockMethod')
      .replace(/mockWarn\(t\)/g, 'mockWarn()');
    code = `import { afterEach } from '@xufa/test';\nimport { mockMethod, restoreMocks } from '../support/node-test-mock.js';\n${code}\nafterEach(restoreMocks);\n`;
  }
  return `// Ported from helmet's test/${name} (MIT License) by tools/port-helmet/port.js: do not edit, change the tool.\n${code}`;
}

fs.rmSync(UPSTREAM, { recursive: true, force: true });
fs.mkdirSync(UPSTREAM, { recursive: true });
let count = 0;
for (const name of fs.readdirSync(path.join(helmet, 'test'))) {
  if (!name.endsWith('.ts') || SKIPPED[name]) continue;
  const target = path.join(UPSTREAM, name.replace(/\.ts$/, '.js'));
  fs.writeFileSync(target, port(fs.readFileSync(path.join(helmet, 'test', name), 'utf8'), name));
  if (name.endsWith('.test.ts')) count += 1;
}
fs.writeFileSync(path.join(UPSTREAM, 'skipped.json'), `${JSON.stringify(SKIPPED, null, 2)}\n`);
fs.copyFileSync(path.join(helmet, 'LICENSE'), path.join(TESTS, 'LICENSE.helmet'));
console.log(`port-helmet: ${count} test files of helmet in ${path.relative(process.cwd(), UPSTREAM)}`);
