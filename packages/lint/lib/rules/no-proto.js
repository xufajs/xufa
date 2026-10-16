// ESLint's rule no-proto, ported from ESLint 9.39.5 (MIT, see NOTICE.md): ES modules, and what it required replaced by @xufa/lint's.
import __ast_utils96 from './utils/ast-utils.js';
const { getStaticPropertyName } = __ast_utils96;
/**
 * @fileoverview Rule to flag usage of __proto__ property
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
      description: 'Disallow the use of the `__proto__` property',
      recommended: false,
      url: 'https://eslint.org/docs/latest/rules/no-proto',
    },

    schema: [],

    messages: {
      unexpectedProto: "The '__proto__' property is deprecated.",
    },
  },

  create(context) {
    return {
      MemberExpression(node) {
        if (getStaticPropertyName(node) === '__proto__') {
          context.report({ node, messageId: 'unexpectedProto' });
        }
      },
    };
  },
};

export const { meta, create } = rule;
