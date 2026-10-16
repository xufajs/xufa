// ESLint's rule no-return-assign, ported from ESLint 9.39.5 (MIT, see NOTICE.md): ES modules, and what it required replaced by @xufa/lint's.
import __ast_utils102 from './utils/ast-utils.js';
const astUtils = __ast_utils102;
/**
 * @fileoverview Rule to flag when return statement contains assignment
 * @author Ilya Volodin
 */

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const SENTINEL_TYPE = /^(?:[a-zA-Z]+?Statement|ArrowFunctionExpression|FunctionExpression|ClassExpression)$/u;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule = {
  meta: {
    type: 'suggestion',

    defaultOptions: ['except-parens'],

    docs: {
      description: 'Disallow assignment operators in `return` statements',
      recommended: false,
      url: 'https://eslint.org/docs/latest/rules/no-return-assign',
    },

    schema: [
      {
        enum: ['except-parens', 'always'],
      },
    ],

    messages: {
      returnAssignment: 'Return statement should not contain assignment.',
      arrowAssignment: 'Arrow function should not return assignment.',
    },
  },

  create(context) {
    const always = context.options[0] !== 'except-parens';
    const sourceCode = context.sourceCode;

    return {
      AssignmentExpression(node) {
        if (!always && astUtils.isParenthesised(sourceCode, node)) {
          return;
        }

        let currentChild = node;
        let parent = currentChild.parent;

        // Find ReturnStatement or ArrowFunctionExpression in ancestors.
        while (parent && !SENTINEL_TYPE.test(parent.type)) {
          currentChild = parent;
          parent = parent.parent;
        }

        // Reports.
        if (parent && parent.type === 'ReturnStatement') {
          context.report({
            node: parent,
            messageId: 'returnAssignment',
          });
        } else if (parent && parent.type === 'ArrowFunctionExpression' && parent.body === currentChild) {
          context.report({
            node: parent,
            messageId: 'arrowAssignment',
          });
        }
      },
    };
  },
};

export const { meta, create } = rule;
