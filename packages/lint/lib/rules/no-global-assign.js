// Writes to read-only globals (builtins and globals configured as readonly), except the names in `exceptions`.

export const meta = {
  type: 'suggestion',
  defaultOptions: [{ exceptions: [] }],
  docs: {
    description: 'Disallow assignments to native objects or read-only global variables',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-global-assign',
  },
  schema: [
    {
      type: 'object',
      properties: {
        exceptions: { type: 'array', items: { type: 'string' }, uniqueItems: true },
      },
      additionalProperties: false,
    },
  ],
  messages: {
    globalShouldNotBeModified: "Read-only global '{{name}}' should not be modified.",
  },
};

export function create(context) {
  const { sourceCode } = context;
  const [{ exceptions }] = context.options;

  return {
    Program(node) {
      for (const variable of sourceCode.getScope(node).variables) {
        if (variable.writeable !== false || exceptions.includes(variable.name)) continue;
        const { references } = variable;
        for (let i = 0; i < references.length; i++) {
          const reference = references[i];
          const { identifier } = reference;
          if (reference.init !== false || !reference.isWrite()) continue;
          // A destructuring default can make several write references for one identifier: report it once.
          if (i > 0 && references[i - 1].identifier === identifier) continue;
          context.report({
            node: identifier,
            messageId: 'globalShouldNotBeModified',
            data: { name: identifier.name },
          });
        }
      }
    },
  };
}
