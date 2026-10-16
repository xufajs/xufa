// ESLint's rule unicode-bom, ported from ESLint 9.39.5 (MIT, see NOTICE.md): ES modules, and what it required replaced by @xufa/lint's.

/**
 * @fileoverview Require or disallow Unicode BOM
 * @author Andrew Johnston <https://github.com/ehjay>
 */

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule = {
  meta: {
    type: 'layout',

    defaultOptions: ['never'],

    docs: {
      description: 'Require or disallow Unicode byte order mark (BOM)',
      recommended: false,
      url: 'https://eslint.org/docs/latest/rules/unicode-bom',
    },

    fixable: 'whitespace',

    schema: [
      {
        enum: ['always', 'never'],
      },
    ],
    messages: {
      expected: 'Expected Unicode BOM (Byte Order Mark).',
      unexpected: 'Unexpected Unicode BOM (Byte Order Mark).',
    },
  },

  create(context) {
    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    return {
      Program: function checkUnicodeBOM(node) {
        const sourceCode = context.sourceCode,
          location = { column: 0, line: 1 };
        const [requireBOM] = context.options;

        if (!sourceCode.hasBOM && requireBOM === 'always') {
          context.report({
            node,
            loc: location,
            messageId: 'expected',
            fix(fixer) {
              return fixer.insertTextBeforeRange([0, 1], '\uFEFF');
            },
          });
        } else if (sourceCode.hasBOM && requireBOM === 'never') {
          context.report({
            node,
            loc: location,
            messageId: 'unexpected',
            fix(fixer) {
              return fixer.removeRange([-1, 0]);
            },
          });
        }
      },
    };
  },
};

export const { meta, create } = rule;
