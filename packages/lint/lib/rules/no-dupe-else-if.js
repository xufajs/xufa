// Conditions in an if-else-if chain that can never be true: each `||` operand of the condition (and, when it is an
// `&&`, of each of its `&&` operands) is ruled out by an earlier condition having an `||` operand whose `&&`
// operands are all among its own. Conditions compare by tokens, with `||` and `&&` commutative. The condition is
// reported.

import { equalTokens } from './utils/ast.js';

/** The operands of `node` joined by the logical `operator`, flattened. */
function split(operator, node, operands = []) {
  if (node.type === 'LogicalExpression' && node.operator === operator) {
    split(operator, node.left, operands);
    split(operator, node.right, operands);
  } else {
    operands.push(node);
  }
  return operands;
}

const splitByAnd = (node) => split('&&', node);
const splitByOrThenAnd = (node) => split('||', node).map(splitByAnd);

export const meta = {
  type: 'problem',
  docs: {
    description: 'Disallow duplicate conditions in if-else-if chains',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-dupe-else-if',
  },
  schema: [],
  messages: {
    unexpected:
      'This branch can never execute. Its condition is a duplicate or covered by previous conditions in the if-else-if chain.',
  },
};

export function create(context) {
  const { sourceCode } = context;

  /** Whether two expressions are equal as conditions: same tokens, `||` and `&&` operands in any order. */
  const equal = (a, b) => {
    if (a.type !== b.type) return false;
    if (a.type === 'LogicalExpression' && (a.operator === '||' || a.operator === '&&') && a.operator === b.operator) {
      return (equal(a.left, b.left) && equal(a.right, b.right)) || (equal(a.left, b.right) && equal(a.right, b.left));
    }
    return equalTokens(a, b, sourceCode);
  };

  /** Whether every element of `a` equals some element of `b`. */
  const isSubset = (a, b) => a.every((x) => b.some((y) => equal(x, y)));

  return {
    IfStatement(node) {
      const { test } = node;
      const conditions =
        test.type === 'LogicalExpression' && test.operator === '&&' ? [test, ...splitByAnd(test)] : [test];
      // For each condition, its `||` operands, each as its list of `&&` operands, not yet ruled out.
      let remaining = conditions.map(splitByOrThenAnd);

      for (let current = node; current.parent?.type === 'IfStatement' && current.parent.alternate === current;) {
        current = current.parent;
        const previous = splitByOrThenAnd(current.test);
        remaining = remaining.map((operands) =>
          operands.filter((operand) => !previous.some((covering) => isSubset(covering, operand)))
        );
        if (remaining.some((operands) => operands.length === 0)) {
          context.report({ node: test, messageId: 'unexpected' });
          return;
        }
      }
    },
  };
}
