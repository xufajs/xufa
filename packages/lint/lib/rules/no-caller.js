// ESLint's rule no-caller, ported from ESLint 9.39.5 (MIT, see NOTICE.md): ES modules, and what it required replaced by @xufa/lint's.

/**
 * @fileoverview Rule to flag use of arguments.callee and arguments.caller.
 * @author Nicholas C. Zakas
 */

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule = {
  meta: {
    type: 'suggestion',

    docs: {
      description: 'Disallow the use of `arguments.caller` or `arguments.callee`',
      recommended: false,
      url: 'https://eslint.org/docs/latest/rules/no-caller',
    },

    schema: [],

    messages: {
      unexpected: 'Avoid arguments.{{prop}}.',
    },
  },

  create(context) {
    return {
      MemberExpression(node) {
        const objectName = node.object.name,
          propertyName = node.property.name;

        if (objectName === 'arguments' && !node.computed && propertyName && propertyName.match(/^calle[er]$/u)) {
          context.report({
            node,
            messageId: 'unexpected',
            data: { prop: propertyName },
          });
        }
      },
    };
  },
};

export const { meta, create } = rule;
