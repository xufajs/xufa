// Writes to the parameter of a catch clause (including the names destructured from it).

import { getModifyingReferences } from './utils/ast.js';

export const meta = {
  type: 'problem',
  docs: {
    description: 'Disallow reassigning exceptions in `catch` clauses',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-ex-assign',
  },
  schema: [],
  messages: {
    unexpected: 'Do not assign to the exception parameter.',
  },
};

export function create(context) {
  const { sourceCode } = context;

  return {
    CatchClause(node) {
      if (!node.param) return;
      for (const variable of sourceCode.getDeclaredVariables(node)) {
        for (const { identifier } of getModifyingReferences(variable.references)) {
          context.report({ node: identifier, messageId: 'unexpected' });
        }
      }
    },
  };
}
