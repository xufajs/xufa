// Calls of hasOwnProperty, isPrototypeOf or propertyIsEnumerable on an object (`foo.hasOwnProperty(bar)`), reported
// at the method's name. Suggested: `Object.prototype.hasOwnProperty.call(foo, bar)`, unless the call can be
// short-circuited by an optional chain, its callee is a chain, or `Object` is not the global one.

import {
  getPrecedence,
  getStaticPropertyName,
  getVariableByName,
  isOpeningParenToken,
  skipChainExpression,
} from './utils/ast.js';

const DISALLOWED_PROPS = new Set(['hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable']);
const SEQUENCE_PRECEDENCE = getPrecedence({ type: 'SequenceExpression' });

/** Whether a call or member access is optional, or one to its left in the chain is. */
function isAfterOptional(node) {
  for (;;) {
    if (node.type === 'MemberExpression') {
      if (node.optional) return true;
      node = node.object;
    } else if (node.type === 'CallExpression') {
      if (node.optional) return true;
      node = node.callee;
    } else {
      return false;
    }
  }
}

export const meta = {
  type: 'problem',
  docs: {
    description: 'Disallow calling some `Object.prototype` methods directly on objects',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-prototype-builtins',
  },
  hasSuggestions: true,
  schema: [],
  messages: {
    prototypeBuildIn: "Do not access Object.prototype method '{{prop}}' from target object.",
    callObjectPrototype: 'Call Object.prototype.{{prop}} explicitly.',
  },
};

export function create(context) {
  const { sourceCode } = context;

  /** The fix of the suggestion for the call `node` of `callee` (its callee without a chain), or null. */
  function fix(fixer, node, callee, prop) {
    if (isAfterOptional(node) || node.callee.type === 'ChainExpression') return null;
    const object = getVariableByName(sourceCode.getScope(node), 'Object');
    if (!object || object.scope.type !== 'global' || object.defs.length > 0) return null;
    let objectText = sourceCode.getText(callee.object);
    if (getPrecedence(callee.object) <= SEQUENCE_PRECEDENCE) objectText = `(${objectText})`;
    const openParen = sourceCode.getTokenAfter(node.callee, isOpeningParenToken);
    return [
      fixer.replaceText(callee, `Object.prototype.${prop}.call`),
      fixer.insertTextAfter(openParen, node.arguments.length ? `${objectText}, ` : objectText),
    ];
  }

  return {
    CallExpression(node) {
      const callee = skipChainExpression(node.callee);
      if (callee.type !== 'MemberExpression') return;
      const prop = getStaticPropertyName(callee);
      if (!DISALLOWED_PROPS.has(prop)) return;
      context.report({
        messageId: 'prototypeBuildIn',
        loc: callee.property.loc,
        data: { prop },
        node,
        suggest: [
          {
            messageId: 'callObjectPrototype',
            data: { prop },
            fix: (fixer) => fix(fixer, node, callee, prop),
          },
        ],
      });
    },
  };
}
