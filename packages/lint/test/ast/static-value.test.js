import { Linter } from '../../lib/linter.js';
import { getStaticValue, getStringIfConstant, getPropertyName, findVariable } from '../../lib/ast/static-value.js';
import { ReferenceTracker, READ, CALL, CONSTRUCT } from '../../lib/ast/reference-tracker.js';
import { isParenthesized, isCommentToken } from '../../lib/ast/tokens.js';
import { traverse } from '../../lib/ast/traverse.js';

// The SourceCode of a text (its scopes, its tokens), and its nodes of a type.
function sourceOf(code) {
  const linter = new Linter();
  linter.verify(code, { languageOptions: { sourceType: 'module' } }, 'file.js');
  const sourceCode = linter.getSourceCode();
  const nodes = (type) => {
    const found = [];
    traverse(sourceCode.ast, { enter: (node) => node.type === type && found.push(node) });
    return found;
  };
  return { sourceCode, nodes };
}

// The value of the initializer of the last declarator.
function valueOf(code) {
  const { sourceCode, nodes } = sourceOf(code);
  const declarator = nodes('VariableDeclarator').at(-1);
  return getStaticValue(declarator.init, sourceCode.getScope(declarator));
}

describe('static values', () => {
  it('literals, operators, templates, arrays, objects', () => {
    expect(valueOf('const a = 1 + 2 * 3;')).toEqual({ value: 7 });
    expect(valueOf('const a = `x${1 + 1}y`;')).toEqual({ value: 'x2y' });
    // A hole is kept where it is, but for one after a spread (as eslint-utils does).
    expect(valueOf('const a = [1, , 2];').value).toEqual([1, , 2]); // eslint-disable-line no-sparse-arrays
    expect(valueOf('const a = [1, ...[2, 3], , 4];').value).toEqual([1, 2, 3, 4]);
    expect(valueOf('const a = { b: 1, ["c" + 1]: 2, ...{ d: 3 } };')).toEqual({ value: { b: 1, c1: 2, d: 3 } });
    expect(valueOf('const a = typeof 1 === "number" ? "yes" : "no";')).toEqual({ value: 'yes' });
    expect(valueOf('const a = null ?? "x";')).toEqual({ value: 'x' });
    expect(valueOf('const a = b + 1;')).toBe(null);
  });

  it('constants and builtins; not what may change', () => {
    expect(valueOf('const x = "ab"; const a = x.toUpperCase();')).toEqual({ value: 'AB' });
    expect(valueOf('let x = 2; const a = Math.max(x, 3);')).toEqual({ value: 3 });
    expect(valueOf('let x = 2; x = 5; const a = x;')).toBe(null);
    expect(valueOf('const x = [1]; x.push(2); const a = x;')).toBe(null);
    expect(valueOf('const a = Math.random();')).toBe(null);
    expect(valueOf('const a = new RegExp("a+", "g").flags;')).toEqual({ value: 'g' });
    expect(valueOf('const Math = { max: () => 1 }; const a = Math.max(2, 3);')).toBe(null);
    // An optional chain ends at its ChainExpression: optional is not said of it.
    expect(valueOf('const a = undefined?.b;')).toEqual({ value: undefined });
  });

  it('getStringIfConstant: any value as text, regular expressions as written', () => {
    const { sourceCode, nodes } = sourceOf('f(/a+/u, 10n, 1 + 1, b);');
    const args = nodes('CallExpression')[0].arguments;
    expect(args.map((node) => getStringIfConstant(node, sourceCode.getScope(node)))).toEqual(['/a+/u', '10', '2', null]);
  });

  it('getPropertyName and findVariable', () => {
    const { sourceCode, nodes } = sourceOf('const k = "y"; a.x; a[k]; a[b]; ({ "z": 1 });');
    const scope = sourceCode.getScope(nodes('VariableDeclarator')[0]);
    expect(nodes('MemberExpression').map((node) => getPropertyName(node, scope))).toEqual(['x', 'y', null]);
    expect(getPropertyName(nodes('Property')[0], scope)).toBe('z');
    expect(findVariable(scope, 'k').name).toBe('k');
    expect(findVariable(scope, 'nope')).toBe(null);
  });
});

describe('references of globals', () => {
  it('through the global object, aliases, destructuring and expressions that pass them on', () => {
    const code = [
      'RegExp("a");',
      'new globalThis.RegExp("b");',
      'const R = RegExp; new R("c");',
      'const { max } = Math; max(1);',
      '(0, Math.max)(2);',
      'Math.PI;',
    ].join('\n');
    const { sourceCode } = sourceOf(code);
    const tracker = new ReferenceTracker(sourceCode.scopeManager.globalScope);
    const found = [...tracker.iterateGlobalReferences({ RegExp: { [CALL]: 1, [CONSTRUCT]: 2 }, Math: { max: { [CALL]: 3 }, PI: { [READ]: 4 } } })];
    const kinds = { [READ]: 'read', [CALL]: 'call', [CONSTRUCT]: 'construct' };
    expect(found.map(({ node, path, type }) => `${kinds[type]} ${path.join('.')} line ${node.loc.start.line}`)).toEqual([
      'call RegExp line 1',
      'construct RegExp line 3',
      'call Math.max line 4',
      'call Math.max line 5',
      'read Math.PI line 6',
      'construct RegExp line 2',
    ]);
  });

  it('not of a global the code declares or writes', () => {
    const { sourceCode } = sourceOf('let RegExp = 1; RegExp();');
    const tracker = new ReferenceTracker(sourceCode.scopeManager.globalScope);
    expect([...tracker.iterateGlobalReferences({ RegExp: { [CALL]: true } })]).toEqual([]);
  });
});

describe('tokens', () => {
  it('isParenthesized: parentheses of its own, not those the syntax needs', () => {
    const { sourceCode, nodes } = sourceOf('if (a) f(b); g(((c))); (d) + 1;');
    const named = (name) => nodes('Identifier').find((node) => node.name === name);
    expect(isParenthesized(named('a'), sourceCode)).toBe(false);
    expect(isParenthesized(named('b'), sourceCode)).toBe(false);
    expect(isParenthesized(named('c'), sourceCode)).toBe(true);
    expect(isParenthesized(2, named('c'), sourceCode)).toBe(true);
    expect(isParenthesized(3, named('c'), sourceCode)).toBe(false);
    expect(isParenthesized(named('d'), sourceCode)).toBe(true);
    expect(() => isParenthesized(0, named('d'), sourceCode)).toThrow("'times' should be a positive integer.");
  });

  it('isCommentToken', () => {
    expect([{ type: 'Line' }, { type: 'Block' }, { type: 'Shebang' }, { type: 'Punctuator' }].map(isCommentToken)).toEqual([true, true, true, false]);
  });
});
