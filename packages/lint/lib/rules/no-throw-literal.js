// ESLint's rule no-throw-literal, ported from ESLint 9.39.5 (MIT, see NOTICE.md): ES modules, and what it required replaced by @xufa/lint's.
import __ast_utils116 from './utils/ast-utils.js';
const astUtils = __ast_utils116;
/**
 * @fileoverview Rule to restrict what can be thrown as an exception.
 * @author Dieter Oberkofler
 */

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule = {
  meta: {
    type: 'suggestion',

    docs: {
      description: 'Disallow throwing literals as exceptions',
      recommended: false,
      url: 'https://eslint.org/docs/latest/rules/no-throw-literal',
    },

    schema: [],

    messages: {
      object: 'Expected an error object to be thrown.',
      undef: 'Do not throw undefined.',
    },
  },

  create(context) {
    return {
      ThrowStatement(node) {
        if (!astUtils.couldBeError(node.argument)) {
          context.report({ node, messageId: 'object' });
        } else if (node.argument.type === 'Identifier') {
          if (node.argument.name === 'undefined') {
            context.report({ node, messageId: 'undef' });
          }
        }
      },
    };
  },
};

export const { meta, create } = rule;
