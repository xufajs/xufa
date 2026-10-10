// CommonJS to ES modules, for the files of the repository (the move of 2026-10): node tools/esm/convert.mjs <files or
// folders...> [--dry]. Two passes: what each file exports (an object of names, or one value with properties), then
// each file rewritten in place, its text kept but for what changes:
//
//   'use strict'                                  taken out
//   const x = require('./x')                      import x from './x.js' (one value) / import * as x (names)
//   const { a, b: c } = require('m')              import { a, b as c } from 'm'
//   const y = require('m').y                      import { y } from 'm'
//   require('./setup')                            import './setup.js'
//   module.exports = { a, b: c }                  export { a, c as b }
//   module.exports = x; module.exports.y = z      export default x; x.y = z; export { z as y }
//   __dirname, __filename                         import.meta.dirname, import.meta.filename
//   require() inside functions, require.resolve   kept, with createRequire(import.meta.url)
//
// The entry of a package whose export is one value (a function: xufa(), inject()) also exports it as 'module.exports',
// so require('xufa') still gives it (require of ES modules, Node >= 22.12). What it cannot rewrite it reports.
import fs from 'node:fs';
import path from 'node:path';
import { builtinModules, createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const espree = require(require.resolve('espree', { paths: [path.dirname(require.resolve('eslint'))] }));

const BUILTINS = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const targets = args.filter((arg) => !arg.startsWith('--'));

function filesOf(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return target.endsWith('.js') ? [path.resolve(target)] : [];
  return fs
    .readdirSync(target, { withFileTypes: true })
    .flatMap((entry) =>
      entry.name === 'node_modules' || entry.name.startsWith('.') ? [] : filesOf(path.join(target, entry.name))
    );
}

const files = [...new Set(targets.flatMap(filesOf))];
const parse = (source) => espree.parse(source, { ecmaVersion: 'latest', sourceType: 'script', range: true, loc: true });
const sourceOf = (file) => fs.readFileSync(file, 'utf8').replace(/^#!.*\n/, (line) => line.replace(/[^\n]/g, ' '));

// Walks every node (with its parent).
function walk(node, visit, parent = null) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'range' || key === 'loc') continue;
    const value = node[key];
    if (Array.isArray(value)) value.forEach((item) => walk(item, visit, node));
    else if (value && typeof value.type === 'string') walk(value, visit, node);
  }
}

// The names a pattern declares (const { a, b: c, ...d } = ..., const [e] = ...).
function namesOf(pattern) {
  if (!pattern) return [];
  if (pattern.type === 'Identifier') return [pattern.name];
  if (pattern.type === 'ObjectPattern') {
    return pattern.properties.flatMap((property) =>
      property.type === 'RestElement' ? namesOf(property.argument) : namesOf(property.value)
    );
  }
  if (pattern.type === 'ArrayPattern') return pattern.elements.flatMap((element) => namesOf(element));
  if (pattern.type === 'AssignmentPattern') return namesOf(pattern.left);
  if (pattern.type === 'RestElement') return namesOf(pattern.argument);
  return [];
}

const isRequire = (node) =>
  node &&
  node.type === 'CallExpression' &&
  node.callee.type === 'Identifier' &&
  node.callee.name === 'require' &&
  node.arguments.length === 1 &&
  node.arguments[0].type === 'Literal' &&
  typeof node.arguments[0].value === 'string';
const isModuleExports = (node) =>
  node &&
  node.type === 'MemberExpression' &&
  !node.computed &&
  node.object.type === 'Identifier' &&
  node.object.name === 'module' &&
  node.property.name === 'exports';
// module.exports.X or exports.X: X.
const exportProperty = (node) => {
  if (!node || node.type !== 'MemberExpression' || node.computed) return null;
  if (isModuleExports(node.object)) return node.property.name;
  if (node.object.type === 'Identifier' && node.object.name === 'exports') return node.property.name;
  return null;
};

// Pass 1: the shape of each file's exports: { kind: 'named' | 'default' | 'none', names }.
const shapes = new Map();
for (const file of files) {
  let ast;
  try {
    ast = parse(sourceOf(file));
  } catch {
    continue;
  }
  let kind = 'none';
  const names = new Set();
  for (const statement of ast.body) {
    if (statement.type !== 'ExpressionStatement' || statement.expression.type !== 'AssignmentExpression') continue;
    const { left, right } = statement.expression;
    if (isModuleExports(left)) {
      if (right.type === 'ObjectExpression') {
        kind = 'named';
        for (const property of right.properties) {
          if (property.type === 'Property' && !property.computed) names.add(property.key.name ?? property.key.value);
        }
      } else kind = 'default';
    } else if (exportProperty(left)) {
      if (kind === 'none') kind = 'named';
      names.add(exportProperty(left));
    }
  }
  shapes.set(file, { kind, names });
}

