// Comparisons against -0 (`x === -0`, `-0 < x`, ...), which do not tell -0 from 0. Equality and relational
// operators only.

const OPERATORS = new Set(['>', '>=', '<', '<=', '==', '===', '!=', '!==']);

/** Whether `node` is the expression `-0`. */
const isNegZero = (node) =>
  node.type === 'UnaryExpression' &&
  node.operator === '-' &&
  node.argument.type === 'Literal' &&
  node.argument.value === 0;

export const meta = {
  type: 'problem',
  docs: {
    description: 'Disallow comparing against `-0`',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-compare-neg-zero',
  },
  fixable: null,
  schema: [],
  messages: {
    unexpected: "Do not use the '{{operator}}' operator to compare against -0.",
  },
};

export function create(context) {
  return {
    BinaryExpression(node) {
      const { operator } = node;
      if (!OPERATORS.has(operator)) return;
      if (isNegZero(node.left) || isNegZero(node.right)) {
        context.report({ node, messageId: 'unexpected', data: { operator } });
      }
    },
  };
}
