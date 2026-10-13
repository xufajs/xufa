// Calls and `new` of the non-callable globals Atomics, JSON, Math, Reflect and Intl, directly, through
// globalThis/window members or through variables that alias them.

import { CALL, CONSTRUCT, ReferenceTracker } from '../ast/reference-tracker.js';
import { getStaticPropertyName } from './utils/ast.js';

const TRACE_MAP = {};
for (const name of ['Atomics', 'JSON', 'Math', 'Reflect', 'Intl'])
  TRACE_MAP[name] = { [CALL]: true, [CONSTRUCT]: true };

/** The name the callee is called by: an identifier's, or a member's static property name. */
function getCalleeName(node) {
  if (node.type === 'ChainExpression') return getCalleeName(node.expression);
  if (node.type === 'MemberExpression') return getStaticPropertyName(node);
  return node.name;
}

export const meta = {
  type: 'problem',
  docs: {
    description: 'Disallow calling global object properties as functions',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-obj-calls',
  },
  schema: [],
  messages: {
    unexpectedCall: "'{{name}}' is not a function.",
    unexpectedRefCall: "'{{name}}' is reference to '{{ref}}', which is not a function.",
  },
};

export function create(context) {
  const { sourceCode } = context;

  return {
    Program(node) {
      const tracker = new ReferenceTracker(sourceCode.getScope(node));
      for (const { node: call, path } of tracker.iterateGlobalReferences(TRACE_MAP)) {
        const name = getCalleeName(call.callee);
        const [ref] = path;
        context.report({
          node: call,
          messageId: name === ref ? 'unexpectedCall' : 'unexpectedRefCall',
          data: { name, ref },
        });
      }
    },
  };
}
