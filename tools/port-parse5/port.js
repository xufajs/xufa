// Ports parse5 (MIT) and the part of entities it uses (BSD-2-Clause: decode and escape) to packages/html: their
// TypeScript made JavaScript modules (types out), imports of entities to the ported files. And parse5's tests (vitest)
// to packages/html/test/parse5, with its test utilities and its data (html5lib-tests, location info, serialization,
// parser feedback, sax, a huge page): vitest's API is @xufa/test's, its chai assert node:assert's; the tests run on
// parse5's default tree adapter only (the htmlparser2 one is another package).
//
// node tools/port-parse5/port.js <parse5> <entities> <html5lib-tests> <html5lib-tests-fork>
//   (checkouts of github.com/inikulin/parse5, github.com/fb55/entities at the tag parse5 asks for, and
//   github.com/html5lib/html5lib-tests and github.com/HTMLParseErrorWG/html5lib-tests, the fork with codes of parse
//   errors, at the commits parse5's submodules pin)
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const [parse5, entities, html5lib, fork] = process.argv.slice(2);
if (!parse5 || !entities || !html5lib || !fork) {
  console.error('Usage: node tools/port-parse5/port.js <parse5> <entities> <html5lib-tests> <html5lib-tests-fork>');
  process.exit(1);
}
const OUT = path.join(import.meta.dirname, '../../packages/html');
const LIB = path.join(OUT, 'lib');
const TESTS = path.join(OUT, 'test/parse5');
// (Written by hand, kept: chai's assert on node:assert, outdent.)
const SUPPORT = path.join(OUT, 'test/support');

// TypeScript to a JavaScript module, as it is (comments kept).
function transpile(source, file) {
  const { outputText } = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      isolatedModules: true,
      useDefineForClassFields: true,
      removeComments: false,
    },
  });
  return outputText;
}

// A link from one file to another, as an import writes it.
function linkTo(from, to) {
  const link = path.relative(path.dirname(from), to).replace(/\\/g, '/');
  return link.startsWith('.') ? link : `./${link}`;
}

const written = [];
function write(target, code, origin) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    `// Ported from ${origin} by tools/port-parse5/port.js: do not edit, change the tool.\n${code}`
  );
  written.push(target);
}

// The files of a folder (recursively) that pass a test.
function filesOf(dir, test) {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && test(path.join(entry.parentPath, entry.name)))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

fs.rmSync(path.join(LIB, 'parse5'), { recursive: true, force: true });
fs.rmSync(path.join(LIB, 'entities'), { recursive: true, force: true });
fs.rmSync(TESTS, { recursive: true, force: true });

// entities: what parse5 imports (decode and escape) and what they import.
const ENTITY_FILES = [
  'decode.ts',
  'decode-codepoint.ts',
  'escape.ts',
  'generated/decode-data-html.ts',
  'generated/decode-data-xml.ts',
  'internal/bin-trie-flags.ts',
  'internal/decode-shared.ts',
];
for (const file of ENTITY_FILES) {
  const source = fs.readFileSync(path.join(entities, 'src', file), 'utf8');
  write(path.join(LIB, 'entities', file.replace(/\.ts$/, '.js')), transpile(source, file), `entities' src/${file}`);
}

// parse5's library.
const PARSE5_LIB = path.join(parse5, 'packages/parse5/lib');
const libraryFiles = filesOf(PARSE5_LIB, (file) => file.endsWith('.ts') && !file.endsWith('.test.ts'));
for (const file of libraryFiles) {
  const relative = path.relative(PARSE5_LIB, file).replace(/\\/g, '/');
  const target = path.join(LIB, 'parse5', relative.replace(/\.ts$/, '.js'));
  let code = transpile(fs.readFileSync(file, 'utf8'), relative);
  code = code.replace(
    /from '(entities\/(decode|escape))'/g,
    (whole, id, name) => `from '${linkTo(target, path.join(LIB, 'entities', `${name}.js`))}'`
  );
  write(target, code, `parse5's packages/parse5/lib/${relative}`);
}

