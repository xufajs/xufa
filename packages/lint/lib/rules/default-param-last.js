// ESLint's rule default-param-last, ported from ESLint 9.39.5 (MIT, see NOTICE.md): ES modules, and what it required replaced by @xufa/lint's.

/**
 * @fileoverview enforce default parameters to be last
 * @author Chiawen Chen
 */

/**
 * Checks if node is required: i.e. does not have a default value or ? optional indicator.
 * @param {ASTNode} node the node to be evaluated
 * @returns {boolean} true if the node is required, false if not.
 */
function isRequiredParameter(node) {
  return !(node.type === 'AssignmentPattern' || node.type === 'RestElement' || node.optional);
}

const rule = {
  meta: {
    dialects: ['javascript', 'typescript'],
    language: 'javascript',
    type: 'suggestion',

    docs: {
      description: 'Enforce default parameters to be last',
      recommended: false,
      frozen: true,
      url: 'https://eslint.org/docs/latest/rules/default-param-last',
    },

    schema: [],

    messages: {
      shouldBeLast: 'Default parameters should be last.',
    },
  },

  create(context) {
    /**
     * Handler for function contexts.
     * @param {ASTNode} node function node
     * @returns {void}
     */
    function handleFunction(node) {
      let hasSeenRequiredParameter = false;

      for (let i = node.params.length - 1; i >= 0; i -= 1) {
        const current = node.params[i];
        const param = current.type === 'TSParameterProperty' ? current.parameter : current;

        if (isRequiredParameter(param)) {
          hasSeenRequiredParameter = true;
          continue;
        }

        if (hasSeenRequiredParameter) {
          context.report({
            node: current,
            messageId: 'shouldBeLast',
          });
        }
      }
    }

    return {
      FunctionDeclaration: handleFunction,
      FunctionExpression: handleFunction,
      ArrowFunctionExpression: handleFunction,
    };
  },
};

export const { meta, create } = rule;
