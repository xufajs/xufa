// Destructuring patterns that bind nothing: `{}` and `[]`. With allowObjectPatternsAsParameters, a function
// parameter `{}` or `{} = {}` is allowed.

import { isFunction } from './utils/ast.js';

/** Whether the empty object pattern is a parameter, alone or defaulting to `{}`. */
function isEmptyObjectParameter(node) {
  const { parent } = node;
  if (isFunction(parent)) return true;
  return (
    parent.type === 'AssignmentPattern' &&
    isFunction(parent.parent) &&
    parent.right.type === 'ObjectExpression' &&
    parent.right.properties.length === 0
  );
}

export const meta = {
  type: 'problem',
  defaultOptions: [{ allowObjectPatternsAsParameters: false }],
  docs: {
    description: 'Disallow empty destructuring patterns',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-empty-pattern',
  },
  schema: [
    {
      type: 'object',
      properties: { allowObjectPatternsAsParameters: { type: 'boolean' } },
      additionalProperties: false,
    },
  ],
  messages: {
    unexpected: 'Unexpected empty {{type}} pattern.',
  },
};

export function create(context) {
  const [{ allowObjectPatternsAsParameters }] = context.options;

  return {
    ObjectPattern(node) {
      if (node.properties.length) return;
      if (allowObjectPatternsAsParameters && isEmptyObjectParameter(node)) return;
      context.report({ node, messageId: 'unexpected', data: { type: 'object' } });
    },

    ArrayPattern(node) {
      if (!node.elements.length) context.report({ node, messageId: 'unexpected', data: { type: 'array' } });
    },
  };
}
