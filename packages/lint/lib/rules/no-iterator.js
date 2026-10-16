// ESLint's rule no-iterator, ported from ESLint 9.39.5 (MIT, see NOTICE.md): ES modules, and what it required replaced by @xufa/lint's.
import __ast_utils73 from './utils/ast-utils.js';
const { getStaticPropertyName } = __ast_utils73;
/**
 * @fileoverview Rule to flag usage of __iterator__ property
 * @author Ian Christian Myers
 */

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule = {
  meta: {
    type: 'suggestion',

    docs: {
      description: 'Disallow the use of the `__iterator__` property',
      recommended: false,
      url: 'https://eslint.org/docs/latest/rules/no-iterator',
    },

    schema: [],

    messages: {
      noIterator: "Reserved name '__iterator__'.",
    },
  },

  create(context) {
    return {
      MemberExpression(node) {
        if (getStaticPropertyName(node) === '__iterator__') {
          context.report({
            node,
            messageId: 'noIterator',
          });
        }
      },
    };
  },
};

export const { meta, create } = rule;
