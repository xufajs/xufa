// The lazy require()s of the ES modules of the repository, made imports: require('@xufa/orm') inside a function
// becomes ormModule, a namespace imported at the top (import * as ormModule from '@xufa/orm'). In ES modules a cycle
// needs no lazy require when the import is used once the modules run, and require() of an ES module gives another
// instance of it under a test runner that isolates files (vyntra's fresh copies). Left lazy: builtins and packages
// outside the repository (optional ones: bufferutil, esbuild), CommonJS ones, and requires for their effects.
// node tools/esm/hoist.mjs <files...>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const espree = require(require.resolve('espree', { paths: [path.dirname(require.resolve('eslint'))] }));
const ROOT = path.resolve(import.meta.dirname, '../..');
const BLOCK = "import { createRequire } from 'node:module';\n\nconst require = createRequire(import.meta.url);\n";

function walk(node, visit, parent = null) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'range' || key === 'loc') continue;
    const value = node[key];
    if (Array.isArray(value)) value.forEach((item) => walk(item, visit, node));
    else if (value && typeof value.type === 'string') walk(value, visit, node);
  }
}

function isModuleFile(file) {
  let dir = path.dirname(file);
  for (;;) {
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg)) return JSON.parse(fs.readFileSync(pkg, 'utf8')).type === 'module';
    if (path.dirname(dir) === dir) return false;
    dir = path.dirname(dir);
  }
}

// The file of a specifier when it is an ES module of the repository (else null), and the specifier to write.
function target(from, specifier) {
  if (specifier.startsWith('node:')) return null;
  let found;
  try {
    found = fs.realpathSync(createRequire(from).resolve(specifier));
  } catch {
    return null;
  }
  if (!found.startsWith(ROOT) || found.includes(`${path.sep}node_modules${path.sep}`)) return null;
  if (!found.endsWith('.js') || !isModuleFile(found)) return null;
  let write = specifier;
  if (specifier.startsWith('.')) {
    write = path.relative(path.dirname(from), found).split(path.sep).join('/');
    if (!write.startsWith('.')) write = `./${write}`;
  }
  return { file: found, write };
}

const nameOf = (specifier) => {
  const base = specifier
    .replace(/^@xufa\//, '')
    .replace(/^xufa\//, '')
    .split('/')
    .pop()
    .replace(/\.js$/, '')
    .replace(/[^A-Za-z0-9]+(.)/g, (whole, letter) => letter.toUpperCase());
  return `${base.charAt(0).toLowerCase()}${base.slice(1)}Module`;
};

let total = 0;
for (const file of process.argv.slice(2).map((item) => path.resolve(item))) {
  const source = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = espree.parse(source, { ecmaVersion: 'latest', sourceType: 'module', range: true });
  } catch (err) {
    console.log(`${file}: not parsed (${err.message})`);
    continue;
  }
  const taken = new Set();
  walk(ast, (node) => {
    if (node.type === 'Identifier') taken.add(node.name);
  });
  const imports = new Map(); // write -> name
  const edits = [];
  walk(ast, (node, parent) => {
    if (
      node.type !== 'CallExpression' ||
      node.callee.type !== 'Identifier' ||
      node.callee.name !== 'require' ||
      node.arguments.length !== 1 ||
      node.arguments[0].type !== 'Literal'
    ) {
      return;
    }
    if (parent && parent.type === 'ExpressionStatement') return; // for its effects
    const found = target(file, node.arguments[0].value);
    if (!found) return;
    if (!imports.has(found.write)) {
      let name = nameOf(found.write);
      while (taken.has(name)) name = `${name}_`;
      taken.add(name);
      imports.set(found.write, name);
    }
    edits.push([node.range[0], node.range[1], imports.get(found.write)]);
  });
  if (!edits.length) continue;
  let text = source;
  edits.sort((a, b) => b[0] - a[0]);
  for (const [start, end, value] of edits) text = text.slice(0, start) + value + text.slice(end);
  // The global-require comments of the lines that changed are not needed any more.
  text = text.replace(/(ormModule|Module_*)([^\n]*?) \/\/ eslint-disable-line global-require/g, '$1$2');
  text = text.replace(/\n\s*\/\/ eslint-disable-next-line global-require\n/g, '\n');
  const lines = [...imports].map(([write, name]) => `import * as ${name} from '${write}';`).join('\n');
  // After the last import of the head.
  const reparsed = espree.parse(text, { ecmaVersion: 'latest', sourceType: 'module', range: true });
  const lastImport = reparsed.body.filter((node) => node.type === 'ImportDeclaration').pop();
  const at = lastImport ? lastImport.range[1] : 0;
  text = `${text.slice(0, at)}${lastImport ? '\n' : ''}${lines}${lastImport ? '' : '\n'}${text.slice(at)}`;
  // createRequire, when nothing needs it now.
  const uses = text
    .split(BLOCK)
    .join('')
    .match(/\brequire\s*[(.]/g);
  if (!uses) text = text.replace(`${BLOCK}\n`, '').replace(BLOCK, '');
  fs.writeFileSync(file, text);
  total += edits.length;
  console.log(`${path.relative(ROOT, file)}: ${edits.length} (${[...imports.values()].join(', ')})`);
}
console.log(`hoist: ${total} requires made imports`);
