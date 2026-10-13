// Every `with` statement.

export const meta = {
  type: 'suggestion',
  docs: {
    description: 'Disallow `with` statements',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-with',
  },
  schema: [],
  messages: {
    unexpectedWith: "Unexpected use of 'with' statement.",
  },
};

export function create(context) {
  return {
    WithStatement(node) {
      context.report({ node, messageId: 'unexpectedWith' });
    },
  };
}
