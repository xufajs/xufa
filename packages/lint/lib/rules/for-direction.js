// `for` loops whose update moves the counter away from the end of the test: `i++` or `i += 1` when the test is
// `i > n` (or `n < i`), `i--` or `i -= 1` when it is `i < n`. Assignments count only when their right side has a
// static numeric, bigint or boolean value. The loop head is reported.

import { getStaticValue } from '../ast/static-value.js';

// The direction the counter must move in when it is the left operand of the test.
const DIRECTIONS = { '<': 1, '<=': 1, '>': -1, '>=': -1 };
const NUMERIC_TYPES = new Set(['bigint', 'boolean', 'number']);

export const meta = {
  type: 'problem',
  docs: {
    description: 'Enforce `for` loop update clause moving the counter in the right direction',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/for-direction',
  },
  fixable: null,
  schema: [],
  messages: {
    incorrectDirection: 'The update clause in this loop moves the variable in the wrong direction.',
  },
};

export function create(context) {
  const { sourceCode } = context;

  /** The sign of the static value of the assignment's right side, 0 when it is unknown, zero or NaN. */
  const rightSign = (update) => {
    const value = getStaticValue(update.right, sourceCode.getScope(update))?.value;
    return NUMERIC_TYPES.has(typeof value) ? Math.sign(Number(value)) || 0 : 0;
  };

  /** How the update moves `counter`: 1 up, -1 down, 0 not at all or not clearly. */
  const updateDirection = (update, counter) => {
    if (update.type === 'UpdateExpression') {
      if (update.argument.type !== 'Identifier' || update.argument.name !== counter) return 0;
      return update.operator === '++' ? 1 : update.operator === '--' ? -1 : 0;
    }
    if (update.type !== 'AssignmentExpression' || update.left.name !== counter) return 0;
    if (update.operator === '+=') return rightSign(update);
    if (update.operator === '-=') return -rightSign(update);
    return 0;
  };

  const report = (node) =>
    context.report({
      loc: { start: node.loc.start, end: sourceCode.getTokenBefore(node.body).loc.end },
      messageId: 'incorrectDirection',
    });

  return {
    ForStatement(node) {
      const { test, update } = node;
      if (test?.type !== 'BinaryExpression' || !update) return;
      const direction = DIRECTIONS[test.operator];
      if (!direction) return;
      const { left, right } = test;
      if (left.type === 'Identifier' && updateDirection(update, left.name) === -direction) report(node);
      if (right.type === 'Identifier' && updateDirection(update, right.name) === direction) report(node);
    },
  };
}
