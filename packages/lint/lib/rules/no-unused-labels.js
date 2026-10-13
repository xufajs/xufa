// Labels that no break or continue uses. Fixed by removing the label, unless a comment follows it or its statement
// would become a directive (a string expression at the top of a script or function body).

import { isFunction, isStaticTemplateLiteral } from './utils/ast.js';

export const meta = {
  type: 'suggestion',
  docs: {
    description: 'Disallow unused labels',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-unused-labels',
  },
  schema: [],
  fixable: 'code',
  messages: {
    unused: "'{{name}}:' is defined but never used.",
  },
};

export function create(context) {
  const { sourceCode } = context;
  // The innermost labeled statement being visited: its label, whether it is used, and the upper one.
  let scope = null;

  /** Whether removing the label is safe: only the colon between label and body, and no directive in the making. */
  const isFixable = (node) => {
    const colon = sourceCode.getTokenAfter(node.label, { includeComments: true });
    if (colon !== sourceCode.getTokenBefore(node.body, { includeComments: true })) return false;

    let ancestor = node.parent;
    while (ancestor.type === 'LabeledStatement') ancestor = ancestor.parent;
    if (ancestor.type !== 'Program' && !(ancestor.type === 'BlockStatement' && isFunction(ancestor.parent))) {
      return true;
    }
    const { body } = node;
    if (body.type !== 'ExpressionStatement') return true;
    const { expression } = body;
    return !(
      (expression.type === 'Literal' && typeof expression.value === 'string') ||
      isStaticTemplateLiteral(expression)
    );
  };

  const markAsUsed = (node) => {
    if (!node.label) return;
    const { name } = node.label;
    for (let info = scope; info; info = info.upper) {
      if (info.label === name) {
        info.used = true;
        return;
      }
    }
  };

  return {
    LabeledStatement(node) {
      scope = { label: node.label.name, used: false, upper: scope };
    },

    'LabeledStatement:exit'(node) {
      if (!scope.used) {
        context.report({
          node: node.label,
          messageId: 'unused',
          data: { name: node.label.name },
          fix: isFixable(node) ? (fixer) => fixer.removeRange([node.range[0], node.body.range[0]]) : null,
        });
      }
      scope = scope.upper;
    },

    BreakStatement: markAsUsed,
    ContinueStatement: markAsUsed,
  };
}
