// A negated left operand of `in` or `instanceof` (and, with enforceForOrderingRelations, of <, >, <= and >=) not
// wrapped in parentheses, as in `!key in object`. Suggested: negating the whole expression, or parenthesising the
// negation to keep the current behaviour.

import { isParenthesised } from './utils/ast.js';

const IN_OR_INSTANCEOF = new Set(['in', 'instanceof']);
const ORDERING = new Set(['<', '>', '<=', '>=']);

export const meta = {
  type: 'problem',
  defaultOptions: [{ enforceForOrderingRelations: false }],
  docs: {
    description: 'Disallow negating the left operand of relational operators',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-unsafe-negation',
  },
  hasSuggestions: true,
  schema: [
    {
      type: 'object',
      properties: { enforceForOrderingRelations: { type: 'boolean' } },
      additionalProperties: false,
    },
  ],
  fixable: null,
  messages: {
    unexpected: "Unexpected negating the left operand of '{{operator}}' operator.",
    suggestNegatedExpression:
      "Negate '{{operator}}' expression instead of its left operand. This changes the current behavior.",
    suggestParenthesisedNegation:
      "Wrap negation in '()' to make the intention explicit. This preserves the current behavior.",
  },
};

export function create(context) {
  const { sourceCode } = context;
  const [{ enforceForOrderingRelations }] = context.options;

  return {
    BinaryExpression(node) {
      const { operator, left } = node;
      if (!IN_OR_INSTANCEOF.has(operator) && !(enforceForOrderingRelations && ORDERING.has(operator))) return;
      if (left.type !== 'UnaryExpression' || left.operator !== '!' || isParenthesised(sourceCode, left)) return;

      context.report({
        node,
        loc: left.loc,
        messageId: 'unexpected',
        data: { operator },
        suggest: [
          {
            messageId: 'suggestNegatedExpression',
            data: { operator },
            fix(fixer) {
              // Everything after the `!`, up to the end of the expression, goes in parentheses.
              const range = [sourceCode.getFirstToken(left).range[1], node.range[1]];
              return fixer.replaceTextRange(range, `(${sourceCode.text.slice(...range)})`);
            },
          },
          {
            messageId: 'suggestParenthesisedNegation',
            fix: (fixer) => fixer.replaceText(left, `(${sourceCode.getText(left)})`),
          },
        ],
      });
    },
  };
}
