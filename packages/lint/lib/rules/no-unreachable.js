// Unreachable statements (after return, throw, break, continue, or code paths that never get there), reported once per
// run of consecutive unreachable statements. Also the instance fields of a subclass whose constructor never calls
// `super()`, since they are never created. A `var` without initializer is hoisted, so it is not reported.

// Statements checked (not FunctionDeclaration, which is hoisted).
const STATEMENTS = [
  'BlockStatement',
  'BreakStatement',
  'ClassDeclaration',
  'ContinueStatement',
  'DebuggerStatement',
  'DoWhileStatement',
  'ExpressionStatement',
  'ForInStatement',
  'ForOfStatement',
  'ForStatement',
  'IfStatement',
  'ImportDeclaration',
  'LabeledStatement',
  'ReturnStatement',
  'SwitchStatement',
  'ThrowStatement',
  'TryStatement',
  'WhileStatement',
  'WithStatement',
  'ExportNamedDeclaration',
  'ExportDefaultDeclaration',
  'ExportAllDeclaration',
];

export const meta = {
  type: 'problem',
  docs: {
    description: 'Disallow unreachable code after `return`, `throw`, `continue`, and `break` statements',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-unreachable',
  },
  schema: [],
  messages: {
    unreachableCode: 'Unreachable code.',
  },
};

export function create(context) {
  const { sourceCode } = context;

  // The reachable segments the traversal is in, for the current code path and the enclosing ones.
  const segmentStack = [];
  let segments = new Set();
  // Whether each enclosing constructor calls `super()`.
  let constructorInfo = null;
  // The current run of consecutive unreachable nodes, from its first to its last one.
  let first = null;
  let last = null;

  /** Reports the current run, if any, and starts a new one at `node` (or none). */
  function flush(node) {
    if (first)
      context.report({
        messageId: 'unreachableCode',
        loc: { start: first.loc.start, end: last.loc.end },
        node: first,
      });
    first = last = node;
  }

  /** Extends the current run with an unreachable node, or reports it and starts another one. */
  function addUnreachable(node) {
    if (!first) {
      first = last = node;
      return;
    }
    // Inside the run (a statement nested in a reported one).
    if (node.range[0] >= first.range[0] && node.range[1] <= last.range[1]) return;
    // Consecutive: the token before it is inside the run.
    const before = sourceCode.getTokenBefore(node);
    if (before.range[0] >= first.range[0] && before.range[1] <= last.range[1]) {
      last = node;
      return;
    }
    flush(node);
  }

  function check(node) {
    if (segments.size) flush(null);
    else addUnreachable(node);
  }

  const listeners = {
    onCodePathStart() {
      segmentStack.push(segments);
      segments = new Set();
    },
    onCodePathEnd() {
      segments = segmentStack.pop();
    },
    onCodePathSegmentStart(segment) {
      if (segment.reachable) segments.add(segment);
    },
    onCodePathSegmentEnd(segment) {
      segments.delete(segment);
    },

    VariableDeclaration(node) {
      if (node.kind !== 'var' || node.declarations.some((declarator) => declarator.init)) check(node);
    },

    'Program:exit'() {
      flush(null);
    },

    MethodDefinition(node) {
      if (node.kind === 'constructor') constructorInfo = { upper: constructorInfo, hasSuperCall: false };
    },

    'MethodDefinition:exit'(node) {
      if (node.kind !== 'constructor') return;
      const { hasSuperCall } = constructorInfo;
      constructorInfo = constructorInfo.upper;
      // A TypeScript constructor without body.
      if (!node.value.body) return;
      const classNode = node.parent.parent;
      if (!classNode.superClass || hasSuperCall) return;
      for (const element of classNode.body.body) {
        if (element.type === 'PropertyDefinition' && !element.static) addUnreachable(element);
      }
    },

    Super(node) {
      if (constructorInfo && node.parent.type === 'CallExpression' && node.parent.callee === node) {
        constructorInfo.hasSuperCall = true;
      }
    },
  };
  for (const type of STATEMENTS) listeners[type] = check;
  return listeners;
}
