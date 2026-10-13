// Assignments in the test of an if, while, do...while, for or conditional expression. With "except-parens" (the
// default) a test that is itself an assignment is reported unless it is wrapped in an extra pair of parentheses (one
// pair for a `for`, whose test has no parentheses of its own). With "always" every assignment inside a test is
// reported, looking up to the enclosing function.

import { isFunction, isParenthesised, isOpeningParenToken, isClosingParenToken } from './utils/ast.js';

const TEST_PARENT_TYPES = new Set([
  'IfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'ForStatement',
  'ConditionalExpression',
]);

const DESCRIPTIONS = {
  DoWhileStatement: "a 'do...while' statement",
  ForStatement: "a 'for' statement",
  IfStatement: "an 'if' statement",
  WhileStatement: "a 'while' statement",
};

export const meta = {
  type: 'problem',
  defaultOptions: ['except-parens'],
  docs: {
    description: 'Disallow assignment operators in conditional expressions',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-cond-assign',
  },
  schema: [{ enum: ['except-parens', 'always'] }],
  messages: {
    unexpected: 'Unexpected assignment within {{type}}.',
    // Must match JSHint's message.
    missing: 'Expected a conditional expression and instead saw an assignment.',
  },
};

export function create(context) {
  const [prohibitAssign] = context.options;
  const { sourceCode } = context;

  if (prohibitAssign === 'always') {
    return {
      AssignmentExpression(node) {
        for (let current = node; current && !isFunction(current); current = current.parent) {
          const { parent } = current;
          if (parent?.test === current && TEST_PARENT_TYPES.has(parent.type)) {
            context.report({
              node,
              messageId: 'unexpected',
              data: { type: DESCRIPTIONS[parent.type] || parent.type },
            });
            return;
          }
        }
      },
    };
  }

  /** Whether the node is wrapped in two pairs of parentheses. */
  const isParenthesisedTwice = (node) => {
    const before = sourceCode.getTokenBefore(node, 1);
    const after = sourceCode.getTokenAfter(node, 1);
    return (
      isParenthesised(sourceCode, node) &&
      before &&
      isOpeningParenToken(before) &&
      before.range[1] <= node.range[0] &&
      isClosingParenToken(after) &&
      after.range[0] >= node.range[1]
    );
  };

  const checkTest = (node) => {
    const { test } = node;
    if (test?.type !== 'AssignmentExpression') return;
    const wrapped = node.type === 'ForStatement' ? isParenthesised(sourceCode, test) : isParenthesisedTwice(test);
    if (!wrapped) context.report({ node: test, messageId: 'missing' });
  };

  return {
    DoWhileStatement: checkTest,
    ForStatement: checkTest,
    IfStatement: checkTest,
    WhileStatement: checkTest,
    ConditionalExpression: checkTest,
  };
}
