// Boolean casts whose result is coerced to a boolean anyway: `!!x` and `Boolean(x)` as the test of an if, a loop or
// a ternary, as the operand of `!` or the argument of Boolean(). With enforceForLogicalOperands also as operands of
// `||` / `&&` in such a context, and with enforceForInnerExpressions as the right side of `??`, a branch of a ternary
// or the last expression of a sequence too. Fixed by removing the cast, unless it holds comments.

import { getPrecedence, isMixedLogicalAndCoalesceExpressions, canTokensBeAdjacent } from './utils/ast.js';
import { isParenthesized } from '../ast/tokens.js';

// Node types whose `test` is coerced to a boolean.
const TEST_PARENT_TYPES = new Set([
  'IfStatement',
  'DoWhileStatement',
  'WhileStatement',
  'ConditionalExpression',
  'ForStatement',
]);

const ASSIGNMENT_PRECEDENCE = getPrecedence({ type: 'AssignmentExpression' });

const isNot = (node) => node.type === 'UnaryExpression' && node.operator === '!';

const isBooleanCall = (node) =>
  (node.type === 'CallExpression' || node.type === 'NewExpression') &&
  node.callee.type === 'Identifier' &&
  node.callee.name === 'Boolean';

/** Whether the value of `node` is coerced to a boolean by its parent. */
function isInBooleanContext(node) {
  const { parent } = node;
  return (
    (isBooleanCall(parent) && node === parent.arguments[0]) ||
    (TEST_PARENT_TYPES.has(parent.type) && node === parent.test) ||
    isNot(parent)
  );
}

export const meta = {
  type: 'suggestion',
  defaultOptions: [{}],
  docs: {
    description: 'Disallow unnecessary boolean casts',
    recommended: true,
    frozen: true,
    url: 'https://eslint.org/docs/latest/rules/no-extra-boolean-cast',
  },
  schema: [
    {
      anyOf: [
        {
          type: 'object',
          properties: { enforceForInnerExpressions: { type: 'boolean' } },
          additionalProperties: false,
        },
        // deprecated
        {
          type: 'object',
          properties: { enforceForLogicalOperands: { type: 'boolean' } },
          additionalProperties: false,
        },
      ],
    },
  ],
  fixable: 'code',
  messages: {
    unexpectedCall: 'Redundant Boolean call.',
    unexpectedNegation: 'Redundant double negation.',
  },
};

export function create(context) {
  const { sourceCode } = context;
  const [{ enforceForLogicalOperands, enforceForInnerExpressions }] = context.options;
  const enforceForLogical = enforceForLogicalOperands || enforceForInnerExpressions;

  /** Whether the value of `node` ends up coerced to a boolean, looking through the enclosing expressions enabled. */
  function isInFlaggedContext(node) {
    const { parent } = node;
    if (parent.type === 'ChainExpression') return isInFlaggedContext(parent);
    if (enforceForLogical && parent.type === 'LogicalExpression') {
      if (parent.operator === '||' || parent.operator === '&&') return isInFlaggedContext(parent);
      if (enforceForInnerExpressions && parent.operator === '??' && parent.right === node) {
        return isInFlaggedContext(parent);
      }
    }
    if (enforceForInnerExpressions) {
      if (parent.type === 'ConditionalExpression' && (parent.consequent === node || parent.alternate === node)) {
        return isInFlaggedContext(parent);
      }
      // Only the last expression of a sequence gives its value.
      if (parent.type === 'SequenceExpression' && parent.expressions.at(-1) === node) {
        return isInFlaggedContext(parent);
      }
    }
    return isInBooleanContext(node);
  }

  const hasCommentsInside = (node) => sourceCode.getCommentsInside(node).length > 0;

  // Whether `node` needs parentheses to replace `reported`, a node in a flagged context (so its parent is one of
  // the types below, and its place in the parent is known).
  function needsParens(reported, node) {
    const { parent } = reported;
    if (parent.type === 'ChainExpression') return needsParens(parent, node);
    // Parentheses around the reported node stay.
    if (isParenthesized(1, reported, sourceCode)) return false;
    switch (parent.type) {
      case 'CallExpression':
      case 'NewExpression':
        return node.type === 'SequenceExpression';
      case 'ConditionalExpression':
        if (reported === parent.test) return getPrecedence(node) <= getPrecedence(parent);
        return getPrecedence(node) < ASSIGNMENT_PRECEDENCE;
      case 'UnaryExpression':
        return getPrecedence(node) < getPrecedence(parent);
      case 'LogicalExpression':
        if (isMixedLogicalAndCoalesceExpressions(node, parent)) return true;
        if (reported === parent.left) return getPrecedence(node) < getPrecedence(parent);
        return getPrecedence(node) <= getPrecedence(parent);
      default:
        // IfStatement, DoWhileStatement, WhileStatement, ForStatement, SequenceExpression
        return false;
    }
  }

  // Replaces `node` by `text`, with a space before when it would otherwise merge with the preceding token.
  function replaceSpaced(fixer, node, text, firstToken) {
    const before = sourceCode.getTokenBefore(node);
    const space = before && before.range[1] === node.range[0] && !canTokensBeAdjacent(before, firstToken);
    return fixer.replaceText(node, space ? ` ${text}` : text);
  }

  return {
    UnaryExpression(node) {
      const { parent } = node;
      if (node.operator !== '!' || !isNot(parent) || !isInFlaggedContext(parent)) return;
      context.report({
        node: parent,
        messageId: 'unexpectedNegation',
        fix(fixer) {
          if (hasCommentsInside(parent)) return null;
          const { argument } = node;
          const text = sourceCode.getText(argument);
          if (needsParens(parent, argument)) return fixer.replaceText(parent, `(${text})`);
          return replaceSpaced(fixer, parent, text, sourceCode.getFirstToken(argument));
        },
      });
    },

    CallExpression(node) {
      if (node.callee.type !== 'Identifier' || node.callee.name !== 'Boolean' || !isInFlaggedContext(node)) return;
      context.report({
        node,
        messageId: 'unexpectedCall',
        fix(fixer) {
          const { parent, arguments: args } = node;
          if (args.length === 0) {
            // !Boolean() -> true
            if (isNot(parent)) return hasCommentsInside(parent) ? null : replaceSpaced(fixer, parent, 'true', 'true');
            // Boolean() -> false
            return hasCommentsInside(node) ? null : fixer.replaceText(node, 'false');
          }
          if (args.length > 1) return null;
          const [argument] = args;
          if (argument.type === 'SpreadElement' || hasCommentsInside(node)) return null;
          const text = sourceCode.getText(argument);
          return fixer.replaceText(node, needsParens(node, argument) ? `(${text})` : text);
        },
      });
    },
  };
}
