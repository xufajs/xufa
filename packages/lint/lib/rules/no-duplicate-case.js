// Case clauses whose test repeats an earlier one of the same switch: same node type and same tokens.

import { equalTokens } from './utils/ast.js';

export const meta = {
  type: 'problem',
  docs: {
    description: 'Disallow duplicate case labels',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-duplicate-case',
  },
  schema: [],
  messages: {
    unexpected: 'Duplicate case label.',
  },
};

export function create(context) {
  const { sourceCode } = context;
  const isSame = (a, b) => a.type === b.type && equalTokens(a, b, sourceCode);

  return {
    SwitchStatement(node) {
      const tests = [];
      for (const switchCase of node.cases) {
        const { test } = switchCase;
        if (!test) continue;
        if (tests.some((previous) => isSame(previous, test))) {
          context.report({ node: switchCase, messageId: 'unexpected' });
        } else {
          tests.push(test);
        }
      }
    },
  };
}
