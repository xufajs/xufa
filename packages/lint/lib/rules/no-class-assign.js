// Writes to the name of a class: the binding of a class declaration (anywhere in its scope) or the inner name of a
// class expression (inside the class).

import { getModifyingReferences } from './utils/ast.js';

export const meta = {
  type: 'problem',
  docs: {
    description: 'Disallow reassigning class members',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-class-assign',
  },
  schema: [],
  messages: {
    class: "'{{name}}' is a class.",
  },
};

export function create(context) {
  const { sourceCode } = context;

  const check = (node) => {
    for (const variable of sourceCode.getDeclaredVariables(node)) {
      for (const { identifier } of getModifyingReferences(variable.references)) {
        context.report({ node: identifier, messageId: 'class', data: { name: identifier.name } });
      }
    }
  };

  return { ClassDeclaration: check, ClassExpression: check };
}
