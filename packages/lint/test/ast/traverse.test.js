import { traverse } from '../../lib/ast/traverse.js';
import { parse } from '../../lib/parser.js';

describe('traverse', () => {
  const ast = parse('a(b); { c; }', { sourceType: 'module', jsx: false });

  it('enters and leaves each node, depth first, with its parent', () => {
    const events = [];
    traverse(ast, {
      enter: (node, parent) => events.push(`> ${node.type} ${parent?.type ?? '-'}`),
      leave: (node) => events.push(`< ${node.type}`),
    });
    expect(events.slice(0, 6)).toEqual([
      '> Program -',
      '> ExpressionStatement Program',
      '> CallExpression ExpressionStatement',
      '> Identifier CallExpression',
      '< Identifier',
      '> Identifier CallExpression',
    ]);
    expect(events.at(-1)).toBe('< Program');
  });

  it('skip() leaves out the children; break() ends the walk', () => {
    const entered = [];
    traverse(ast, {
      enter(node) {
        entered.push(node.type);
        if (node.type === 'CallExpression') this.skip();
        if (node.type === 'BlockStatement') this.break();
      },
    });
    expect(entered).toEqual(['Program', 'ExpressionStatement', 'CallExpression', 'BlockStatement']);
  });
});
