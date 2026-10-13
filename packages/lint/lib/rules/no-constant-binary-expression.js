// Operations whose result does not depend on one of their operands: `&&`/`||` whose left side has a constant
// truthiness, `??` whose left side has a constant nullishness, an equality between a null/undefined or a constant
// boolean and something whose result is then fixed, a strict equality with a newly constructed object, and a loose
// equality between two newly constructed objects.

import {
  isNullLiteral,
  isConstant,
  isReferenceToGlobalVariable,
  isLogicalAssignmentOperator,
  ECMASCRIPT_GLOBALS,
} from './utils/ast.js';

const NUMERIC_OR_STRING_BINARY_OPERATORS = new Set(['+', '-', '*', '/', '%', '|', '^', '&', '**', '<<', '>>', '>>>']);
const FUNCTION_OR_OBJECT = new Set([
  'ObjectExpression',
  'ArrayExpression',
  'ArrowFunctionExpression',
  'FunctionExpression',
  'ClassExpression',
]);
// Never nullish, or a literal whose nullishness never changes.
const CONSTANT_NULLISHNESS = new Set([
  ...FUNCTION_OR_OBJECT,
  'NewExpression',
  'Literal',
  'TemplateLiteral',
  'UpdateExpression',
  'BinaryExpression',
  'UnaryExpression',
]);
// Never a boolean, or a literal that never changes.
const CONSTANT_STRICT_BOOLEAN = new Set([
  ...FUNCTION_OR_OBJECT,
  'NewExpression',
  'TemplateLiteral',
  'Literal',
  'UpdateExpression',
]);
const NULLISH_COERCING_CALLS = new Set(['Boolean', 'String', 'Number']);

/** Whether a node is an identifier named `name` that refers to the global of that name. */
const isGlobal = (scope, node, name) =>
  node.type === 'Identifier' && node.name === name && isReferenceToGlobalVariable(scope, node);

/** Whether a node is null, void or the global undefined (unlike ast's isNullOrUndefined, minds a redefined one). */
const isNullish = (scope, node) =>
  isNullLiteral(node) ||
  isGlobal(scope, node, 'undefined') ||
  (node.type === 'UnaryExpression' && node.operator === 'void');

/** Whether a node is a call of the global Boolean with no argument or a constant one. */
const isConstantBooleanCall = (scope, node) =>
  isGlobal(scope, node.callee, 'Boolean') &&
  (node.arguments.length === 0 || isConstant(scope, node.arguments[0], true));

/** Whether a node is always null, always undefined, or never either (with nonNullish, only the latter). */
function hasConstantNullishness(scope, node, nonNullish) {
  if (nonNullish && isNullish(scope, node)) return false;
  if (CONSTANT_NULLISHNESS.has(node.type)) return true;
  switch (node.type) {
    case 'CallExpression':
      return (
        node.callee.type === 'Identifier' &&
        NULLISH_COERCING_CALLS.has(node.callee.name) &&
        isReferenceToGlobalVariable(scope, node.callee)
      );
    case 'LogicalExpression':
      return node.operator === '??' && hasConstantNullishness(scope, node.right, true);
    case 'AssignmentExpression':
      // Arithmetic assignments give numbers or strings; logical ones would need the variable's value.
      if (node.operator === '=') return hasConstantNullishness(scope, node.right, nonNullish);
      return !isLogicalAssignmentOperator(node.operator);
    case 'SequenceExpression':
      return hasConstantNullishness(scope, node.expressions.at(-1), nonNullish);
    case 'Identifier':
      return isGlobal(scope, node, 'undefined');
    default:
      return false;
  }
}

/** Whether a node is `true`, `false`, a negated constant or a constant Boolean() call. */
function isStaticBoolean(scope, node) {
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'boolean';
    case 'CallExpression':
      return isConstantBooleanCall(scope, node);
    case 'UnaryExpression':
      return node.operator === '!' && isConstant(scope, node.argument, true);
    default:
      return false;
  }
}

/** Whether a node always gives the same result when compared to a boolean with `==`. */
function hasConstantLooseBooleanComparison(scope, node) {
  switch (node.type) {
    // Objects with a custom valueOf/toString are an edge case left aside.
    case 'ObjectExpression':
    case 'ClassExpression':
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
    case 'Literal':
      return true;
    case 'ArrayExpression': {
      // `[x]` may be `[0]` or `[1]`; empty arrays and those of several elements never equal a boolean.
      if (node.elements.length === 0) return true;
      let count = 0;
      for (const element of node.elements) if (element && element.type !== 'SpreadElement') count++;
      return count > 1;
    }
    case 'UnaryExpression':
      if (node.operator === 'void' || node.operator === 'typeof') return true;
      return node.operator === '!' && isConstant(scope, node.argument, true);
    case 'CallExpression':
      return isConstantBooleanCall(scope, node);
    case 'Identifier':
      return isGlobal(scope, node, 'undefined');
    case 'TemplateLiteral':
      return node.expressions.length === 0;
    case 'AssignmentExpression':
      return node.operator === '=' && hasConstantLooseBooleanComparison(scope, node.right);
    case 'SequenceExpression':
      return hasConstantLooseBooleanComparison(scope, node.expressions.at(-1));
    default:
      return false;
  }
}

