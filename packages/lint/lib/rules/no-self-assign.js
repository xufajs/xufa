// Assignments (`=`, `&&=`, `||=`, `??=`) of something to itself: `a = a`, and through destructuring of a literal
// (`[a, b] = [a, b]`, `({ a } = { a })`); with props (the default), also `a.b = a.b`. Reported on the right one, named
// as written without whitespace.

import { getStaticPropertyName, isSameReference, skipChainExpression } from './utils/ast.js';

const OPERATORS = new Set(['=', '&&=', '||=', '??=']);
const SPACES = /\s+/gu;

/** Calls `report` with each right node of the pair of (left, right) that assigns something to itself. */
function eachSelfAssignment(left, right, props, report) {
  if (!left || !right) return;
  if (left.type === 'Identifier' && right.type === 'Identifier') {
    if (left.name === right.name) report(right);
    return;
  }
  if (left.type === 'ArrayPattern' && right.type === 'ArrayExpression') {
    const { elements } = right;
    const end = Math.min(left.elements.length, elements.length);
    for (let i = 0; i < end; i++) {
      const leftElement = left.elements[i];
      // [...a] = [...a, 1] is not one.
      if (leftElement?.type === 'RestElement' && i < elements.length - 1) break;
      eachSelfAssignment(leftElement, elements[i], props, report);
      // The indices after a spread are unknown.
      if (elements[i]?.type === 'SpreadElement') break;
    }
    return;
  }
  if (left.type === 'RestElement' && right.type === 'SpreadElement') {
    eachSelfAssignment(left.argument, right.argument, props, report);
    return;
  }
  if (left.type === 'ObjectPattern' && right.type === 'ObjectExpression') {
    const { properties } = right;
    // The properties before the last spread can be overwritten by it.
    let first = properties.length;
    while (first > 0 && properties[first - 1].type !== 'SpreadElement') first--;
    for (const property of left.properties) {
      for (let j = first; j < properties.length; j++) eachSelfAssignment(property, properties[j], props, report);
    }
    return;
  }
  if (left.type === 'Property' && right.type === 'Property') {
    if (right.kind !== 'init' || right.method) return;
    const name = getStaticPropertyName(left);
    if (name !== null && name === getStaticPropertyName(right)) {
      eachSelfAssignment(left.value, right.value, props, report);
    }
    return;
  }
  if (
    props &&
    skipChainExpression(left).type === 'MemberExpression' &&
    skipChainExpression(right).type === 'MemberExpression' &&
    isSameReference(left, right)
  ) {
    report(right);
  }
}

export const meta = {
  type: 'problem',
  defaultOptions: [{ props: true }],
  docs: {
    description: 'Disallow assignments where both sides are exactly the same',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-self-assign',
  },
  schema: [
    {
      type: 'object',
      properties: { props: { type: 'boolean' } },
      additionalProperties: false,
    },
  ],
  messages: {
    selfAssignment: "'{{name}}' is assigned to itself.",
  },
};

export function create(context) {
  const { sourceCode } = context;
  const [{ props }] = context.options;

  const report = (node) =>
    context.report({
      node,
      messageId: 'selfAssignment',
      data: { name: sourceCode.getText(node).replace(SPACES, '') },
    });

  return {
    AssignmentExpression(node) {
      if (OPERATORS.has(node.operator)) eachSelfAssignment(node.left, node.right, props, report);
    },
  };
}
