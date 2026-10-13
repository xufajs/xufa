// `delete` applied to a plain identifier.

export const meta = {
  type: 'suggestion',
  docs: {
    description: 'Disallow deleting variables',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-delete-var',
  },
  schema: [],
  messages: {
    unexpected: 'Variables should not be deleted.',
  },
};

export function create(context) {
  return {
    UnaryExpression(node) {
      if (node.operator === 'delete' && node.argument.type === 'Identifier') {
        context.report({ node, messageId: 'unexpected' });
      }
    },
  };
}
