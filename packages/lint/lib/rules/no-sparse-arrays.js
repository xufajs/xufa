// Holes in array literals (`[a, , b]`, `[, a]`), reported at the comma that follows each hole. A trailing comma
// after the last element is not a hole.

import { isCommaToken } from './utils/ast.js';

export const meta = {
  type: 'problem',
  docs: {
    description: 'Disallow sparse arrays',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-sparse-arrays',
  },
  schema: [],
  messages: {
    unexpectedSparseArray: 'Unexpected comma in middle of array.',
  },
};

export function create(context) {
  const { sourceCode } = context;

  return {
    ArrayExpression(node) {
      const { elements } = node;
      if (!elements.includes(null)) return;
      const last = elements.length - 1;
      // Walk the commas: each one follows its element, or the previous comma (or `[`) for a hole.
      let comma = sourceCode.getFirstToken(node);
      for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        if (i === last && element) return;
        comma = sourceCode.getTokenAfter(element ?? comma, isCommaToken);
        if (!element) context.report({ node, loc: comma.loc, messageId: 'unexpectedSparseArray' });
      }
    },
  };
}
