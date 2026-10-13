// Getters that do not return a value: in a class or an object literal, or the `get` of a descriptor passed to
// Object.defineProperty, Reflect.defineProperty, Object.defineProperties or Object.create. Reported: a `return;`
// (unless allowImplicit), and the function head when the end of the getter is reachable.

import {
  getFunctionHeadLoc,
  getFunctionNameWithKind,
  getStaticPropertyName,
  isSpecificMemberAccess,
} from './utils/ast.js';

/** Whether any of the segments is reachable. */
function isAnySegmentReachable(segments) {
  for (const segment of segments) {
    if (segment.reachable) return true;
  }
  return false;
}

/** Whether a function (any code path's node) is a getter. */
function isGetter(node) {
  if (node.type !== 'FunctionExpression' && node.type !== 'ArrowFunctionExpression') return false;
  if (node.body.type !== 'BlockStatement') return false;
  const { parent } = node;
  if (parent.kind === 'get') return true;
  if (parent.type !== 'Property' || getStaticPropertyName(parent) !== 'get') return false;
  const descriptor = parent.parent;
  if (descriptor.type !== 'ObjectExpression') return false;
  const outer = descriptor.parent;

  // Object.defineProperty(o, 'a', { get() {} }), Reflect.defineProperty(...)
  if (outer.type === 'CallExpression') {
    return (
      isSpecificMemberAccess(outer.callee, 'Object', 'defineProperty') ||
      isSpecificMemberAccess(outer.callee, 'Reflect', 'defineProperty')
    );
  }

  // Object.defineProperties(o, { a: { get() {} } }), Object.create(p, ...)
  if (outer.type !== 'Property' || outer.parent.type !== 'ObjectExpression') return false;
  const call = outer.parent.parent;
  return (
    call.type === 'CallExpression' &&
    (isSpecificMemberAccess(call.callee, 'Object', 'defineProperties') ||
      isSpecificMemberAccess(call.callee, 'Object', 'create'))
  );
}

export const meta = {
  type: 'problem',
  defaultOptions: [{ allowImplicit: false }],
  docs: {
    description: 'Enforce `return` statements in getters',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/getter-return',
  },
  fixable: null,
  schema: [
    {
      type: 'object',
      properties: { allowImplicit: { type: 'boolean' } },
      additionalProperties: false,
    },
  ],
  messages: {
    expected: 'Expected to return a value in {{name}}.',
    expectedAlways: 'Expected {{name}} to always return a value.',
  },
};

export function create(context) {
  const [{ allowImplicit }] = context.options;
  const { sourceCode } = context;

  // The innermost code path: whether it is a getter's, and whether it has a return.
  let funcInfo = { upper: null, node: null, shouldCheck: false, hasReturn: false, segments: new Set() };
  const enterSegment = (segment) => funcInfo.segments.add(segment);
  const exitSegment = (segment) => funcInfo.segments.delete(segment);

  /** Reports a getter whose end is reachable. */
  function checkLastSegment(node) {
    if (!funcInfo.shouldCheck || !isAnySegmentReachable(funcInfo.segments)) return;
    context.report({
      node,
      loc: getFunctionHeadLoc(node, sourceCode),
      messageId: funcInfo.hasReturn ? 'expectedAlways' : 'expected',
      data: { name: getFunctionNameWithKind(funcInfo.node) },
    });
  }

  return {
    onCodePathStart(codePath, node) {
      funcInfo = { upper: funcInfo, node, shouldCheck: isGetter(node), hasReturn: false, segments: new Set() };
    },
    onCodePathEnd() {
      funcInfo = funcInfo.upper;
    },
    onCodePathSegmentStart: enterSegment,
    onUnreachableCodePathSegmentStart: enterSegment,
    onCodePathSegmentEnd: exitSegment,
    onUnreachableCodePathSegmentEnd: exitSegment,

    ReturnStatement(node) {
      if (!funcInfo.shouldCheck) return;
      funcInfo.hasReturn = true;
      if (!allowImplicit && !node.argument) {
        context.report({ node, messageId: 'expected', data: { name: getFunctionNameWithKind(funcInfo.node) } });
      }
    },

    'FunctionExpression:exit': checkLastSegment,
    'ArrowFunctionExpression:exit': checkLastSegment,
  };
}
