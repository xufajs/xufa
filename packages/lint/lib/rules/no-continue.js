// ESLint's rule no-continue, ported from ESLint 9.39.5 (MIT, see NOTICE.md): ES modules, and what it required replaced by @xufa/lint's.

/**
 * @fileoverview Rule to flag use of continue statement
 * @author Borislav Zhivkov
 */

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule = {
  meta: {
    type: 'suggestion',

    docs: {
      description: 'Disallow `continue` statements',
      recommended: false,
      frozen: true,
      url: 'https://eslint.org/docs/latest/rules/no-continue',
    },

    schema: [],

    messages: {
      unexpected: 'Unexpected use of continue statement.',
    },
  },

  create(context) {
    return {
      ContinueStatement(node) {
        context.report({ node, messageId: 'unexpected' });
      },
    };
  },
};

export const { meta, create } = rule;
