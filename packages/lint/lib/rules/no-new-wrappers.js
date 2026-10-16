// ESLint's rule no-new-wrappers, ported from ESLint 9.39.5 (MIT, see NOTICE.md): ES modules, and what it required replaced by @xufa/lint's.
import __ast_utils91 from './utils/ast-utils.js';
const { getVariableByName } = __ast_utils91;
/**
 * @fileoverview Rule to flag when using constructor for wrapper objects
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
      description: 'Disallow `new` operators with the `String`, `Number`, and `Boolean` objects',
      recommended: false,
      url: 'https://eslint.org/docs/latest/rules/no-new-wrappers',
    },

    schema: [],

    messages: {
      noConstructor: 'Do not use {{fn}} as a constructor.',
    },
  },

  create(context) {
    const { sourceCode } = context;

    return {
      NewExpression(node) {
        const wrapperObjects = ['String', 'Number', 'Boolean'];
        const { name } = node.callee;

        if (wrapperObjects.includes(name)) {
          const variable = getVariableByName(sourceCode.getScope(node), name);

          if (variable && variable.identifiers.length === 0) {
            context.report({
              node,
              messageId: 'noConstructor',
              data: { fn: name },
            });
          }
        }
      },
    };
  },
};

export const { meta, create } = rule;
