// ESLint's rule no-new, ported from ESLint 9.39.5 (MIT, see NOTICE.md): ES modules, and what it required replaced by @xufa/lint's.

/**
 * @fileoverview Rule to flag statements with function invocation preceded by
 * "new" and not part of assignment
 * @author Ilya Volodin
 */

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule = {
  meta: {
    type: 'suggestion',

    docs: {
      description: 'Disallow `new` operators outside of assignments or comparisons',
      recommended: false,
      url: 'https://eslint.org/docs/latest/rules/no-new',
    },

    schema: [],

    messages: {
      noNewStatement: "Do not use 'new' for side effects.",
    },
  },

  create(context) {
    return {
      'ExpressionStatement > NewExpression'(node) {
        context.report({
          node: node.parent,
          messageId: 'noNewStatement',
        });
      },
    };
  },
};

export const { meta, create } = rule;
