// ESLint's rule no-label-var, ported from ESLint 9.39.5 (MIT, see NOTICE.md): ES modules, and what it required replaced by @xufa/lint's.
import __ast_utils215 from './utils/ast-utils.js';
const astUtils = __ast_utils215;
/**
 * @fileoverview Rule to flag labels that are the same as an identifier
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
      description: 'Disallow labels that share a name with a variable',
      recommended: false,
      frozen: true,
      url: 'https://eslint.org/docs/latest/rules/no-label-var',
    },

    schema: [],

    messages: {
      identifierClashWithLabel: 'Found identifier with same name as label.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;

    //--------------------------------------------------------------------------
    // Helpers
    //--------------------------------------------------------------------------

    /**
     * Check if the identifier is present inside current scope
     * @param {Object} scope current scope
     * @param {string} name To evaluate
     * @returns {boolean} True if its present
     * @private
     */
    function findIdentifier(scope, name) {
      return astUtils.getVariableByName(scope, name) !== null;
    }

    //--------------------------------------------------------------------------
    // Public API
    //--------------------------------------------------------------------------

    return {
      LabeledStatement(node) {
        // Fetch the innermost scope.
        const scope = sourceCode.getScope(node);

        /*
         * Recursively find the identifier walking up the scope, starting
         * with the innermost scope.
         */
        if (findIdentifier(scope, node.label.name)) {
          context.report({
            node,
            messageId: 'identifierClashWithLabel',
          });
        }
      },
    };
  },
};

export const { meta, create } = rule;
