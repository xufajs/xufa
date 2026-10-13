// Writes to imported bindings: assigning, updating or deleting one, or using it as a for-in/for-of target; for a
// namespace import, also writes to its members (`ns.a = 1`, `delete ns.a`, `ns.a++`, `for (ns.a of x)`) and passing it
// as the first argument of global Object.assign/defineProperty/defineProperties/freeze/setPrototypeOf or
// Reflect.defineProperty/deleteProperty/set/setPrototypeOf. The enclosing write is reported.

import { findVariable } from '../ast/static-value.js';
import { isSpecificMemberAccess, skipChainExpression } from './utils/ast.js';

const OBJECT_MUTATORS = /^(?:assign|definePropert(?:y|ies)|freeze|setPrototypeOf)$/u;
const REFLECT_MUTATORS = /^(?:(?:define|delete)Property|set(?:PrototypeOf)?)$/u;
const WRITE_TYPES = new Set([
  'AssignmentExpression',
  'UpdateExpression',
  'UnaryExpression',
  'CallExpression',
  'ForInStatement',
  'ForOfStatement',
]);

/** Whether a node is assigned to (the left of an assignment, or a target in a destructuring assignment). */
function isAssignmentLeft(node) {
  const { parent } = node;
  switch (parent.type) {
    case 'AssignmentExpression':
    case 'AssignmentPattern':
      return parent.left === node;
    case 'ArrayPattern':
    case 'RestElement':
      return true;
    case 'Property':
      return parent.value === node && parent.parent.type === 'ObjectPattern';
    default:
      return false;
  }
}

/** Whether a node (maybe in a chain) is the operand of `++`, `--` or `delete`. */
function isMutationOperand(node) {
  const operand = node.parent.type === 'ChainExpression' ? node.parent : node;
  const { parent } = operand;
  if (parent.type === 'UpdateExpression') return parent.argument === operand;
  return parent.type === 'UnaryExpression' && parent.operator === 'delete' && parent.argument === operand;
}

/** Whether a node is the target of a for-in or for-of. */
function isIterationTarget(node) {
  const { parent } = node;
  return (parent.type === 'ForInStatement' || parent.type === 'ForOfStatement') && parent.left === node;
}

/** Whether a node is the first argument of a well-known mutation function (of the global Object or Reflect). */
function isMutationFunctionArgument(node, scope) {
  const { parent } = node;
  if (parent.type !== 'CallExpression' || parent.arguments[0] !== node) return false;
  const callee = skipChainExpression(parent.callee);
  if (
    !isSpecificMemberAccess(callee, 'Object', OBJECT_MUTATORS) &&
    !isSpecificMemberAccess(callee, 'Reflect', REFLECT_MUTATORS)
  ) {
    return false;
  }
  const variable = findVariable(scope, callee.object);
  return variable !== null && variable.scope.type === 'global';
}

/** Whether an identifier is written to through one of its members. */
function isMemberWrite(id, scope) {
  const { parent } = id;
  if (
    parent.type === 'MemberExpression' &&
    parent.object === id &&
    (isAssignmentLeft(parent) || isMutationOperand(parent) || isIterationTarget(parent))
  ) {
    return true;
  }
  return isMutationFunctionArgument(id, scope);
}

/** The write an identifier is part of. */
function getWriteNode(id) {
  let node = id.parent;
  while (node && !WRITE_TYPES.has(node.type)) node = node.parent;
  return node || id;
}

export const meta = {
  type: 'problem',
  docs: {
    description: 'Disallow assigning to imported bindings',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-import-assign',
  },
  schema: [],
  messages: {
    readonly: "'{{name}}' is read-only.",
    readonlyMember: "The members of '{{name}}' are read-only.",
  },
};

export function create(context) {
  const { sourceCode } = context;

  return {
    ImportDeclaration(node) {
      const scope = sourceCode.getScope(node);

      for (const variable of sourceCode.getDeclaredVariables(node)) {
        const isNamespace = variable.defs.some((def) => def.node.type === 'ImportNamespaceSpecifier');
        let previousId = null;

        for (const reference of variable.references) {
          const id = reference.identifier;
          // `[a = 0] = b` makes two write references to the same identifier: report it once.
          if (id === previousId) continue;
          previousId = id;

          let messageId;
          if (reference.isWrite()) messageId = 'readonly';
          else if (isNamespace && isMemberWrite(id, scope)) messageId = 'readonlyMember';
          else continue;
          context.report({ node: getWriteNode(id), messageId, data: { name: id.name } });
        }
      }
    },
  };
}
