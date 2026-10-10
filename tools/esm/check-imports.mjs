// Checks the named imports of ES modules against what their files export (export * followed), and fixes those that
// name what a module of one value (export default) holds: import { a } from './x.js' becomes import x from './x.js';
// const { a } = x. node tools/esm/check-imports.mjs <folders...> [--fix]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const espree = require(require.resolve('espree', { paths: [path.dirname(require.resolve('eslint'))] }));

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const roots = args.filter((arg) => !arg.startsWith('--'));

function filesOf(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesOf(full);
    return /\.m?js$/.test(entry.name) ? [full] : [];
  });
}

// The nearest package.json says whether .js is an ES module.
const typeCache = new Map();
function isModule(file) {
  if (file.endsWith('.mjs')) return true;
  if (file.endsWith('.cjs')) return false;
  let dir = path.dirname(file);
  const seen = [];
  while (true) {
    if (typeCache.has(dir)) break;
    seen.push(dir);
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg)) {
      typeCache.set(dir, JSON.parse(fs.readFileSync(pkg, 'utf8')).type === 'module');
      break;
    }
    if (path.dirname(dir) === dir) {
      typeCache.set(dir, false);
      break;
    }
    dir = path.dirname(dir);
  }
  const value = typeCache.get(dir);
  seen.forEach((item) => typeCache.set(item, value));
  return value;
}

const parsed = new Map();
function parse(file) {
  if (!parsed.has(file)) {
    try {
      parsed.set(
        file,
        espree.parse(fs.readFileSync(file, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module', range: true })
      );
    } catch {
      parsed.set(file, null);
    }
  }
  return parsed.get(file);
}

function resolve(from, specifier) {
  try {
    return fs.realpathSync(createRequire(from).resolve(specifier));
  } catch {
    return null;
  }
}

// The names a module exports ('default' among them), following export * of ES modules.
const exportCache = new Map();
function exportsOf(file, seen = new Set()) {
  if (exportCache.has(file)) return exportCache.get(file);
  if (seen.has(file)) return new Set();
  seen.add(file);
  const names = new Set();
  if (!isModule(file) || file.endsWith('.json')) {
    exportCache.set(file, null); // CommonJS or JSON: not checked
    return null;
  }
  const ast = parse(file);
  if (!ast) return null;
  for (const node of ast.body) {
    if (node.type === 'ExportDefaultDeclaration') names.add('default');
    if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration) {
        const declaration = node.declaration;
        if (declaration.id) names.add(declaration.id.name);
        for (const item of declaration.declarations || []) collect(item.id, names);
      }
      for (const specifier of node.specifiers) names.add(specifier.exported.name ?? specifier.exported.value);
    }
    if (node.type === 'ExportAllDeclaration') {
      if (node.exported) names.add(node.exported.name);
      else {
        const target = resolve(file, node.source.value);
        const theirs = target && exportsOf(target, seen);
        if (theirs === null) return keep(file, null);
        for (const name of theirs || []) if (name !== 'default') names.add(name);
      }
    }
  }
  return keep(file, names);
}
const keep = (file, value) => {
  exportCache.set(file, value);
  return value;
};
function collect(pattern, names) {
  if (!pattern) return;
  if (pattern.type === 'Identifier') names.add(pattern.name);
  else if (pattern.type === 'ObjectPattern') {
    pattern.properties.forEach((property) =>
      collect(property.type === 'RestElement' ? property.argument : property.value, names)
    );
  } else if (pattern.type === 'ArrayPattern') pattern.elements.forEach((element) => collect(element, names));
  else if (pattern.type === 'AssignmentPattern') collect(pattern.left, names);
}

let problems = 0;
let fixed = 0;
for (const file of roots.flatMap((root) => filesOf(path.resolve(root)))) {
  if (!isModule(file)) continue;
  const ast = parse(file);
  if (!ast) {
    console.log(`${path.relative(process.cwd(), file)}: not parsed as a module`);
    problems += 1;
    continue;
  }
  let text = fs.readFileSync(file, 'utf8');
  const edits = [];
  for (const node of ast.body) {
    if (node.type !== 'ImportDeclaration' && !(node.type === 'ExportNamedDeclaration' && node.source)) continue;
    const target = resolve(file, node.source.value);
    if (!target) {
      if (!node.source.value.startsWith('node:')) {
        console.log(`${path.relative(process.cwd(), file)}: ${node.source.value} not found`);
        problems += 1;
      }
      continue;
    }
    const theirs = exportsOf(target);
    if (!theirs) continue;
    const wanted = node.specifiers.filter((specifier) =>
      node.type === 'ImportDeclaration'
        ? specifier.type === 'ImportSpecifier' || specifier.type === 'ImportDefaultSpecifier'
        : true
    );
    const missing = wanted.filter((specifier) => {
      const name =
        specifier.type === 'ImportDefaultSpecifier'
          ? 'default'
          : node.type === 'ImportDeclaration'
            ? (specifier.imported.name ?? specifier.imported.value)
            : (specifier.local.name ?? specifier.local.value);
      return !theirs.has(name);
    });
    if (!missing.length) continue;
    const names = missing.map((specifier) =>
      specifier.type === 'ImportDefaultSpecifier' ? 'default' : (specifier.imported?.name ?? specifier.local.name)
    );
    const canFix =
      fix &&
      node.type === 'ImportDeclaration' &&
      theirs.has('default') &&
      node.specifiers.every((specifier) => specifier.type === 'ImportSpecifier');
    if (canFix) {
      const local = `__${path.basename(target, '.js').replace(/\W/g, '_')}`;
      const parts = node.specifiers.map((specifier) =>
        specifier.imported.name === specifier.local.name
          ? specifier.local.name
          : `${specifier.imported.name}: ${specifier.local.name}`
      );
      edits.push([
        node.range[0],
        node.range[1],
        `import ${local} from '${node.source.value}';\nconst { ${parts.join(', ')} } = ${local};`,
      ]);
      fixed += 1;
    } else {
      console.log(`${path.relative(process.cwd(), file)}: ${node.source.value} has no ${names.join(', ')}`);
      problems += 1;
    }
  }
  if (edits.length) {
    edits.sort((a, b) => b[0] - a[0]);
    for (const [start, end, value] of edits) text = text.slice(0, start) + value + text.slice(end);
    fs.writeFileSync(file, text);
  }
}
console.log(`check-imports: ${problems} problems${fix ? `, ${fixed} fixed` : ''}`);
