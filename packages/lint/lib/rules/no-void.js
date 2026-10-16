// ESLint's rule no-void, ported from ESLint 9.39.5 (MIT, see NOTICE.md): ES modules, and what it required replaced by @xufa/lint's.

/**
 * @fileoverview Rule to disallow use of void operator.
 * @author Mike Sidorov
 */

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule = {
  meta: {
    type: 'suggestion',

    defaultOptions: [
      {
        allowAsStatement: false,
      },
    ],

    docs: {
      description: 'Disallow `void` operators',
      recommended: false,
      frozen: true,
      url: 'https://eslint.org/docs/latest/rules/no-void',
    },

    messages: {
      noVoid: "Expected 'undefined' and instead saw 'void'.",
    },

    schema: [
      {
        type: 'object',
        properties: {
          allowAsStatement: {
            type: 'boolean',
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const [{ allowAsStatement }] = context.options;

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    return {
      'UnaryExpression[operator="void"]'(node) {
        if (allowAsStatement && node.parent && node.parent.type === 'ExpressionStatement') {
          return;
        }
        context.report({
          node,
          messageId: 'noVoid',
        });
      },
    };
  },
};

export const { meta, create } = rule;
