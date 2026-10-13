// TypeScript's parser for @xufa/lint (lib/typescript/typescript.cjs, imported as #typescript): what the linter's parser
// (lib/parser.js) and the formatter's (lib/prettier/parse) use of the installed TypeScript (createSourceFile,
// createScanner, forEachChild, SyntaxKind...) and what that needs, out of its 9 MB. Both load it instead of
// TypeScript: in about a third of the time, and without TypeScript installed.
//
// typescript.js is one function whose statements declare everything (functions, vars, namespaces filled by the
// statements after them); a statement is kept when what it declares is reached from what the formatter uses. Kept
// besides: "use strict", and setObjectAllocator() with the classes of nodes of TypeScript's services, which give nodes
// their methods (getStart, getText...); not those of symbols, types and signatures, which parsing never makes (their
// methods would keep most of the services: completions, refactors...). The rest of what is not a declaration
// (refactors registered, settings from environment variables) goes.
//
//   node scripts/build-typescript.mjs          writes lib/typescript/typescript.cjs
//   node scripts/build-typescript.mjs --check  fails when it is not the build of the installed TypeScript
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.join(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'lib/typescript/typescript.cjs');
const require = createRequire(path.join(ROOT, 'package.json'));
const ts = require('typescript');
const source = require.resolve('typescript');
const text = fs.readFileSync(source, 'utf8');

