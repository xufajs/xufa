// Comparisons with NaN (`NaN` or `Number.NaN`, also as the last expression of a sequence): relational and equality
// operators, `switch (NaN)` and `case NaN:` (enforceForSwitchCase), `.indexOf(NaN)` and `.lastIndexOf(NaN)`
// (enforceForIndexOf). Suggested: Number.isNaN (with a Number cast for loose equality), findIndex/findLastIndex.

import { isSpecificId, isSpecificMemberAccess, skipChainExpression, getStaticPropertyName } from './utils/ast.js';

const COMPARISON_OPERATORS = new Set(['<', '>', '<=', '>=', '==', '===', '!=', '!==']);
const FIXABLE_OPERATORS = new Set(['==', '===', '!=', '!==']);
const CASTABLE_OPERATORS = new Set(['==', '!=']);
const FIND_INDEX_METHODS = { indexOf: 'findIndex', lastIndexOf: 'findLastIndex' };

/** Whether the node is `NaN` or `Number.NaN`, or a sequence ending with one. */
function isNaNIdentifier(node) {
  if (!node) return false;
  const value = node.type === 'SequenceExpression' ? node.expressions.at(-1) : node;
  return isSpecificId(value, 'NaN') || isSpecificMemberAccess(value, 'Number', 'NaN');
}

export const meta = {
  hasSuggestions: true,
  type: 'problem',
  docs: {
    description: 'Require calls to `isNaN()` when checking for `NaN`',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/use-isnan',
  },
  schema: [
    {
      type: 'object',
      properties: {
        enforceForSwitchCase: { type: 'boolean' },
        enforceForIndexOf: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  ],
  defaultOptions: [{ enforceForIndexOf: false, enforceForSwitchCase: true }],
  messages: {
    comparisonWithNaN: 'Use the isNaN function to compare with NaN.',
    switchNaN: "'switch(NaN)' can never match a case clause. Use Number.isNaN instead of the switch.",
    caseNaN: "'case NaN' can never match. Use Number.isNaN before the switch.",
    indexOfNaN: "Array prototype method '{{ methodName }}' cannot find NaN.",
    replaceWithIsNaN: 'Replace with Number.isNaN.',
    replaceWithCastingAndIsNaN: 'Replace with Number.isNaN and cast to a Number.',
    replaceWithFindIndex: 'Replace with Array.prototype.{{ methodName }}.',
  },
};

export function create(context) {
  const [{ enforceForIndexOf, enforceForSwitchCase }] = context.options;
  const { sourceCode } = context;

  /** A suggestion replacing the comparison by `wrap(other operand)`, negated for `!=`/`!==`. */
  const comparisonSuggestion = (node, value, messageId, wrap) => ({
    messageId,
    fix(fixer) {
      const text = sourceCode.getText(value);
      const wrapped = wrap(value.type === 'SequenceExpression' ? `(${text})` : text);
      return fixer.replaceText(node, `${node.operator[0] === '!' ? '!' : ''}${wrapped}`);
    },
  });

  const listeners = {
    BinaryExpression(node) {
      if (!COMPARISON_OPERATORS.has(node.operator)) return;
      const leftIsNaN = isNaNIdentifier(node.left);
      if (!leftIsNaN && !isNaNIdentifier(node.right)) return;
      const [nan, value] = leftIsNaN ? [node.left, node.right] : [node.right, node.left];
      const suggest = [];
      if (FIXABLE_OPERATORS.has(node.operator) && nan.type !== 'SequenceExpression') {
        suggest.push(comparisonSuggestion(node, value, 'replaceWithIsNaN', (text) => `Number.isNaN(${text})`));
        if (CASTABLE_OPERATORS.has(node.operator)) {
          suggest.push(
            comparisonSuggestion(node, value, 'replaceWithCastingAndIsNaN', (text) => `Number.isNaN(Number(${text}))`)
          );
        }
      }
      context.report({ node, messageId: 'comparisonWithNaN', suggest });
    },
  };

  if (enforceForSwitchCase) {
    listeners.SwitchStatement = (node) => {
      if (isNaNIdentifier(node.discriminant)) context.report({ node, messageId: 'switchNaN' });
      for (const switchCase of node.cases) {
        if (isNaNIdentifier(switchCase.test)) context.report({ node: switchCase, messageId: 'caseNaN' });
      }
    };
  }

  if (enforceForIndexOf) {
    listeners.CallExpression = (node) => {
      const callee = skipChainExpression(node.callee);
      if (callee.type !== 'MemberExpression') return;
      const [arg, fromIndex] = node.arguments;
      if (node.arguments.length > 2 || !isNaNIdentifier(arg)) return;
      const methodName = getStaticPropertyName(callee);
      if (methodName !== 'indexOf' && methodName !== 'lastIndexOf') return;
      const suggest = [];
      // A sequence or a fromIndex has side effects or meaning that `findIndex(Number.isNaN)` would lose.
      if (arg.type !== 'SequenceExpression' && !fromIndex) {
        const method = FIND_INDEX_METHODS[methodName];
        suggest.push({
          messageId: 'replaceWithFindIndex',
          data: { methodName: method },
          fix: (fixer) => [
            fixer.replaceText(callee.property, callee.computed ? `"${method}"` : method),
            fixer.replaceText(arg, 'Number.isNaN'),
          ],
        });
      }
      context.report({ node, messageId: 'indexOfNaN', data: { methodName }, suggest });
    };
  }

  return listeners;
}
