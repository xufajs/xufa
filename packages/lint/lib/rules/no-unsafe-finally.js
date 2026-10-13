// return, throw, break and continue inside a `finally` block that would jump out of it, overriding the control flow
// of the try/catch. Statements whose target is still inside the finally block (a loop, switch, label or function
// there) are fine.

const FUNCTION_TYPES = [
  'Program',
  'FunctionDeclaration',
  'FunctionExpression',
  'ClassDeclaration',
  'ClassExpression',
  'ArrowFunctionExpression',
];
const LOOP_TYPES = ['DoWhileStatement', 'WhileStatement', 'ForOfStatement', 'ForInStatement', 'ForStatement'];

// Node types where the search for an enclosing finally block stops, by kind of statement.
const RETURN_THROW_SENTINELS = new Set(FUNCTION_TYPES);
const BREAK_SENTINELS = new Set([...FUNCTION_TYPES, ...LOOP_TYPES, 'SwitchStatement']);
const CONTINUE_SENTINELS = new Set([...FUNCTION_TYPES, ...LOOP_TYPES]);

/** The sentinel node types of a statement: a labelled break only stops at functions, like return and throw. */
function getSentinels(node) {
  if (node.type === 'BreakStatement' && !node.label) return BREAK_SENTINELS;
  if (node.type === 'ContinueStatement') return CONTINUE_SENTINELS;
  return RETURN_THROW_SENTINELS;
}

/** Whether the statement leaves a finally block (one that does not contain the statement's label). */
function isInFinallyBlock(node) {
  const sentinels = getSentinels(node);
  const labelName = node.label?.name;
  let labelInside = false;
  for (let current = node; current && !sentinels.has(current.type); current = current.parent) {
    const { parent } = current;
    if (labelName !== undefined && parent.label?.name === labelName) labelInside = true;
    if (parent.type === 'TryStatement' && parent.finalizer === current) return !labelInside;
  }
  return false;
}

export const meta = {
  type: 'problem',
  docs: {
    description: 'Disallow control flow statements in `finally` blocks',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-unsafe-finally',
  },
  schema: [],
  messages: {
    unsafeUsage: 'Unsafe usage of {{nodeType}}.',
  },
};

export function create(context) {
  const check = (node) => {
    if (isInFinallyBlock(node)) context.report({ node, messageId: 'unsafeUsage', data: { nodeType: node.type } });
  };

  return {
    ReturnStatement: check,
    ThrowStatement: check,
    BreakStatement: check,
    ContinueStatement: check,
  };
}
