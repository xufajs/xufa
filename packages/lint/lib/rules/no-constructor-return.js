// ESLint's rule no-constructor-return, ported from ESLint 9.39.5 (MIT, see NOTICE.md): ES modules, and what it required replaced by @xufa/lint's.

/**
 * @fileoverview Rule to disallow returning value from constructor.
 * @author Pig Fang <https://github.com/g-plane>
 */

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule = {
  meta: {
    type: 'problem',

    docs: {
      description: 'Disallow returning value from constructor',
      recommended: false,
      url: 'https://eslint.org/docs/latest/rules/no-constructor-return',
    },

    schema: [],

    fixable: null,

    messages: {
      unexpected: 'Unexpected return statement in constructor.',
    },
  },

  create(context) {
    const stack = [];

    return {
      onCodePathStart(_, node) {
        stack.push(node);
      },
      onCodePathEnd() {
        stack.pop();
      },
      ReturnStatement(node) {
        const last = stack.at(-1);

        if (!last.parent) {
          return;
        }

        if (last.parent.type === 'MethodDefinition' && last.parent.kind === 'constructor' && node.argument) {
          context.report({
            node,
            messageId: 'unexpected',
          });
        }
      },
    };
  },
};

export const { meta, create } = rule;
