import { Listeners } from '../../lib/ast/listeners.js';
import { traverse } from '../../lib/ast/traverse.js';
import { parse } from '../../lib/parser.js';

// The steps SourceCode#traverse() gives: enter and leave each node.
function stepsOf(code) {
  const steps = [];
  traverse(parse(code, { sourceType: 'module', jsx: false }), {
    enter: (node) => steps.push({ kind: 1, target: node, phase: 1, args: [node] }),
    leave: (node) => steps.push({ kind: 1, target: node, phase: 2, args: [node] }),
  });
  return steps;
}

describe('listeners', () => {
  it('run on enter and exit, the less specific first, then in the order added', () => {
    const calls = [];
    const listeners = new Listeners();
    const listen = (selector) => listeners.add(selector, (node) => calls.push(`${selector} ${node.type}`));
    listen('CallExpression > Identifier');
    listen('Identifier');
    listen('*');
    listen('Identifier:exit');
    listen('[name="f"]');
    listeners.add('Identifier', () => calls.push('Identifier again'));
    listeners.run(stepsOf('f();'));
    expect(calls.filter((call) => call.endsWith('Identifier') || call === 'Identifier again')).toEqual([
      '* Identifier',
      'Identifier Identifier',
      'Identifier again',
      'CallExpression > Identifier Identifier',
      '[name="f"] Identifier',
      'Identifier:exit Identifier',
    ]);
  });

  it('see the ancestors of the node they run on', () => {
    const calls = [];
    const listeners = new Listeners();
    listeners.add('ExpressionStatement > CallExpression > Identifier.callee', (node) => calls.push(node.name));
    listeners.add('BlockStatement Identifier', (node) => calls.push(`in block: ${node.name}`));
    listeners.run(stepsOf('f(a); { g(); }'));
    expect(calls).toEqual(['f', 'in block: g', 'g']);
  });

  it('call events, and mark errors with the node they happened on', () => {
    const listeners = new Listeners();
    const events = [];
    listeners.add('onCodePathStart', (codePath, node) => events.push(node.type));
    listeners.add('Literal', () => {
      throw new Error('boom');
    });
    const steps = stepsOf('a; 1;');
    listeners.run([{ kind: 2, target: 'onCodePathStart', args: [{}, steps[0].target] }, ...steps.slice(0, 4)]);
    expect(events).toEqual(['Program']);
    let error;
    try {
      listeners.run(steps);
    } catch (thrown) {
      error = thrown;
    }
    expect(error.message).toBe('boom');
    expect(error.currentNode.type).toBe('Literal');
  });
});
