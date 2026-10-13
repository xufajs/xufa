// Assignments to the name of a function declaration (or of a named function expression, inside it).

import { getModifyingReferences } from './utils/ast.js';

export const meta = {
  type: 'problem',
  docs: {
    description: 'Disallow reassigning `function` declarations',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-func-assign',
  },
  schema: [],
  messages: {
    isAFunction: "'{{name}}' is a function.",
  },
};

export function create(context) {
  const { sourceCode } = context;

  const check = (node) => {
    for (const variable of sourceCode.getDeclaredVariables(node)) {
      if (variable.defs[0].type !== 'FunctionName') continue;
      for (const { identifier } of getModifyingReferences(variable.references)) {
        context.report({ node: identifier, messageId: 'isAFunction', data: { name: identifier.name } });
      }
    }
  };

  return {
    FunctionDeclaration: check,
    FunctionExpression: check,
  };
}
