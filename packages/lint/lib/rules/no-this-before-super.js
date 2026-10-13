// `this` and `super.x` in the constructor of a derived class (one that extends something other than null) on a code
// path where `super()` has not been called yet. Each node is reported once, when the constructor's code path ends.

import { isNullOrUndefined, isCallee } from './utils/ast.js';

/** Whether the function is a class constructor. */
const isConstructor = (node) =>
  node.type === 'FunctionExpression' && node.parent.type === 'MethodDefinition' && node.parent.kind === 'constructor';

export const meta = {
  type: 'problem',
  docs: {
    description: 'Disallow `this`/`super` before calling `super()` in constructors',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-this-before-super',
  },
  schema: [],
  messages: {
    noBeforeSuper: "'{{kind}}' is not allowed before 'super()'.",
  },
};

export function create(context) {
  // Per code path: whether it is the constructor of a derived class, and its current reachable segments.
  let funcInfo = null;
  // Per segment of a derived constructor: whether `super()` was called on every path to it, and the `this`/`super`
  // found in it before that.
  const segInfo = new Map();

  /** Whether `super()` was called on the way to the segment (an unreachable one counts as called). */
  const isCalled = (segment) => !segment.reachable || segInfo.get(segment)?.superCalled;
  const isCalledBefore = (segment) => segment.prevSegments.length > 0 && segment.prevSegments.every(isCalled);

  /** Whether we are in a derived constructor before `super()` on some current path. */
  function isBeforeSuperCall() {
    if (!funcInfo.inDerivedConstructor) return false;
    for (const segment of funcInfo.segments) {
      if (!isCalled(segment)) return true;
    }
    return false;
  }

  function markInvalid(node) {
    for (const segment of funcInfo.segments) segInfo.get(segment).invalidNodes.push(node);
  }

  return {
    onCodePathStart(codePath, node) {
      let inDerivedConstructor = false;
      if (isConstructor(node)) {
        // ClassDeclaration/ClassExpression > ClassBody > MethodDefinition > FunctionExpression
        const { superClass } = node.parent.parent.parent;
        inDerivedConstructor = Boolean(superClass && !isNullOrUndefined(superClass));
      }
      funcInfo = { upper: funcInfo, inDerivedConstructor, codePath, segments: new Set() };
    },

    onCodePathEnd(codePath) {
      const { inDerivedConstructor } = funcInfo;
      funcInfo = funcInfo.upper;
      if (!inDerivedConstructor) return;
      // With a `finally`, a node can be in several segments.
      const reported = new Set();
      codePath.traverseSegments((segment, controller) => {
        const info = segInfo.get(segment);
        for (const node of info.invalidNodes) {
          if (reported.has(node)) continue;
          reported.add(node);
          context.report({
            messageId: 'noBeforeSuper',
            node,
            data: { kind: node.type === 'Super' ? 'super' : 'this' },
          });
        }
        if (info.superCalled) controller.skip();
      });
    },

    onCodePathSegmentStart(segment) {
      if (segment.reachable) funcInfo.segments.add(segment);
      if (funcInfo.inDerivedConstructor) {
        segInfo.set(segment, { superCalled: isCalledBefore(segment), invalidNodes: [] });
      }
    },

    onCodePathSegmentEnd(segment) {
      funcInfo.segments.delete(segment);
    },

    // A loop back to its head: `super()` may now be called on every path to the segments inside the loop.
    onCodePathSegmentLoop(fromSegment, toSegment) {
      if (!funcInfo.inDerivedConstructor) return;
      funcInfo.codePath.traverseSegments({ first: toSegment, last: fromSegment }, (segment, controller) => {
        let info = segInfo.get(segment);
        if (!info) {
          info = { superCalled: false, invalidNodes: [] };
          segInfo.set(segment, info);
        }
        if (info.superCalled) controller.skip();
        else if (isCalledBefore(segment)) info.superCalled = true;
      });
    },

    ThisExpression(node) {
      if (isBeforeSuperCall()) markInvalid(node);
    },

    Super(node) {
      if (!isCallee(node) && isBeforeSuperCall()) markInvalid(node);
    },

    'CallExpression:exit'(node) {
      if (node.callee.type !== 'Super' || !isBeforeSuperCall()) return;
      for (const segment of funcInfo.segments) segInfo.get(segment).superCalled = true;
    },

    'Program:exit'() {
      segInfo.clear();
    },
  };
}
