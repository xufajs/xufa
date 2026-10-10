// The TypeScript examples of the docs, type-checked: every <pre data-run> whose code is language-ts in
// tools/docs/pages/*.page.html is compiled (strict, without emitting) against the declarations of the packages of this
// repository (@xufa/* and xufa/* mapped to them), and must have no errors. <!--run-before: code--> just before one
// adds code to it (imports the page leaves out).
//
//   node tools/docs/examples/types.js          # the examples marked
//   node tools/docs/examples/types.js --all    # every TypeScript block: which compile as they are
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { declarationsOf } from '../lib/declarations.js';

const ROOT = path.join(import.meta.dirname, '../../..');

// The declarations of each package, each subpath of xufa ('xufa/orm') and each package of a folder of its own
// ('@xufa/router/...'), as exact paths: a list of candidates for a wildcard makes TypeScript take the module of a
// package (index.js) over its .d.cts (the CommonJS declarations of packages of ES modules).
function packagePaths() {
  const PACKAGES = path.join(ROOT, 'packages');
  const paths = {};
  for (const name of fs.readdirSync(PACKAGES)) {
    const dir = path.join(PACKAGES, name);
    const file = declarationsOf(dir) ?? declarationsOf(path.join(dir, 'types'));
    if (file) paths[`@xufa/${name}`] = [file];
    if (fs.existsSync(dir)) paths[`@xufa/${name}/*`] = [`${dir}/*`];
  }
  const xufa = path.join(PACKAGES, 'xufa');
  paths.xufa = [declarationsOf(xufa)];
  for (const entry of fs.readdirSync(xufa)) {
    const match = /^(.+)\.d\.c?ts$/.exec(entry);
    if (match && match[1] !== 'index') paths[`xufa/${match[1]}`] = [path.join(xufa, entry)];
  }
  // xufa/openapi/ui
  if (paths['xufa/openapi-ui']) paths['xufa/openapi/ui'] = paths['xufa/openapi-ui'];
  return paths;
}
const PAGES = path.join(import.meta.dirname, '../pages');

const unescape = (html) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

function examples(all) {
  const found = [];
  for (const file of fs.readdirSync(PAGES).filter((name) => name.endsWith('.page.html'))) {
    const text = fs.readFileSync(path.join(PAGES, file), 'utf8');
    let end = 0;
    for (const block of text.matchAll(/<pre([^>]*)><code class="language-ts">([\s\S]*?)<\/code><\/pre>/g)) {
      const before = /<!--run-before:((?:(?!-->)[\s\S])*)-->\s*$/.exec(text.slice(end, block.index));
      end = block.index + block[0].length;
      const marked = /\bdata-run\b/.test(block[1]);
      if (!marked && !all) continue;
      found.push({
        where: `${file}:${text.slice(0, block.index).split('\n').length}`,
        code: [before ? unescape(before[1].trim()) : '', unescape(block[2])].filter(Boolean).join('\n'),
        marked,
      });
    }
  }
  return found;
}

function main() {
  const all = process.argv.includes('--all');
  const list = examples(all);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-docs-types-'));
  // Each example a module of its own (export {}), so their names do not meet; the modules it augments (declare module)
  // imported, as the app that has the augmentation imports them.
  const files = list.map((example, i) => {
    const file = path.join(dir, `example-${i}.ts`);
    const augmented = [...example.code.matchAll(/^declare module '([^']+)'/gm)].map(
      (match) => `import '${match[1]}';\n`
    );
    fs.writeFileSync(file, `${example.code}\n${augmented.join('')}export {};\n`);
    return file;
  });
  const options = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    esModuleInterop: true,
    skipLibCheck: true,
    types: ['node'],
    typeRoots: [path.join(ROOT, 'node_modules/@types')],
    paths: packagePaths(),
  };
  // A program for each example (the declare module of one, augmenting @xufa/http, is not seen by the others), with the
  // declarations parsed once: the host keeps the source files it read.
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile;
  const parsed = new Map();
  host.getSourceFile = (name, ...rest) => {
    if (name.includes('xufa-docs-types-')) return read.call(host, name, ...rest);
    if (!parsed.has(name)) parsed.set(name, read.call(host, name, ...rest));
    return parsed.get(name);
  };
  const byFile = new Map();
  let program;
  for (const file of files) {
    program = ts.createProgram([file], options, host, program);
    byFile.set(
      file,
      ts
        .getPreEmitDiagnostics(program, program.getSourceFile(file))
        .filter((diagnostic) => diagnostic.file)
        .map((diagnostic) => {
          const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
          return `line ${line + 1}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`;
        })
    );
  }
  fs.rmSync(dir, { recursive: true, force: true });
  const failed = [];
  list.forEach((example, i) => {
    const errors = byFile.get(files[i]);
    if (all)
      console.log(
        `${errors.length ? 'fails' : 'types'} ${example.marked ? '[marked] ' : ''}${example.where}${errors.length ? `: ${errors[0]}` : ''}`
      );
    if (errors.length && example.marked) failed.push(`${example.where}\n  ${errors.join('\n  ')}`);
  });
  const marked = list.filter((example) => example.marked).length;
  if (failed.length) {
    console.log(`docs types: ${failed.length} of ${marked} have errors\n${failed.join('\n')}`);
    process.exitCode = 1;
  } else console.log(`docs types: ${marked} TypeScript examples compile`);
}

main();
