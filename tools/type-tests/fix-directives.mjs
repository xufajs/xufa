// After tools/type-tests/convert.mjs: moves each // @ts-expect-error that tsc finds unused, above a statement of
// several lines whose error is on a later line, to that line (a directive covers only the line after it).
//
//   node tools/type-tests/fix-directives.mjs <package folder...>
//
// The options are those `xufa-test --typecheck` uses: the tsconfig of the package's xufaTest.typecheck, else its
// defaults for a project without one.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

// As DEFAULT_COMPILER_OPTIONS of packages/test/src/cli/typecheck.js.
const DEFAULTS = {
  strict: true,
  target: 'ES2022',
  module: 'Preserve',
  moduleResolution: 'Bundler',
  lib: ['ES2023', 'DOM', 'DOM.Iterable'],
  esModuleInterop: true,
  resolveJsonModule: true,
  skipLibCheck: false,
  noEmit: true,
};

function optionsOf(dir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const tsconfig = pkg.xufaTest?.typecheck?.tsconfig;
  if (tsconfig) {
    const parsed = ts.getParsedCommandLineOfConfigFile(
      path.join(dir, tsconfig),
      {},
      { ...ts.sys, onUnRecoverableConfigFileDiagnostic() {} }
    );
    return { ...parsed.options, noEmit: true };
  }
  return ts.convertCompilerOptionsFromJson(DEFAULTS, dir).options;
}

function typeTests(dir) {
  const found = [];
  const walk = (folder) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules') walk(file);
      else if (/\.test-d\.[cm]?ts$/.test(entry.name)) found.push(file);
    }
  };
  walk(path.join(dir, 'test'));
  return found;
}

// One pass: the directives moved, by file.
function fixOnce(dir) {
  const files = typeTests(dir);
  const program = ts.createProgram(files, optionsOf(dir));
  const diagnostics = ts.getPreEmitDiagnostics(program);
  let moved = 0;
  for (const file of files) {
    const source = program.getSourceFile(file);
    const ours = diagnostics.filter((d) => d.file && path.resolve(d.file.fileName) === path.resolve(file));
    const lineOf = (d) => source.getLineAndCharacterOfPosition(d.start).line;
    const unused = ours.filter((d) => d.code === 2578).map(lineOf);
    const errors = ours.filter((d) => d.code !== 2578).map(lineOf);
    if (unused.length === 0) continue;
    const lines = source.text.split('\n');
    const moves = [];
    for (const directive of unused) {
      // The statement after the directive, and the first error in it.
      const after = source.getPositionOfLineAndCharacter(directive + 1, 0);
      let statement = null;
      const find = (node) => {
        if (statement) return;
        if (node.getStart(source) >= after && (ts.isStatement(node) || ts.isExpressionStatement(node))) {
          statement = node;
          return;
        }
        ts.forEachChild(node, find);
      };
      find(source);
      if (!statement) continue;
      const end = source.getLineAndCharacterOfPosition(statement.end).line;
      const target = errors.find((line) => line > directive + 1 && line <= end);
      if (target !== undefined) moves.push({ from: directive, to: target });
    }
    for (const { from, to } of moves.sort((a, b) => b.to - a.to)) {
      const indent = lines[to].match(/^\s*/)[0];
      lines.splice(to, 0, `${indent}// @ts-expect-error`);
      lines.splice(from, 1);
      moved += 1;
    }
    if (moves.length) fs.writeFileSync(file, lines.join('\n'));
  }
  return moved;
}

for (const dir of process.argv.slice(2)) {
  let total = 0;
  for (let pass = 0; pass < 5; pass += 1) {
    const moved = fixOnce(dir);
    total += moved;
    if (moved === 0) break;
  }
  console.log(`${dir}: ${total} directives moved`);
}
