// `new Symbol(...)` and `new BigInt(...)` where the callee is the global (not declared in the code).

const NAMES = ['Symbol', 'BigInt'];

export const meta = {
  type: 'problem',
  docs: {
    description: 'Disallow `new` operators with global non-constructor functions',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-new-native-nonconstructor',
  },
  schema: [],
  messages: {
    noNewNonconstructor: '`{{name}}` cannot be called as a constructor.',
  },
};

export function create(context) {
  const { sourceCode } = context;

  return {
    'Program:exit'(node) {
      const { set } = sourceCode.getScope(node);
      for (const name of NAMES) {
        const variable = set.get(name);
        if (!variable || variable.defs.length) continue;
        for (const { identifier } of variable.references) {
          const { parent } = identifier;
          if (parent?.type === 'NewExpression' && parent.callee === identifier) {
            context.report({ node: identifier, messageId: 'noNewNonconstructor', data: { name } });
          }
        }
      }
    },
  };
}
