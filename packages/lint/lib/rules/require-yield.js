// Generator functions with a non-empty body and no `yield` of their own (a yield in a nested generator does not
// count, nor does one in a nested arrow, which cannot contain it anyway).

export const meta = {
  type: 'suggestion',
  docs: {
    description: 'Require generator functions to contain `yield`',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/require-yield',
  },
  schema: [],
  messages: {
    missingYield: "This generator function does not have 'yield'.",
  },
};

export function create(context) {
  // Number of yields seen in each open generator, innermost last.
  const counts = [];

  const enter = (node) => {
    if (node.generator) counts.push(0);
  };

  const exit = (node) => {
    if (!node.generator) return;
    const count = counts.pop();
    if (count === 0 && node.body.body.length) context.report({ node, messageId: 'missingYield' });
  };

  return {
    FunctionDeclaration: enter,
    'FunctionDeclaration:exit': exit,
    FunctionExpression: enter,
    'FunctionExpression:exit': exit,
    YieldExpression() {
      if (counts.length) counts[counts.length - 1]++;
    },
  };
}
