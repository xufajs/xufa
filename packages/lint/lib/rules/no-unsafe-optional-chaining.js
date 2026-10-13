// Optional chains whose short-circuit `undefined` would throw: called, constructed, accessed, tagged, spread into an
// array or call, iterated, destructured, extended, used with `in`/`instanceof` or `with`. With
// disallowArithmeticOperators, also those used in arithmetic, which would give NaN. A chain is looked for through the
// parts of an expression that can be its value: both sides of `&&`, the right of `||`/`??`, the last of a sequence,
// both branches of a conditional and an awaited argument.

const ARITHMETIC_OPERATORS = new Set(['+', '-', '/', '*', '%', '**']);
const ARITHMETIC_ASSIGNMENT_OPERATORS = new Set(['+=', '-=', '/=', '*=', '%=', '**=']);

/** Whether a node is an object or array pattern. */
const isDestructuring = (node) => node.type === 'ObjectPattern' || node.type === 'ArrayPattern';

export const meta = {
  type: 'problem',
  defaultOptions: [{ disallowArithmeticOperators: false }],
  docs: {
    description: 'Disallow use of optional chaining in contexts where the `undefined` value is not allowed',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-unsafe-optional-chaining',
  },
  schema: [
    {
      type: 'object',
      properties: { disallowArithmeticOperators: { type: 'boolean' } },
      additionalProperties: false,
    },
  ],
  fixable: null,
  messages: {
    unsafeOptionalChain:
      "Unsafe usage of optional chaining. If it short-circuits with 'undefined' the evaluation will throw TypeError.",
    unsafeArithmetic: 'Unsafe arithmetic operation on optional chaining. It can result in NaN.',
  },
};

export function create(context) {
  const [{ disallowArithmeticOperators }] = context.options;

  /** Reports with `messageId` each optional chain that can be the value of `node`. */
  const check = (node, messageId) => {
    switch (node?.type) {
      case 'LogicalExpression':
        if (node.operator === '&&') check(node.left, messageId);
        check(node.right, messageId);
        break;
      case 'SequenceExpression':
        check(node.expressions.at(-1), messageId);
        break;
      case 'ConditionalExpression':
        check(node.consequent, messageId);
        check(node.alternate, messageId);
        break;
      case 'AwaitExpression':
        check(node.argument, messageId);
        break;
      case 'ChainExpression':
        context.report({ messageId, node });
        break;
    }
  };
  const checkUnsafe = (node) => check(node, 'unsafeOptionalChain');
  const checkArithmetic = (node) => check(node, 'unsafeArithmetic');

  const listeners = {
    AssignmentExpression(node) {
      if (isDestructuring(node.left)) checkUnsafe(node.right);
      else if (disallowArithmeticOperators && ARITHMETIC_ASSIGNMENT_OPERATORS.has(node.operator)) {
        checkArithmetic(node.right);
      }
    },
    AssignmentPattern(node) {
      if (isDestructuring(node.left)) checkUnsafe(node.right);
    },
    ClassDeclaration: (node) => checkUnsafe(node.superClass),
    ClassExpression: (node) => checkUnsafe(node.superClass),
    CallExpression(node) {
      if (!node.optional) checkUnsafe(node.callee);
    },
    NewExpression: (node) => checkUnsafe(node.callee),
    VariableDeclarator(node) {
      if (isDestructuring(node.id)) checkUnsafe(node.init);
    },
    MemberExpression(node) {
      if (!node.optional) checkUnsafe(node.object);
    },
    TaggedTemplateExpression: (node) => checkUnsafe(node.tag),
    ForOfStatement: (node) => checkUnsafe(node.right),
    SpreadElement(node) {
      if (node.parent.type !== 'ObjectExpression') checkUnsafe(node.argument);
    },
    BinaryExpression(node) {
      const { operator } = node;
      if (operator === 'in' || operator === 'instanceof') checkUnsafe(node.right);
      else if (disallowArithmeticOperators && ARITHMETIC_OPERATORS.has(operator)) {
        checkArithmetic(node.right);
        checkArithmetic(node.left);
      }
    },
    WithStatement: (node) => checkUnsafe(node.object),
  };
  if (disallowArithmeticOperators) {
    listeners.UnaryExpression = (node) => {
      if (ARITHMETIC_OPERATORS.has(node.operator)) checkArithmetic(node.argument);
    };
  }
  return listeners;
}