// What the parsers use of TypeScript: ts.name in the code (not the comments) of the linter's and the formatter's.
const parserDir = path.join(ROOT, 'lib/prettier/parse/typescript-estree');
const parsers = [
  path.join(ROOT, 'lib/parser.js'),
  ...fs.readdirSync(parserDir).map((name) => path.join(parserDir, name)),
];
const used = new Set(['versionMajorMinor', 'version']);
for (const file of parsers) {
  if (!file.endsWith('.js')) continue;
  const module = ts.createSourceFile(path.basename(file), fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const visit = (node) => {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'ts') {
      used.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(module);
}

const file = ts.createSourceFile('typescript.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const wrapper = file.statements.find(
  (statement) =>
    ts.isExpressionStatement(statement) &&
    ts.isCallExpression(statement.expression) &&
    ts.isParenthesizedExpression(statement.expression.expression) &&
    ts.isArrowFunction(statement.expression.expression.expression)
);
if (!wrapper) throw new Error(`${source}: not the module function of typescript.js as expected`);
const statements = wrapper.expression.expression.expression.body.statements;

// What a statement declares (or fills), and the names it uses.
function boundNames(name, out) {
  if (ts.isIdentifier(name)) out.push(name.text);
  else for (const element of name.elements) if (!ts.isOmittedExpression(element)) boundNames(element.name, out);
  return out;
}
function declares(statement) {
  if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement))
    return statement.name ? [statement.name.text] : [];
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap((declaration) => boundNames(declaration.name, []));
  }
  if (ts.isExpressionStatement(statement)) {
    const expression = statement.expression;
    // ((Parser2) => {...})(Parser || (Parser = {})): fills Parser.
    if (ts.isCallExpression(expression) && expression.arguments.length === 1) {
      const argument = expression.arguments[0];
      if (ts.isBinaryExpression(argument) && ts.isIdentifier(argument.left)) return [argument.left.text];
      // __export(ts_performance_exports, {...}): fills ts_performance_exports.
      if (ts.isIdentifier(expression.expression) && expression.expression.text === '__export') return [];
    }
    if (
      ts.isCallExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === '__export'
    ) {
      return [expression.arguments[0].text];
    }
    // _Version.zero = ...: fills _Version.
    if (
      ts.isBinaryExpression(expression) &&
      expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(expression.left) &&
      ts.isIdentifier(expression.left.expression)
    ) {
      return [expression.left.expression.text];
    }
  }
  return [];
}
function uses(statement) {
  const names = new Set();
  const visit = (node) => {
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      const isPropertyName =
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        ((ts.isPropertyAssignment(parent) ||
          ts.isMethodDeclaration(parent) ||
          ts.isPropertyDeclaration(parent) ||
          ts.isGetAccessorDeclaration(parent) ||
          ts.isSetAccessorDeclaration(parent)) &&
          parent.name === node);
      if (!isPropertyName) names.add(node.text);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(statement);
  return names;
}

// The objects of the services that parsing makes: nodes, tokens, identifiers and source files.
const ALLOCATOR = `setObjectAllocator({
  getNodeConstructor: () => NodeObject,
  getTokenConstructor: () => TokenObject,
  getIdentifierConstructor: () => IdentifierObject,
  getPrivateIdentifierConstructor: () => PrivateIdentifierObject,
  getSourceFileConstructor: () => SourceFileObject,
});`;
const replaced = new Map(); // statement index -> its text in the output

const byName = new Map(); // name -> [statement index]
const info = statements.map((statement, index) => {
  const names = declares(statement);
  for (const name of names) {
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(index);
  }
  return { statement, names, uses: null };
});

const kept = new Set();
const queue = [];
const why = new Map(); // name -> the name whose statement needed it (TRACE=name prints the chain)
let current = '(formatter)';
const need = (name) => {
  if (!why.has(name)) why.set(name, current);
  for (const index of byName.get(name) ?? []) {
    if (kept.has(index)) continue;
    kept.add(index);
    queue.push(index);
  }
};
const keepStatement = (index) => {
  if (kept.has(index)) return;
  kept.add(index);
  queue.push(index);
};
statements.forEach((statement, index) => {
  const code = statement.getText(file);
  if (code === '"use strict";') keepStatement(index);
  if (code.startsWith('setObjectAllocator(getServicesObjectAllocator())')) {
    replaced.set(index, ALLOCATOR);
    info[index].uses = uses(ts.createSourceFile('allocator.js', ALLOCATOR, ts.ScriptTarget.Latest, true));
    keepStatement(index);
  }
});
if (replaced.size !== 1) throw new Error('setObjectAllocator(getServicesObjectAllocator()) not found in typescript.js');
const missing = [...used].filter((name) => !byName.has(name));
if (missing.length) throw new Error(`not declared in typescript.js: ${missing.join(', ')}`);
for (const name of used) need(name);
while (queue.length) {
  const index = queue.pop();
  current = info[index].names[0] ?? `(statement ${index})`;
  info[index].uses ??= uses(info[index].statement);
  for (const name of info[index].uses) need(name);
}

if (process.env.TRACE) {
  for (const name of process.env.TRACE.split(',')) {
    const chain = [name];
    for (let at = name; why.has(at) && why.get(at) !== at && chain.length < 40; at = why.get(at))
      chain.push(why.get(at));
    console.log(chain.join(' <- '));
  }
}

// Diagnostics: only the messages the kept code reads (Diagnostics.Name), of some 3,000 made when it loads.
const diagnosticsIndex = statements.findIndex(
  (statement) =>
    ts.isVariableStatement(statement) && statement.declarationList.declarations[0].name.getText(file) === 'Diagnostics'
);
if (kept.has(diagnosticsIndex)) {
  const readers = [...kept]
    .filter((index) => index !== diagnosticsIndex)
    .map((index) => replaced.get(index) ?? statements[index].getText(file));
  const read = new Set();
  for (const code of readers) {
    for (const [, name] of code.matchAll(/(?<![\w$.])Diagnostics\.([A-Za-z_$][\w$]*)/g)) read.add(name);
    // (Read otherwise, as an object: every message is kept.)
    if (/(?<![\w$.])Diagnostics(?![\w$]|\s*\.)/.test(code))
      throw new Error('Diagnostics read as an object: keep it whole');
  }
  const object = statements[diagnosticsIndex].declarationList.declarations[0].initializer;
  const properties = object.properties.filter((property) => read.has(property.name.getText(file)));
  replaced.set(
    diagnosticsIndex,
    `var Diagnostics = {\n${properties.map((property) => `  ${property.getText(file)}`).join(',\n')}\n};`
  );
}

const keptText = [...kept]
  .sort((a, b) => a - b)
  .map((index) => replaced.get(index) ?? statements[index].getText(file))
  .join('\n');
const license = text.slice(0, text.indexOf('*/') + 2);
const exported = [...used].sort();
const out = `${license}
// @xufa/lint: TypeScript ${ts.version}'s parser for the formatter, what lib/prettier/parse uses of typescript.js and
// what that needs (scripts/build-typescript.mjs): do not edit.
${keptText}
module.exports = { ${exported.join(', ')} };
`;

if (process.argv.includes('--check')) {
  if (!fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8') !== out) {
    console.error(
      'lib/typescript/typescript.cjs is not the build of the installed TypeScript: node scripts/build-typescript.mjs'
    );
    process.exit(1);
  }
  console.log('lib/typescript/typescript.cjs is up to date');
} else {
  fs.writeFileSync(OUT, out);
  console.log(
    `lib/typescript/typescript.cjs: TypeScript ${ts.version}, ${kept.size} of ${statements.length} statements, ${(out.length / 1024).toFixed(0)} KB (of ${(text.length / 1024).toFixed(0)})`
  );
}