/** Whether a node always gives the same result when compared to a boolean with `===`: never or always the same one. */
function hasConstantStrictBooleanComparison(scope, node) {
  if (CONSTANT_STRICT_BOOLEAN.has(node.type)) return true;
  switch (node.type) {
    case 'BinaryExpression':
      return NUMERIC_OR_STRING_BINARY_OPERATORS.has(node.operator);
    case 'UnaryExpression':
      if (node.operator === 'delete') return false;
      return node.operator !== '!' || isConstant(scope, node.argument, true);
    case 'SequenceExpression':
      return hasConstantStrictBooleanComparison(scope, node.expressions.at(-1));
    case 'Identifier':
      return isGlobal(scope, node, 'undefined');
    case 'AssignmentExpression':
      if (node.operator === '=') return hasConstantStrictBooleanComparison(scope, node.right);
      return !isLogicalAssignmentOperator(node.operator);
    case 'CallExpression':
      if (isGlobal(scope, node.callee, 'String') || isGlobal(scope, node.callee, 'Number')) return true;
      return isConstantBooleanCall(scope, node);
    default:
      return false;
  }
}

/** Whether a node always evaluates to a newly constructed object. */
function isAlwaysNew(scope, node) {
  if (FUNCTION_OR_OBJECT.has(node.type)) return true;
  switch (node.type) {
    case 'NewExpression':
      // Built-in constructors always construct; user-defined ones may return a sentinel.
      return (
        node.callee.type === 'Identifier' &&
        Object.hasOwn(ECMASCRIPT_GLOBALS, node.callee.name) &&
        isReferenceToGlobalVariable(scope, node.callee)
      );
    case 'Literal':
      return typeof node.regex === 'object';
    case 'SequenceExpression':
      return isAlwaysNew(scope, node.expressions.at(-1));
    case 'AssignmentExpression':
      return node.operator === '=' && isAlwaysNew(scope, node.right);
    case 'ConditionalExpression':
      return isAlwaysNew(scope, node.consequent) && isAlwaysNew(scope, node.alternate);
    default:
      return false;
  }
}

/** Whether `a` makes the equality `a <operator> b` constant, given what `b` is. */
function makesConstant(scope, a, b, strict) {
  if (isNullish(scope, a) && hasConstantNullishness(scope, b, false)) return true;
  if (!isStaticBoolean(scope, a)) return false;
  return strict ? hasConstantStrictBooleanComparison(scope, b) : hasConstantLooseBooleanComparison(scope, b);
}

export const meta = {
  type: 'problem',
  docs: {
    description: "Disallow expressions where the operation doesn't affect the value",
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-constant-binary-expression',
  },
  schema: [],
  messages: {
    constantBinaryOperand:
      'Unexpected constant binary expression. Compares constantly with the {{otherSide}}-hand side of the `{{operator}}`.',
    constantShortCircuit: 'Unexpected constant {{property}} on the left-hand side of a `{{operator}}` expression.',
    alwaysNew: 'Unexpected comparison to newly constructed object. These two values can never be equal.',
    bothAlwaysNew: 'Unexpected comparison of two newly constructed objects. These two values can never be equal.',
  },
};

export function create(context) {
  const { sourceCode } = context;

  return {
    LogicalExpression(node) {
      const { operator, left } = node;
      const scope = sourceCode.getScope(node);
      let property;
      if (operator === '??') {
        if (hasConstantNullishness(scope, left, false)) property = 'nullishness';
      } else if (isConstant(scope, left, true)) {
        property = 'truthiness';
      }
      if (property) context.report({ node: left, messageId: 'constantShortCircuit', data: { property, operator } });
    },

    BinaryExpression(node) {
      const { left, right, operator } = node;
      const strict = operator === '===' || operator === '!==';
      if (!strict && operator !== '==' && operator !== '!=') return;
      const scope = sourceCode.getScope(node);

      if (makesConstant(scope, left, right, strict)) {
        context.report({ node: right, messageId: 'constantBinaryOperand', data: { operator, otherSide: 'left' } });
      } else if (makesConstant(scope, right, left, strict)) {
        context.report({ node: left, messageId: 'constantBinaryOperand', data: { operator, otherSide: 'right' } });
      } else if (strict) {
        if (isAlwaysNew(scope, left)) context.report({ node: left, messageId: 'alwaysNew' });
        else if (isAlwaysNew(scope, right)) context.report({ node: right, messageId: 'alwaysNew' });
      } else if (isAlwaysNew(scope, left) && isAlwaysNew(scope, right)) {
        // Two objects are compared by reference even with `==`.
        context.report({ node: left, messageId: 'bothAlwaysNew' });
      }
    },
  };
}
