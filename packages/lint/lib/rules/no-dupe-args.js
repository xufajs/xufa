// Parameter names that appear more than once in a function declaration or expression, reported on the parameter
// list (from its opening parenthesis to the token before the body), once per duplicated name.

import { getOpeningParenOfParams } from './utils/ast.js';

export const meta = {
  type: 'problem',
  docs: {
    description: 'Disallow duplicate arguments in `function` definitions',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-dupe-args',
  },
  schema: [],
  messages: {
    unexpected: "Duplicate param '{{name}}'.",
  },
};

export function create(context) {
  const { sourceCode } = context;

  const checkParams = (node) => {
    let loc;
    for (const variable of sourceCode.getDeclaredVariables(node)) {
      let parameters = 0;
      for (const def of variable.defs) if (def.type === 'Parameter') parameters++;
      if (parameters < 2) continue;
      loc ??= {
        start: getOpeningParenOfParams(node, sourceCode).loc.start,
        end: sourceCode.getTokenBefore(node.body).loc.end,
      };
      context.report({ loc, messageId: 'unexpected', data: { name: variable.name } });
    }
  };

  return {
    FunctionDeclaration: checkParams,
    FunctionExpression: checkParams,
  };
}
