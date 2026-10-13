// Setters that return a value: `return x` in a setter of a class or an object literal, or in the `set` of a
// descriptor passed to (global) Object.defineProperty, Reflect.defineProperty, Object.defineProperties or
// Object.create; for an arrow function `set` with an expression body, that expression.

import { getStaticPropertyName, isSpecificMemberAccess, skipChainExpression } from './utils/ast.js';

/** Whether a node is the argument at `index` of a call of `objectName.methodName`, `objectName` being global. */
function isGlobalMethodArgument(node, sourceCode, objectName, methodName, index) {
  const call = node.parent;
  return (
    call.type === 'CallExpression' &&
    call.arguments[index] === node &&
    isSpecificMemberAccess(call.callee, objectName, methodName) &&
    sourceCode.isGlobalReference(skipChainExpression(call.callee).object)
  );
}

/** Whether an object expression is used as a property descriptor. */
function isPropertyDescriptor(node, sourceCode) {
  if (
    isGlobalMethodArgument(node, sourceCode, 'Object', 'defineProperty', 2) ||
    isGlobalMethodArgument(node, sourceCode, 'Reflect', 'defineProperty', 2)
  ) {
    return true;
  }
  const { parent } = node;
  if (parent.type !== 'Property' || parent.value !== node) return false;
  const descriptors = parent.parent;
  return (
    descriptors.type === 'ObjectExpression' &&
    (isGlobalMethodArgument(descriptors, sourceCode, 'Object', 'create', 1) ||
      isGlobalMethodArgument(descriptors, sourceCode, 'Object', 'defineProperties', 1))
  );
}

/** Whether a function is a setter. */
function isSetter(node, sourceCode) {
  const { parent } = node;
  if (parent.type !== 'Property' && parent.type !== 'MethodDefinition') return false;
  if (parent.value !== node) return false;
  if (parent.kind === 'set') return true;
  return (
    parent.type === 'Property' &&
    getStaticPropertyName(parent) === 'set' &&
    parent.parent.type === 'ObjectExpression' &&
    isPropertyDescriptor(parent.parent, sourceCode)
  );
}

export const meta = {
  type: 'problem',
  docs: {
    description: 'Disallow returning values from setters',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-setter-return',
  },
  schema: [],
  messages: {
    returnsValue: 'Setter cannot return a value.',
  },
};

export function create(context) {
  const { sourceCode } = context;

  // Whether each enclosing function is a setter, innermost first. Function declarations are never setters, but
  // they are tracked too, so that their returns are not taken for the setter's around them.
  let funcInfo = null;
  const enterFunction = (node) => {
    funcInfo = { upper: funcInfo, isSetter: isSetter(node, sourceCode) };
  };
  const exitFunction = () => {
    funcInfo = funcInfo.upper;
  };

  return {
    FunctionDeclaration: enterFunction,
    FunctionExpression: enterFunction,
    ArrowFunctionExpression(node) {
      enterFunction(node);
      // `{ set: (v) => v }`: the implicit return.
      if (funcInfo.isSetter && node.expression) context.report({ node: node.body, messageId: 'returnsValue' });
    },
    'FunctionDeclaration:exit': exitFunction,
    'FunctionExpression:exit': exitFunction,
    'ArrowFunctionExpression:exit': exitFunction,

    ReturnStatement(node) {
      // A global return (in a CommonJS module) has no function.
      if (funcInfo?.isSetter && node.argument) context.report({ node, messageId: 'returnsValue' });
    },
  };
}
