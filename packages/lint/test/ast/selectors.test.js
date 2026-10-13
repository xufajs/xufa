import { parse, parseSelector } from '../../lib/ast/selectors.js';
import { traverse } from '../../lib/ast/traverse.js';
import { parse as parseCode } from '../../lib/parser.js';

// The nodes of a text a selector matches, as `type` or `type:text`.
function matching(selector, code) {
  const { test } = parse(selector);
  const ast = parseCode(code, { sourceType: 'module', jsx: false });
  const stack = [];
  const found = [];
  traverse(ast, {
    enter(node) {
      if (test(node, stack, stack.length)) found.push(node.name ?? node.value ?? node.type);
      stack.push(node);
    },
    leave() {
      stack.pop();
    },
  });
  return found;
}

describe('selectors: parsing', () => {
  it('a type, a wildcard, :exit', () => {
    expect(parse('Identifier')).toMatchObject({ root: { type: 'identifier', value: 'Identifier' }, isExit: false });
    expect(parse('*:exit')).toMatchObject({ root: { type: 'wildcard' }, isExit: true, nodeTypes: null });
  });

  it("esquery's trees", () => {
    expect(parseSelector('A > B.c[d=1], :not(E)')).toEqual({
      type: 'matches',
      selectors: [
        {
          type: 'child',
          left: { type: 'identifier', value: 'A' },
          right: {
            type: 'compound',
            selectors: [
              { type: 'identifier', value: 'B' },
              { type: 'field', name: 'c' },
              { type: 'attribute', name: 'd', operator: '=', value: { type: 'literal', value: 1 } },
            ],
          },
        },
        { type: 'not', selectors: [{ type: 'identifier', value: 'E' }] },
      ],
    });
    expect(parseSelector(':has(> A)')).toEqual({
      type: 'has',
      selectors: [{ type: 'child', left: { type: 'exactNode' }, right: { type: 'identifier', value: 'A' } }],
    });
    expect(parseSelector('[a=/b\\/c[/]/iu]').value.value).toEqual(/b\/c[/]/iu);
    expect(parseSelector(":nth-last-child(2)")).toEqual({ type: 'nth-last-child', index: { type: 'literal', value: 2 } });
  });

  it("errors say where and what esquery expected", () => {
    expect(() => parse('A >')).toThrow('Syntax error in selector "A >" at position 3:');
    expect(() => parse('[a=]')).toThrow(/^Syntax error in selector "\[a=\]" at position 3: Expected /);
  });

  it('specificity: attributes, then types, then the text', () => {
    const order = ['A[b] C', 'A', 'B', 'A > B', '*'].map(parse).sort((a, b) => a.compare(b)).map((s) => s.source);
    expect(order).toEqual(['*', 'A', 'B', 'A > B', 'A[b] C']);
    expect(parse(':matches(A, B[c])').nodeTypes).toEqual(['A', 'B']);
    expect(parse(':matches(A, [c])').nodeTypes).toBe(null);
    expect(parse(':function').nodeTypes).toEqual(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
  });
});

describe('selectors: matching', () => {
  const code = 'const a = f(1); if (a) { g(a, "s"); } function h(x) { return x; }';

  it('types without case, attributes, regular expressions, type()', () => {
    expect(matching('callexpression > Identifier', code)).toEqual(['f', 'g', 'a']);
    expect(matching('Literal[value=1]', code)).toEqual([1]);
    expect(matching('Literal[value=/^s/]', code)).toEqual(['s']);
    expect(matching('Literal[value=type(string)]', code)).toEqual(['s']);
    expect(matching('Literal[value>0]', code)).toEqual([1]);
    expect(matching('CallExpression[callee.name!="f"]', code)).toEqual(['CallExpression']);
  });

  it('fields, descendants, siblings, positions', () => {
    // A field is where the node is in its parent: a callee, of anything.
    expect(matching('CallExpression > .callee', code)).toEqual(['f', 'g']);
    expect(matching('CallExpression.callee', code)).toEqual([]);
    expect(matching('IfStatement Identifier', code)).toEqual(['a', 'g', 'a']);
    expect(matching('VariableDeclaration ~ FunctionDeclaration', code)).toEqual(['FunctionDeclaration']);
    expect(matching('VariableDeclaration + FunctionDeclaration', code)).toEqual([]);
    expect(matching('CallExpression > :last-child', code)).toEqual([1, 's']);
    expect(matching('Program > :nth-child(2)', code)).toEqual(['IfStatement']);
  });

  it(':not, :matches, :has, classes', () => {
    expect(matching('CallExpression > :not(Identifier)', code)).toEqual([1, 's']);
    expect(matching(':matches(ReturnStatement, IfStatement)', code)).toEqual(['IfStatement', 'ReturnStatement']);
    expect(matching('FunctionDeclaration:has(ReturnStatement)', code)).toEqual(['FunctionDeclaration']);
    expect(matching('BlockStatement:has(> ExpressionStatement)', code)).toEqual(['BlockStatement']);
    expect(matching(':function', code)).toEqual(['FunctionDeclaration']);
    expect(matching('ReturnStatement > :expression', code)).toEqual(['x']);
    expect(() => matching(':nope', code)).toThrow('Unknown class name: nope');
  });
});
