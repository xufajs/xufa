// The constructor of a class with `extends` must call super() on every code path (returning a value counts as a
// call). Reports the constructor when some or all paths lack it, a super() that may run after another one (also
// across loop iterations), and a super() when the superclass expression cannot be a constructor.

const CONSTRUCTOR_TYPES = new Set([
  'ClassExpression',
  'FunctionExpression',
  'ThisExpression',
  'MemberExpression',
  'CallExpression',
  'NewExpression',
  'ChainExpression',
  'YieldExpression',
  'TaggedTemplateExpression',
  'MetaProperty',
]);

/** Whether the value of an `extends` expression can be a constructor. */
function isPossibleConstructor(node) {
  if (!node) return false;
  if (CONSTRUCTOR_TYPES.has(node.type)) return true;
  switch (node.type) {
    case 'Identifier':
      return node.name !== 'undefined';
    case 'AssignmentExpression':
      if (node.operator === '=' || node.operator === '&&=') return isPossibleConstructor(node.right);
      // Arithmetic and bitwise assignments give a primitive (or throw).
      return (
        (node.operator === '||=' || node.operator === '??=') &&
        (isPossibleConstructor(node.left) || isPossibleConstructor(node.right))
      );
    case 'LogicalExpression':
      // A short-circuited `&&` gives its falsy left side, so only the right one can be the value.
      return (node.operator !== '&&' && isPossibleConstructor(node.left)) || isPossibleConstructor(node.right);
    case 'ConditionalExpression':
      return isPossibleConstructor(node.alternate) || isPossibleConstructor(node.consequent);
    case 'SequenceExpression':
      return isPossibleConstructor(node.expressions.at(-1));
    default:
      return false;
  }
}

const isDerivedConstructor = (node) =>
  node.type === 'FunctionExpression' &&
  node.parent.type === 'MethodDefinition' &&
  node.parent.kind === 'constructor' &&
  Boolean(node.parent.parent.parent.superClass);

export const meta = {
  type: 'problem',
  docs: {
    description: 'Require `super()` calls in constructors',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/constructor-super',
  },
  schema: [],
  messages: {
    missingSome: "Lacked a call of 'super()' in some code paths.",
    missingAll: "Expected to call 'super()'.",
    duplicate: "Unexpected duplicate 'super()'.",
    badSuper: "Unexpected 'super()' because 'super' is not a constructor.",
  },
};

export function create(context) {
  // The code path being traversed: `checked` only for the constructor of a derived class, whose segments are
  // then tracked along with whether super() was called in some / every path reaching them.
  let funcInfo = null;
  const segInfos = new Map();

  const calledInSomePath = (segment) => segment.reachable && segInfos.get(segment.id).calledInSomePaths;
  const calledInEveryPath = (segment) => segment.reachable && segInfos.get(segment.id).calledInEveryPaths;
  const seenPrevious = (segment) => segment.prevSegments.filter((prev) => segInfos.has(prev.id));

  return {
    onCodePathStart(codePath, node) {
      const checked = isDerivedConstructor(node);
      funcInfo = {
        upper: funcInfo,
        checked,
        superIsConstructor: checked && isPossibleConstructor(node.parent.parent.parent.superClass),
        codePath,
        currentSegments: checked ? new Set() : null,
      };
    },

    onCodePathEnd(codePath, node) {
      const { checked } = funcInfo;
      funcInfo = funcInfo.upper;
      if (!checked) return;
      const returned = codePath.returnedSegments;
      if (returned.every(calledInEveryPath)) return;
      context.report({
        messageId: returned.some(calledInSomePath) ? 'missingSome' : 'missingAll',
        node: node.parent,
      });
    },

    onCodePathSegmentStart(segment, node) {
      if (!funcInfo.checked) return;
      funcInfo.currentSegments.add(segment);
      const info = { calledInSomePaths: false, calledInEveryPaths: false, validNodes: [] };
      segInfos.set(segment.id, info);
      const prevs = seenPrevious(segment);
      if (prevs.length) {
        info.calledInSomePaths = prevs.some(calledInSomePath);
        info.calledInEveryPaths = prevs.every(calledInEveryPath);
      }
      // The update of a for is created before its previous segments are seen, and it can never be the only
      // previous segment of another one: ignore it in the "every path" computations.
      if (node.parent?.type === 'ForStatement' && node.parent.update === node) info.calledInEveryPaths = true;
    },

    onUnreachableCodePathSegmentStart(segment) {
      funcInfo.currentSegments?.add(segment);
    },

    onUnreachableCodePathSegmentEnd(segment) {
      funcInfo.currentSegments?.delete(segment);
    },

    onCodePathSegmentEnd(segment) {
      funcInfo.currentSegments?.delete(segment);
    },

    // Going around a loop: propagate the flags through its segments, and the super() calls that were valid
    // become duplicates if one is called before them now.
    onCodePathSegmentLoop(fromSegment, toSegment) {
      if (!funcInfo.checked) return;
      funcInfo.codePath.traverseSegments({ first: toSegment, last: fromSegment }, (segment, controller) => {
        const info = segInfos.get(segment.id);
        if (!info) {
          controller.skip();
          return;
        }
        const prevs = seenPrevious(segment);
        const calledBefore = prevs.some(calledInSomePath);
        info.calledInSomePaths ||= calledBefore;
        info.calledInEveryPaths ||= prevs.every(calledInEveryPath);
        if (!calledBefore) return;
        const nodes = info.validNodes;
        info.validNodes = [];
        for (const node of nodes) context.report({ messageId: 'duplicate', node });
      });
    },

    'CallExpression:exit'(node) {
      if (!funcInfo.checked || node.callee.type !== 'Super') return;
      let duplicate = false;
      let info = null;
      for (const segment of funcInfo.currentSegments) {
        if (!segment.reachable) continue;
        info = segInfos.get(segment.id);
        duplicate ||= info.calledInSomePaths;
        info.calledInSomePaths = info.calledInEveryPaths = true;
      }
      if (!info) return;
      if (duplicate) context.report({ messageId: 'duplicate', node });
      else if (!funcInfo.superIsConstructor) context.report({ messageId: 'badSuper', node });
      else info.validNodes.push(node);
    },

    // Returning a value stands in for super().
    ReturnStatement(node) {
      if (!funcInfo.checked || !node.argument) return;
      for (const segment of funcInfo.currentSegments) {
        if (!segment.reachable) continue;
        const info = segInfos.get(segment.id);
        info.calledInSomePaths = info.calledInEveryPaths = true;
      }
    },
  };
}
