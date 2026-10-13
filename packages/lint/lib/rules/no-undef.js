// References to variables that are not declared anywhere (nor as a configured or `/* global */` global). The
// operand of `typeof` is ignored unless the `typeof` option is set.

export const meta = {
  type: 'problem',
  defaultOptions: [{ typeof: false }],
  docs: {
    description: 'Disallow the use of undeclared variables unless mentioned in `/*global */` comments',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-undef',
  },
  schema: [
    {
      type: 'object',
      properties: { typeof: { type: 'boolean' } },
      additionalProperties: false,
    },
  ],
  messages: {
    undef: "'{{name}}' is not defined.",
  },
};

export function create(context) {
  const [{ typeof: considerTypeof }] = context.options;
  const { sourceCode } = context;

  return {
    'Program:exit'(node) {
      for (const { identifier } of sourceCode.getScope(node).through) {
        const { parent } = identifier;
        if (!considerTypeof && parent.type === 'UnaryExpression' && parent.operator === 'typeof') continue;
        context.report({ node: identifier, messageId: 'undef', data: { name: identifier.name } });
      }
    },
  };
}
