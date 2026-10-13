// `new Promise(async ...)`: an async function as the executor of a Promise. Reported at its `async` keyword.

const isAsyncToken = (token) => token.value === 'async';

export const meta = {
  type: 'problem',
  docs: {
    description: 'Disallow using an async function as a Promise executor',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-async-promise-executor',
  },
  fixable: null,
  schema: [],
  messages: {
    async: 'Promise executor functions should not be async.',
  },
};

export function create(context) {
  const { sourceCode } = context;

  return {
    NewExpression(node) {
      const executor = node.arguments[0];
      if (node.callee.name !== 'Promise' || executor?.async !== true) return;
      context.report({ node: sourceCode.getFirstToken(executor, isAsyncToken), messageId: 'async' });
    },
  };
}