// The file a specifier of a file leads to (null for packages outside, and builtins), and the specifier to write.
function resolveOf(file, specifier) {
  if (BUILTINS.has(specifier)) return { builtin: true, write: specifier };
  if (specifier.startsWith('.')) {
    const base = path.resolve(path.dirname(file), specifier);
    for (const candidate of [base, `${base}.js`, `${base}.json`, path.join(base, 'index.js')]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        let write = path.relative(path.dirname(file), candidate).split(path.sep).join('/');
        if (!write.startsWith('.')) write = `./${write}`;
        return { target: candidate, write, json: candidate.endsWith('.json') };
      }
    }
    return { missing: true, write: specifier };
  }
  try {
    const found = fs.realpathSync(createRequire(file).resolve(specifier));
    return { target: found, write: specifier, json: found.endsWith('.json') };
  } catch {
    return { missing: true, write: specifier };
  }
}

const shapeOf = (resolved) => {
  if (resolved.builtin) return 'builtin';
  if (resolved.json) return 'json';
  const shape = resolved.target && shapes.get(resolved.target);
  return shape ? shape.kind : 'external';
};

// The files that are entries of a package (main, exports), whose single value is also given to require().
function entriesOf() {
  const entries = new Set();
  for (const file of files) {
    let dir = path.dirname(file);
    while (!fs.existsSync(path.join(dir, 'package.json')) && path.dirname(dir) !== dir) dir = path.dirname(dir);
    const pkgFile = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgFile)) continue;
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
    const add = (value) => {
      if (typeof value === 'string') entries.add(path.resolve(dir, value));
      else if (value && typeof value === 'object') Object.values(value).forEach(add);
    };
    add(pkg.main || 'index.js');
    add(pkg.exports);
  }
  return entries;
}
const entries = entriesOf();