// Their declarations, as tsc makes them from the same sources (entities' imports to the ported files).
const declarationsDir = fs.mkdtempSync(path.join(OUT, '.declarations-'));
const ENTITIES_SRC = path.join(entities, 'src');
const program = ts.createProgram([...libraryFiles, ...ENTITY_FILES.map((file) => path.join(ENTITIES_SRC, file))], {
  declaration: true,
  emitDeclarationOnly: true,
  outDir: declarationsDir,
  rootDir: path.dirname(parse5),
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  skipLibCheck: true,
  paths: {
    'entities/decode': [path.join(ENTITIES_SRC, 'decode.ts')],
    'entities/escape': [path.join(ENTITIES_SRC, 'escape.ts')],
  },
});
const emitted = program.emit();
const problems = ts
  .getPreEmitDiagnostics(program)
  .concat(emitted.diagnostics)
  .filter((d) => d.category === 1);
if (problems.length) {
  console.error(ts.formatDiagnostics(problems.slice(0, 10), ts.createCompilerHost({})));
  process.exit(1);
}
const declarationRoot = (folder) => path.join(declarationsDir, path.relative(path.dirname(parse5), folder));
for (const [from, to] of [
  [declarationRoot(PARSE5_LIB), path.join(LIB, 'parse5')],
  [declarationRoot(ENTITIES_SRC), path.join(LIB, 'entities')],
]) {
  for (const file of filesOf(from, (name) => name.endsWith('.d.ts'))) {
    const target = path.join(to, path.relative(from, file));
    let code = fs.readFileSync(file, 'utf8');
    code = code.replace(
      /from '(entities\/(decode|escape))'/g,
      (whole, id, name) => `from '${linkTo(target, path.join(LIB, 'entities', `${name}.js`))}'`
    );
    write(
      target,
      code,
      `the declarations tsc makes of ${path
        .relative(declarationsDir, file)
        .replace(/\\/g, '/')
        .replace(/\.d\.ts$/, '.ts')}`
    );
  }
}
fs.rmSync(declarationsDir, { recursive: true, force: true });

