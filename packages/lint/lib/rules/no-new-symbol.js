// ESLint's rule no-new-symbol, ported from ESLint 9.39.5 (MIT, see NOTICE.md): ES modules, and what it required replaced by @xufa/lint's.

/**
 * @fileoverview Rule to disallow use of the new operator with the `Symbol` object
 * @author Alberto Rodríguez
 * @deprecated in ESLint v9.0.0
 */

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule = {
  meta: {
    type: 'problem',

    docs: {
      description: 'Disallow `new` operators with the `Symbol` object',
      recommended: false,
      url: 'https://eslint.org/docs/latest/rules/no-new-symbol',
    },

    deprecated: {
      message: 'The rule was replaced with a more general rule.',
      url: 'https://eslint.org/docs/latest/use/migrate-to-9.0.0#eslint-recommended',
      deprecatedSince: '9.0.0',
      availableUntil: '11.0.0',
      replacedBy: [
        {
          rule: {
            name: 'no-new-native-nonconstructor',
            url: 'https://eslint.org/docs/latest/rules/no-new-native-nonconstructor',
          },
        },
      ],
    },

    schema: [],

    messages: {
      noNewSymbol: '`Symbol` cannot be called as a constructor.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;

    return {
      'Program:exit'(node) {
        const globalScope = sourceCode.getScope(node);
        const variable = globalScope.set.get('Symbol');

        if (variable && variable.defs.length === 0) {
          variable.references.forEach((ref) => {
            const idNode = ref.identifier;
            const parent = idNode.parent;

            if (parent && parent.type === 'NewExpression' && parent.callee === idNode) {
              context.report({
                node: idNode,
                messageId: 'noNewSymbol',
              });
            }
          });
        }
      },
    };
  },
};

export const { meta, create } = rule;
