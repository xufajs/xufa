import { analyze } from '../../lib/scope/index.js';
import { parse } from '../../lib/parser.js';

// The analysis of a text, as ESLint asks for it.
function analyzeText(text, { sourceType = 'module', ecmaVersion = 2026, ...options } = {}) {
  const ast = parse(text, { sourceType, jsx: false });
  return { ast, manager: analyze(ast, { ignoreEval: true, ecmaVersion, sourceType, ...options }) };
}

const typesOf = (manager) => manager.scopes.map((scope) => scope.type);
const namesOf = (scope) => scope.variables.map((variable) => variable.name);
const referencesOf = (scope) =>
  scope.references.map((ref) => `${ref.identifier.name}:${ref.isRead() ? 'r' : ''}${ref.isWrite() ? 'w' : ''}`);

describe('scope analysis', () => {
  it('a module: global, module, the scopes of functions and blocks', () => {
    const { manager } = analyzeText('import a from "a"; export function f(b) { if (b) { let c = a; } }');
    expect(typesOf(manager)).toEqual(['global', 'module', 'function', 'block']);
    const [global, module, fn, block] = manager.scopes;
    expect(manager.globalScope).toBe(global);
    expect(global.isStrict).toBe(false);
    expect(module.isStrict).toBe(true);
    expect(namesOf(module)).toEqual(['a', 'f']);
    expect(namesOf(fn)).toEqual(['arguments', 'b']);
    expect(namesOf(block)).toEqual(['c']);
    expect(block.references[1].resolved).toBe(module.set.get('a'));
    expect(module.set.get('a').defs[0].type).toBe('ImportBinding');
  });

  it('commonjs: a function scope around the code; var to it, references of globals through', () => {
    const { manager } = analyzeText('"use strict"; var a = require("x"); b = 1;', { sourceType: 'commonjs' });
    expect(typesOf(manager)).toEqual(['global', 'function']);
    const [global, fn] = manager.scopes;
    expect(global.isStrict).toBe(false);
    expect(fn.isStrict).toBe(true);
    expect(namesOf(fn)).toEqual(['arguments', 'a']);
    expect(global.through.map((ref) => ref.identifier.name)).toEqual(['require', 'b']);
    expect(global.implicit.variables).toEqual([]);
  });

  it('var to the function, let to the block; global vars are not resolved, let is', () => {
    const { manager } = analyzeText('var a; let b; { var c; let d; } a; b;', { sourceType: 'script' });
    const [global, block] = manager.scopes;
    expect(namesOf(global)).toEqual(['a', 'b', 'c']);
    expect(namesOf(block)).toEqual(['d']);
    expect(global.through.map((ref) => ref.identifier.name)).toEqual(['a']);
    expect(global.set.get('b').references).toHaveLength(1);
  });

  it('implicit globals: assignments to undeclared names outside strict code', () => {
    const { manager } = analyzeText('a = 1; for (b in {}); function f() { "use strict"; c = 2; }', { sourceType: 'script' });
    expect(manager.globalScope.implicit.variables.map((variable) => variable.name)).toEqual(['a', 'b']);
    expect(manager.globalScope.implicit.variables[0].defs[0].type).toBe('ImplicitGlobalVariable');
  });

  it('parameters: defaults, rest, destructuring; their definitions and writes', () => {
    const { manager } = analyzeText('function f(a, { b = a, [k]: c } = {}, ...d) {}');
    const fn = manager.scopes.find((scope) => scope.type === 'function');
    expect(namesOf(fn)).toEqual(['arguments', 'a', 'b', 'c', 'd']);
    const defs = Object.fromEntries(fn.variables.slice(1).map((variable) => [variable.name, variable.defs[0]]));
    expect(defs.a.index).toBe(0);
    expect(defs.b.index).toBe(1);
    expect(defs.d.rest).toBe(true);
    expect(defs.c.rest).toBe(false);
    // Each name's writes by the defaults it is inside (the outer one first: of part of it), then the expressions of
    // the pattern.
    expect(referencesOf(fn)).toEqual(['b:w', 'b:w', 'c:w', 'a:r', 'k:r']);
    expect(fn.references.map((ref) => ref.partial)).toEqual([true, false, true, undefined, undefined]);
    expect(fn.references[0].init).toBe(true);
  });

  it('a default in the parameters does not see a var of the body', () => {
    const { manager } = analyzeText('let b; function f(a = b) { var b; }');
    const fn = manager.scopes.find((scope) => scope.type === 'function');
    const reference = fn.references.find((ref) => ref.identifier.name === 'b');
    expect(reference.resolved.scope.type).toBe('module');
  });

  it('assignments: the order of references in a destructuring with member expressions', () => {
    const { manager } = analyzeText('let a, o, k, v; [a, o[k], ...o.p] = v; a += 1; a++;');
    expect(referencesOf(manager.scopes[1])).toEqual(['a:w', 'k:r', 'o:r', 'o:r', 'v:r', 'a:rw', 'a:rw']);
    const [write] = manager.scopes[1].references;
    expect(write.partial).toBe(true);
    expect(write.writeExpr.name).toBe('v');
    expect('writeExpr' in manager.scopes[1].references[1]).toBe(false);
  });

  it('for-in and for-of: a scope with let, writes of the left from the right', () => {
    const { manager } = analyzeText('for (const a of b) a; for (var c in d) c;');
    expect(typesOf(manager)).toEqual(['global', 'module', 'for']);
    const forScope = manager.scopes[2];
    expect(referencesOf(forScope)).toEqual(['a:w', 'b:r', 'a:r']);
    expect(forScope.references[0].partial).toBe(true);
    expect(forScope.references[0].init).toBe(true);
  });

  it('classes: the name outside and inside, fields and static blocks', () => {
    const { manager } = analyzeText('class A extends B { x = this.y; static { A; } m() { return A; } }');
    expect(typesOf(manager)).toEqual(['global', 'module', 'class', 'class-field-initializer', 'class-static-block', 'function']);
    const [, module, klass, field] = manager.scopes;
    expect(module.set.get('A').defs[0].parent).toBe(null);
    expect(klass.set.get('A').defs[0].parent).toBe(undefined);
    expect(klass.set.get('A').references).toHaveLength(2);
    expect(field.variableScope).toBe(field);
    expect(field.thisFound).toBe(true);
  });

  it('a named function expression: a scope for its name, acquire() the outer or the inner', () => {
    const { ast, manager } = analyzeText('(function f() { f; });');
    const node = ast.body[0].expression;
    expect(manager.acquireAll(node).map((scope) => scope.type)).toEqual(['function-expression-name', 'function']);
    expect(manager.acquire(node).type).toBe('function-expression-name');
    expect(manager.acquire(node, true).type).toBe('function');
    expect(manager.acquireAll(node)[0].functionExpressionScope).toBe(true);
  });

  it('with: its references tainted, left to the scopes around', () => {
    const { manager } = analyzeText('var a; with (o) { a; }', { sourceType: 'script' });
    const withScope = manager.scopes.find((scope) => scope.type === 'with');
    const reference = withScope.through.find((ref) => ref.identifier.name === 'a');
    expect(reference.tainted).toBe(true);
    expect(withScope.dynamic).toBe(true);
  });

  it('not references: labels, keys, members, import.meta, private names', () => {
    const { manager } = analyzeText('a: for (;;) { break a; } ({ b: c, [d]: e }); f.g; import.meta; class H { #i; j() { this.#i; } }');
    expect(manager.scopes.flatMap((scope) => scope.references).map((ref) => ref.identifier.name)).toEqual(['c', 'd', 'e', 'f']);
  });

  it('getDeclaredVariables: of declarations, declarators, functions, imports', () => {
    const { ast, manager } = analyzeText('import { a, b as c } from "x"; const [d, e] = [], f = 1; function g(h) {}');
    const names = (node) => manager.getDeclaredVariables(node).map((variable) => variable.name);
    expect(names(ast.body[0])).toEqual(['a', 'c']);
    expect(names(ast.body[0].specifiers[1])).toEqual(['c']);
    expect(names(ast.body[1])).toEqual(['d', 'e', 'f']);
    expect(names(ast.body[1].declarations[0])).toEqual(['d', 'e']);
    expect(names(ast.body[2])).toEqual(['g', 'h']);
    expect(names(ast.body[2].id)).toEqual([]);
  });

  it('ES5: no block scopes; ES3: nothing strict', () => {
    expect(typesOf(analyzeText('{ var a; } switch (a) {}', { sourceType: 'script', ecmaVersion: 5 }).manager)).toEqual([
      'global',
    ]);
    const { manager } = analyzeText('"use strict"; function f() {}', { sourceType: 'script', ecmaVersion: 3 });
    expect(manager.scopes.every((scope) => scope.isStrict === false)).toBe(true);
  });

  it('impliedStrict and nodejsScope', () => {
    expect(analyzeText('a;', { sourceType: 'script', impliedStrict: true }).manager.globalScope.isStrict).toBe(true);
    expect(typesOf(analyzeText('a;', { sourceType: 'script', nodejsScope: true }).manager)).toEqual(['global', 'function']);
  });
});
