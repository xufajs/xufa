// Writes, after the declaration, to variables declared with `const`, `using` or `await using`.

import { getModifyingReferences } from './utils/ast.js';

const CONSTANT_KINDS = new Set(['const', 'using', 'await using']);

export const meta = {
  type: 'problem',
  docs: {
    description: 'Disallow reassigning `const`, `using`, and `await using` variables',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-const-assign',
  },
  schema: [],
  messages: {
    const: "'{{name}}' is constant.",
  },
};

export function create(context) {
  const { sourceCode } = context;

  return {
    VariableDeclaration(node) {
      if (!CONSTANT_KINDS.has(node.kind)) return;
      for (const variable of sourceCode.getDeclaredVariables(node)) {
        for (const { identifier } of getModifyingReferences(variable.references)) {
          context.report({ node: identifier, messageId: 'const', data: { name: identifier.name } });
        }
      }
    },
  };
}
