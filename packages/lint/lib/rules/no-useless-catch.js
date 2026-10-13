// Catch clauses whose first statement rethrows the caught identifier: the clause when there is a finally block,
// the whole try statement otherwise.

export const meta = {
  type: 'suggestion',
  docs: {
    description: 'Disallow unnecessary `catch` clauses',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-useless-catch',
  },
  schema: [],
  messages: {
    unnecessaryCatchClause: 'Unnecessary catch clause.',
    unnecessaryCatch: 'Unnecessary try/catch wrapper.',
  },
};

export function create(context) {
  return {
    CatchClause(node) {
      const { param } = node;
      if (param?.type !== 'Identifier') return;
      const first = node.body.body[0];
      if (first?.type !== 'ThrowStatement') return;
      const { argument } = first;
      if (argument.type !== 'Identifier' || argument.name !== param.name) return;
      if (node.parent.finalizer) context.report({ node, messageId: 'unnecessaryCatchClause' });
      else context.report({ node: node.parent, messageId: 'unnecessaryCatch' });
    },
  };
}