const report = [];
let changed = 0;

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parse(sourceOf(file));
  } catch (err) {
    report.push(`${file}: not parsed (${err.message})`);
    continue;
  }
  const edits = [];
  const replace = (node, text) => edits.push([node.range[0], node.range[1], text]);
  const top = [];
  let needsRequire = false;
  let counter = 0;
  const problems = [];
  const bindings = new Set();
  const declared = new Set();
  walk(ast, (node) => {
    if (node.type === 'VariableDeclarator') namesOf(node.id).forEach((name) => declared.add(name));
    if (
      node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression'
    ) {
      node.params.forEach((param) => namesOf(param).forEach((name) => declared.add(name)));
    }
  });
  // const errors = require('./lib/errors'): errors is that module (for ...errors in module.exports).
  const wholeRequires = new Map();
  for (const statement of ast.body) {
    if (statement.type !== 'VariableDeclaration') continue;
    for (const declaration of statement.declarations) {
      if (declaration.id.type === 'Identifier' && isRequire(declaration.init)) {
        wholeRequires.set(declaration.id.name, declaration.init.arguments[0].value);
      }
    }
  }
  for (const statement of ast.body) {
    if (statement.type === 'VariableDeclaration') {
      statement.declarations.forEach((declaration) => namesOf(declaration.id).forEach((name) => bindings.add(name)));
    }
    if ((statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') && statement.id) {
      bindings.add(statement.id.name);
    }
  }

  // An import of a require at the top: its text, or null when it is not one of the forms known.
  const importOf = (id, call, member) => {
    const specifier = call.arguments[0].value;
    const resolved = resolveOf(file, specifier);
    if (resolved.missing) problems.push(`require('${specifier}') leads nowhere`);
    const shape = shapeOf(resolved);
    const from = `'${resolved.write}'${shape === 'json' ? " with { type: 'json' }" : ''}`;
    const temp = () => `__${(specifier.split('/').pop() || 'module').replace(/\W/g, '_')}${(counter += 1)}`;
    if (member) {
      if (shape === 'named' || shape === 'builtin') {
        return id.type === 'Identifier'
          ? `import { ${member === id.name ? member : `${member} as ${id.name}`} } from ${from};`
          : null;
      }
      const name = temp();
      return `import ${name} from ${from};\nconst ${idText(id)} = ${name}.${member};`;
    }
    if (id === null) return `import ${from};`;
    if (id.type === 'Identifier') {
      if (shape === 'named') return `import * as ${id.name} from ${from};`;
      return `import ${id.name} from ${from};`;
    }
    if (id.type === 'ObjectPattern') {
      const simple = id.properties.every(
        (property) =>
          property.type === 'Property' &&
          !property.computed &&
          property.key.type === 'Identifier' &&
          property.value.type === 'Identifier'
      );
      if (simple && (shape === 'named' || shape === 'builtin')) {
        const names = id.properties.map((property) =>
          property.key.name === property.value.name
            ? property.key.name
            : `${property.key.name} as ${property.value.name}`
        );
        return `import { ${names.join(', ')} } from ${from};`;
      }
      const name = temp();
      return `import ${name} from ${from};\nconst ${idText(id)} = ${name};`;
    }
    return null;
  };
  const idText = (id) => original.slice(id.range[0], id.range[1]);

  let defaultName = null;
  const named = [];
  const tail = [];
  for (const statement of ast.body) {
    // 'use strict'
    if (statement.type === 'ExpressionStatement' && statement.directive === 'use strict') {
      edits.push([statement.range[0], statement.range[1] + (original[statement.range[1]] === '\n' ? 1 : 0), '']);
      continue;
    }
    // require('x');
    if (statement.type === 'ExpressionStatement' && isRequire(statement.expression)) {
      replace(statement, importOf(null, statement.expression));
      continue;
    }
    // const ... = require(...)[.member];
    if (statement.type === 'VariableDeclaration') {
      const parts = statement.declarations.map((declaration) => {
        const init = declaration.init;
        if (isRequire(init)) return importOf(declaration.id, init);
        if (init && init.type === 'MemberExpression' && !init.computed && isRequire(init.object)) {
          return importOf(declaration.id, init.object, init.property.name);
        }
        return undefined;
      });
      if (parts.every((part) => part === undefined)) continue;
      if (parts.some((part) => part === undefined || part === null)) {
        if (parts.some((part) => part === null) || statement.declarations.length > 1) {
          problems.push(`line ${statement.loc.start.line}: a declaration of requires it cannot rewrite`);
        }
        continue;
      }
      replace(statement, parts.join('\n'));
      continue;
    }
    // module.exports = ...; module.exports.x = ...; exports.x = ...
    if (statement.type === 'ExpressionStatement' && statement.expression.type === 'AssignmentExpression') {
      const { left, right } = statement.expression;
      if (isModuleExports(left)) {
        if (right.type === 'ObjectExpression') {
          const lines = [];
          for (const property of right.properties) {
            if (property.type === 'SpreadElement') {
              const spread = property.argument;
              const specifier = isRequire(spread)
                ? spread.arguments[0].value
                : spread.type === 'Identifier'
                  ? wholeRequires.get(spread.name)
                  : undefined;
              if (specifier !== undefined) lines.push(`export * from '${resolveOf(file, specifier).write}';`);
              else problems.push(`line ${property.loc.start.line}: a spread in module.exports`);
              continue;
            }
            if (property.computed || (property.key.type !== 'Identifier' && property.key.type !== 'Literal')) {
              problems.push(`line ${property.loc.start.line}: a computed key in module.exports`);
              continue;
            }
            const key = property.key.name ?? property.key.value;
            const value = property.value;
            const validKey = /^[A-Za-z_$][\w$]*$/.test(key);
            if (value.type === 'Identifier' && bindings.has(value.name)) {
              named.push(value.name === key ? key : `${value.name} as ${validKey ? key : `'${key}'`}`);
            } else if (validKey && !bindings.has(key)) {
              lines.push(`export const ${key} = ${original.slice(value.range[0], value.range[1])};`);
            } else {
              const name = `__${key.replace(/\W/g, '_')}`;
              lines.push(`const ${name} = ${original.slice(value.range[0], value.range[1])};`);
              named.push(`${name} as ${validKey ? key : `'${key}'`}`);
            }
          }
          replace(statement, lines.join('\n'));
        } else if (right.type === 'Identifier') {
          defaultName = right.name;
          replace(statement, `export default ${right.name};`);
        } else {
          defaultName = '__default';
          replace(
            statement,
            `const __default = ${original.slice(right.range[0], right.range[1])};\nexport default __default;`
          );
        }
        continue;
      }
      const key = exportProperty(left);
      if (key) {
        const value = original.slice(right.range[0], right.range[1]);
        if (defaultName) {
          replace(statement, `${defaultName}.${key} = ${value};`);
          if (key !== 'default') {
            if (right.type === 'Identifier' && bindings.has(right.name) && right.name !== defaultName) {
              tail.push(right.name === key ? key : `${right.name} as ${key}`);
            } else if (right.type === 'Identifier' && right.name === defaultName)
              tail.push(key === defaultName ? key : `${defaultName} as ${key}`);
            else {
              const name = `__${key}`;
              edits.push([statement.range[1], statement.range[1], `\nconst ${name} = ${defaultName}.${key};`]);
              tail.push(`${name} as ${key}`);
            }
          }
        } else if (right.type === 'Identifier' && bindings.has(right.name)) {
          replace(statement, '');
          named.push(right.name === key ? key : `${right.name} as ${key}`);
        } else {
          replace(statement, `export const ${key} = ${value};`);
        }
        continue;
      }
    }
    top.push(statement);
  }

  // What is left: require inside code, __dirname, module and exports elsewhere.
  walk(ast, (node) => {
    const main = (side) =>
      side.type === 'MemberExpression' && side.object.name === 'require' && side.property.name === 'main';
    if (
      node.type === 'BinaryExpression' &&
      ['===', '!=='].includes(node.operator) &&
      ((main(node.left) && node.right.name === 'module') || (main(node.right) && node.left.name === 'module'))
    ) {
      replace(node, `process.argv[1] ${node.operator} import.meta.filename`);
    }
  });
  walk(ast, (node, parent) => {
    if (node.type === 'Identifier') {
      if (node.name === '__dirname') replace(node, 'import.meta.dirname');
      else if (node.name === '__filename') replace(node, 'import.meta.filename');
    }
    if (node.type === 'Identifier' && node.name === 'require' && parent) {
      const covered = edits.some(([start, end]) => node.range[0] >= start && node.range[1] <= end);
      if (!covered) {
        needsRequire = true;
        // A lazy require of a file of one value: its value (require of an ES module gives its namespace).
        if (parent.type === 'CallExpression' && isRequire(parent)) {
          const resolved = resolveOf(file, parent.arguments[0].value);
          const shape = shapeOf(resolved);
          const write = `require('${resolved.write}')`;
          const isEntry = resolved.target && entries.has(resolved.target);
          replace(parent, shape === 'default' && !isEntry ? `${write}.default` : write);
        }
        if (parent.type === 'MemberExpression' && parent.property.name === 'main' && !covered) {
          const done = edits.some(([start, end]) => parent.range[0] >= start && parent.range[1] <= end);
          if (!done) problems.push(`line ${node.loc.start.line}: require.main`);
        }
      }
    }
    if (
      node.type === 'Identifier' &&
      (node.name === 'module' || node.name === 'exports') &&
      parent &&
      !declared.has(node.name)
    ) {
      const covered = edits.some(([start, end]) => node.range[0] >= start && node.range[1] <= end);
      const isProperty = parent.type === 'MemberExpression' && parent.property === node && !parent.computed;
      const isKey = parent.type === 'Property' && parent.key === node && !parent.computed;
      if (!covered && !isProperty && !isKey) problems.push(`line ${node.loc.start.line}: ${node.name} used`);
    }
  });

  const exportsAll = [...named, ...tail];
  if (exportsAll.length) edits.push([original.length, original.length, `\nexport { ${exportsAll.join(', ')} };\n`]);
  if (defaultName && entries.has(file)) {
    edits.push([original.length, original.length, `\nexport { ${defaultName} as 'module.exports' };\n`]);
  }
  if (needsRequire) {
    // After the imports (the first statement that is not one).
    const imports = edits.filter(([, , text]) => typeof text === 'string' && /^import /m.test(text));
    const at = imports.length ? Math.max(...imports.map(([, end]) => end)) : firstCodeOffset(original, ast);
    edits.push([
      at,
      at,
      `${imports.length ? '\n' : ''}import { createRequire } from 'node:module';\n\nconst require = createRequire(import.meta.url);\n${imports.length ? '' : '\n'}`,
    ]);
  }

  edits.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  let text = original;
  for (const [start, end, value] of edits) text = text.slice(0, start) + value + text.slice(end);
  text = text.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
  if (problems.length) report.push(`${path.relative(process.cwd(), file)}:\n  ${problems.join('\n  ')}`);
  if (text !== original) {
    changed += 1;
    if (!dry) fs.writeFileSync(file, text);
  }
}

// Where code starts: after the comments of the head of the file.
function firstCodeOffset(source, ast) {
  return ast.body.length ? ast.body[0].range[0] : source.length;
}

console.log(`esm: ${changed} of ${files.length} files ${dry ? 'would change' : 'changed'}`);
if (report.length) console.log(`To see by hand:\n${report.join('\n')}`);
