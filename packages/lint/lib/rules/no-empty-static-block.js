// Class static blocks with no statement and no comment inside. Suggested: a comment inside.

export const meta = {
  hasSuggestions: true,
  type: 'suggestion',
  docs: {
    description: 'Disallow empty static blocks',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-empty-static-block',
  },
  schema: [],
  messages: {
    unexpected: 'Unexpected empty static block.',
    suggestComment: 'Add comment inside empty static block.',
  },
};

export function create(context) {
  const { sourceCode } = context;

  return {
    StaticBlock(node) {
      if (node.body.length) return;
      // The first token is `static`, the second the opening brace.
      const open = sourceCode.getFirstToken(node, { skip: 1 });
      const close = sourceCode.getLastToken(node);
      if (sourceCode.getCommentsBefore(close).length) return;
      context.report({
        loc: { start: open.loc.start, end: close.loc.end },
        messageId: 'unexpected',
        suggest: [
          {
            messageId: 'suggestComment',
            fix: (fixer) => fixer.replaceTextRange([open.range[1], close.range[0]], ' /* empty */ '),
          },
        ],
      });
    },
  };
}