// The tests: parse5's (its lib/**/*.test.ts) and its test utilities (test/utils), with their data.
const DATA = path.join(TESTS, 'data');
const UTILS = path.join(TESTS, 'utils');
const testFiles = filesOf(PARSE5_LIB, (file) => file.endsWith('.test.ts'));
// Tests of the adapter of htmlparser2 only (another package), skipped.
const SKIPPED = [
  ["it('Regression - HTML5 Legacy Doctype Misparsed with htmlparser2 tree adapter (GH-45)'", 'htmlparser2 adapter'],
  ['describe("Regression - Don\'t inherit from Object when creating collections (GH-119)"', 'htmlparser2 adapter'],
];
const skipped = [];
const utilFiles = filesOf(path.join(parse5, 'test/utils'), (file) => file.endsWith('.ts'));
function portTest(file, target, origin) {
  let code = transpile(fs.readFileSync(file, 'utf8'), path.basename(file));
  // vitest: @xufa/test's API, and node:assert for chai's assert (deepEqual is deep and strict there).
  code = code.replace(/import \{([^}]*)\} from 'vitest';/g, (whole, names) => {
    const list = names
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    const lines = [];
    const own = list.filter((name) => name !== 'assert');
    if (own.length) lines.push(`import { ${own.join(', ')} } from '@xufa/test';`);
    if (list.includes('assert'))
      lines.push(`import { assert } from '${linkTo(target, path.join(SUPPORT, 'chai-assert.js'))}';`);
    return lines.join('\n');
  });
  code = code.replace(/from 'parse5'/g, `from '${linkTo(target, path.join(OUT, 'index.js'))}'`);
  code = code.replace(
    /from 'parse5-test-utils\/utils\/([^']+)'/g,
    (whole, name) => `from '${linkTo(target, path.join(UTILS, name))}'`
  );
  code = code.replace(
    /from 'parse5-test-utils\/data\/([^']+)'/g,
    (whole, name) => `from '${linkTo(target, path.join(DATA, name))}'`
  );
  code = code.replace(/from 'outdent'/g, `from '${linkTo(target, path.join(SUPPORT, 'outdent.js'))}'`);
  // (The data, from the tests of the library: parse5's test/data is ours.)
  code = code.replace(/new URL\('(?:\.\.\/)+test\/data\//g, `new URL('${linkTo(target, DATA)}/`);
  code = code.replace(/from '(\.\.?\/[^']+)\.ts'/g, "from '$1.js'");
  // (The adapter of htmlparser2 is another package: the tests run on the default one, and the one function of it they
  // use is in test/support.)
  code = code.replace("import { adapter as htmlparser2Adapter } from 'parse5-htmlparser2-tree-adapter';\n", '');
  code = code.replace(/\n\s*htmlparser2: htmlparser2Adapter,/, '');
  code = code.replace(
    "from 'parse5-htmlparser2-tree-adapter'",
    `from '${linkTo(target, path.join(SUPPORT, 'doctype.js'))}'`
  );
  for (const [title, reason] of SKIPPED) {
    if (code.includes(title)) code = code.replace(title, `${title.replace(/^(it|describe)\(/, '$1.skip(')}`);
    if (code.includes(title.replace(/^(it|describe)\(/, '$1.skip('))) skipped.push(`${title}: ${reason}`);
  }
  // (Paths of URLs of files: fileURLToPath, not .pathname, which is not one on Windows.)
  if (/\w\.pathname\b/.test(code)) {
    code = code.replace(/(\w+)\.pathname\b/g, 'fileURLToPath($1)');
    code = `import { fileURLToPath } from 'node:url';\n${code}`;
  }
  // (The tests of the library import the files next to them: ours, in lib/parse5.)
  if (origin.includes('/lib/')) {
    const original = path.dirname(file);
    code = code.replace(/from '(\.\.?\/[^']+\.js)'/g, (whole, link) => {
      const resolved = path.resolve(original, link.replace(/\.js$/, '.ts'));
      if (!resolved.startsWith(PARSE5_LIB) || resolved.endsWith('.test.ts') || !fs.existsSync(resolved)) return whole;
      const relative = path.relative(PARSE5_LIB, resolved).replace(/\\/g, '/').replace(/\.ts$/, '.js');
      return `from '${linkTo(target, path.join(LIB, 'parse5', relative))}'`;
    });
  }
  write(target, code, origin);
}
for (const file of testFiles) {
  const relative = path.relative(PARSE5_LIB, file).replace(/\\/g, '/');
  portTest(file, path.join(TESTS, relative.replace(/\.ts$/, '.js')), `parse5's packages/parse5/lib/${relative}`);
}
for (const file of utilFiles) {
  const relative = path.relative(path.join(parse5, 'test/utils'), file).replace(/\\/g, '/');
  portTest(file, path.join(UTILS, relative.replace(/\.ts$/, '.js')), `parse5's test/utils/${relative}`);
}
// (The data: html5lib-tests at its pinned commit, and parse5's own.)
fs.cpSync(path.join(html5lib, 'tree-construction'), path.join(DATA, 'html5lib-tests/tree-construction'), {
  recursive: true,
});
fs.cpSync(path.join(html5lib, 'tokenizer'), path.join(DATA, 'html5lib-tests/tokenizer'), { recursive: true });
fs.cpSync(path.join(html5lib, 'serializer'), path.join(DATA, 'html5lib-tests/serializer'), { recursive: true });
fs.cpSync(path.join(fork, 'tree-construction'), path.join(DATA, 'html5lib-tests-fork/tree-construction'), {
  recursive: true,
});
for (const name of [
  'huge-page',
  'location-info',
  'parser-feedback',
  'sax',
  'serialization',
  'tree-construction-scripting',
]) {
  fs.cpSync(path.join(parse5, 'test/data', name), path.join(DATA, name), { recursive: true });
}
fs.copyFileSync(path.join(parse5, 'LICENSE'), path.join(OUT, 'LICENSE.parse5'));
fs.copyFileSync(path.join(entities, 'LICENSE'), path.join(OUT, 'LICENSE.entities'));
fs.copyFileSync(path.join(html5lib, 'LICENSE'), path.join(TESTS, 'LICENSE.html5lib-tests'));
fs.writeFileSync(path.join(TESTS, 'skipped.json'), `${JSON.stringify(skipped, null, 2)}\n`);
console.log(
  `port-parse5: ${written.length} files in ${path.relative(process.cwd(), OUT)}, ${skipped.length} tests skipped`
);
