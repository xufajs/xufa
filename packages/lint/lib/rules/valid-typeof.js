// Comparisons (==, ===, != and !==) of a typeof expression with a string or static template that is not a valid
// type name, or with the global `undefined` (suggested: "undefined"). With requireStringLiterals, also with anything
// that is not a string literal or another typeof expression.

import { isStaticTemplateLiteral } from './utils/ast.js';

const VALID_TYPES = new Set(['symbol', 'undefined', 'object', 'boolean', 'number', 'string', 'function', 'bigint']);
const OPERATORS = new Set(['==', '===', '!=', '!==']);

const isTypeof = (node) => node.type === 'UnaryExpression' && node.operator === 'typeof';

export const meta = {
  type: 'problem',
  defaultOptions: [{ requireStringLiterals: false }],
  docs: {
    description: 'Enforce comparing `typeof` expressions against valid strings',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/valid-typeof',
  },
  hasSuggestions: true,
  schema: [
    {
      type: 'object',
      properties: { requireStringLiterals: { type: 'boolean' } },
      additionalProperties: false,
    },
  ],
  messages: {
    invalidValue: 'Invalid typeof comparison value.',
    notString: 'Typeof comparisons should be to string literals.',
    suggestString: 'Use `"{{type}}"` instead of `{{type}}`.',
  },
};

export function create(context) {
  const { sourceCode } = context;
  const [{ requireStringLiterals }] = context.options;
  let globalScope;

  /** Whether the identifier refers to a global variable not declared in the code (any reference to it counts). */
  const isUndeclaredGlobal = (node) => {
    const variable = globalScope.set.get(node.name);
    return variable && variable.defs.length === 0 && variable.references.some((ref) => ref.identifier === node);
  };

  return {
    Program(node) {
      globalScope = sourceCode.getScope(node);
    },

    UnaryExpression(node) {
      if (node.operator !== 'typeof') return;
      const { parent } = node;
      if (parent.type !== 'BinaryExpression' || !OPERATORS.has(parent.operator)) return;
      const sibling = parent.left === node ? parent.right : parent.left;

      if (sibling.type === 'Literal' || isStaticTemplateLiteral(sibling)) {
        const value = sibling.type === 'Literal' ? sibling.value : sibling.quasis[0].value.cooked;
        if (!VALID_TYPES.has(value)) context.report({ node: sibling, messageId: 'invalidValue' });
      } else if (sibling.type === 'Identifier' && sibling.name === 'undefined' && isUndeclaredGlobal(sibling)) {
        context.report({
          node: sibling,
          messageId: requireStringLiterals ? 'notString' : 'invalidValue',
          suggest: [
            {
              messageId: 'suggestString',
              data: { type: 'undefined' },
              fix: (fixer) => fixer.replaceText(sibling, '"undefined"'),
            },
          ],
        });
      } else if (requireStringLiterals && !isTypeof(sibling)) {
        context.report({ node: sibling, messageId: 'notString' });
      }
    },
  };
}
