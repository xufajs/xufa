// ESLint's rule no-multi-str, ported from ESLint 9.39.5 (MIT, see NOTICE.md): ES modules, and what it required replaced by @xufa/lint's.
import __ast_utils83 from './utils/ast-utils.js';
const astUtils = __ast_utils83;
/**
 * @fileoverview Rule to flag when using multiline strings
 * @author Ilya Volodin
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
      description: 'Disallow multiline strings',
      recommended: false,
      frozen: true,
      url: 'https://eslint.org/docs/latest/rules/no-multi-str',
    },

    schema: [],

    messages: {
      multilineString: 'Multiline support is limited to browsers supporting ES5 only.',
    },
  },

  create(context) {
    /**
     * Determines if a given node is part of JSX syntax.
     * @param {ASTNode} node The node to check.
     * @returns {boolean} True if the node is a JSX node, false if not.
     * @private
     */
    function isJSXElement(node) {
      return node.type.indexOf('JSX') === 0;
    }

    //--------------------------------------------------------------------------
    // Public API
    //--------------------------------------------------------------------------

    return {
      Literal(node) {
        if (astUtils.LINEBREAK_MATCHER.test(node.raw) && !isJSXElement(node.parent)) {
          context.report({
            node,
            messageId: 'multilineString',
          });
        }
      },
    };
  },
};

export const { meta, create } = rule;
