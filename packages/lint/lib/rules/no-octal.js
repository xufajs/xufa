// Legacy octal number literals (`071`) and decimals with a leading zero (`09`).

const LEADING_ZERO = /^0\d/u;

export const meta = {
  type: 'suggestion',
  docs: {
    description: 'Disallow octal literals',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-octal',
  },
  schema: [],
  messages: {
    noOctal: 'Octal literals should not be used.',
  },
};

export function create(context) {
  return {
    Literal(node) {
      if (typeof node.value === 'number' && LEADING_ZERO.test(node.raw)) {
        context.report({ node, messageId: 'noOctal' });
      }
    },
  };
}
