// Empty blocks and switches: a block with no statement and no comment inside (but a function's body, and a catch's
// with allowEmptyCatch), a switch with no case and no comment between its braces. Suggested: a comment inside.

import { isFunction, isOpeningBraceToken } from './utils/ast.js';

export const meta = {
  hasSuggestions: true,
  type: 'suggestion',
  defaultOptions: [{ allowEmptyCatch: false }],
  docs: {
    description: 'Disallow empty block statements',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-empty',
  },
  schema: [
    {
      type: 'object',
      properties: { allowEmptyCatch: { type: 'boolean' } },
      additionalProperties: false,
    },
  ],
  messages: {
    unexpected: 'Empty {{type}} statement.',
    suggestComment: 'Add comment inside empty {{type}} statement.',
  },
};

export function create(context) {
  const [{ allowEmptyCatch }] = context.options;
  const { sourceCode } = context;

  // The problem of an empty `type` whose inside is [start, end), with the suggestion of a comment there.
  const report = (type, node, loc, start, end) =>
    context.report({
      node,
      loc,
      messageId: 'unexpected',
      data: { type },
      suggest: [
        {
          messageId: 'suggestComment',
          data: { type },
          fix: (fixer) => fixer.replaceTextRange([start, end], ' /* empty */ '),
        },
      ],
    });

  return {
    BlockStatement(node) {
      if (node.body.length || isFunction(node.parent)) return;
      if (allowEmptyCatch && node.parent.type === 'CatchClause') return;
      if (sourceCode.getCommentsInside(node).length) return;
      report('block', node, undefined, node.range[0] + 1, node.range[1] - 1);
    },

    SwitchStatement(node) {
      if (node.cases?.length) return;
      const open = sourceCode.getTokenAfter(node.discriminant, isOpeningBraceToken);
      const close = sourceCode.getLastToken(node);
      if (sourceCode.commentsExistBetween(open, close)) return;
      report('switch', node, { start: open.loc.start, end: close.loc.end }, open.range[1], close.range[0]);
    },
  };
}
