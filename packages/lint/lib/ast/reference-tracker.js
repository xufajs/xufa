// The references to globals and to their properties that a trace map asks for: reads, calls and constructions of
// `RegExp`, `Math.max`, `Atomics`... wherever they reach — through the global object (`globalThis.RegExp`, `window`,
// `self`, `global`), variables that alias them (`const R = RegExp`), destructuring (`const { max } = Math`), and
// expressions that pass them on (`a || b`, `a ? b : c`, `(a, b)`, `a?.b`). A global the code declares or writes is
// not one. As eslint-utils' ReferenceTracker finds them: rules depend on what it yields, and in which order.
//
//   const tracker = new ReferenceTracker(globalScope);
//   for (const { node, path, type, info } of tracker.iterateGlobalReferences({ RegExp: { [CALL]: true, [CONSTRUCT]: true } })) ...

import { findVariable, getPropertyName } from './static-value.js';

const READ = Symbol('read');
const CALL = Symbol('call');
const CONSTRUCT = Symbol('construct');

const has = (object, key) => Object.hasOwn(object, key);

const isModifiedGlobal = (variable) =>
  variable == null || variable.defs.length !== 0 || variable.references.some((ref) => ref.isWrite());

// Whether a node's value is its parent's value too.
function passesThrough(node) {
  const { parent } = node;
  if (!parent) return false;
  switch (parent.type) {
    case 'ConditionalExpression':
      return parent.consequent === node || parent.alternate === node;
    case 'LogicalExpression':
    case 'ChainExpression':
      return true;
    case 'SequenceExpression':
      return parent.expressions.at(-1) === node;
    default:
      return false;
  }
}

class ReferenceTracker {
  constructor(globalScope, { globalObjectNames = ['global', 'globalThis', 'self', 'window'] } = {}) {
    this.globalScope = globalScope;
    this.globalObjectNames = [...globalObjectNames];
    // The variables being followed (an alias of itself is followed once).
    this.variableStack = [];
  }

  /** The references to the globals of a trace map: { node, path, type, info }. */
  *iterateGlobalReferences(traceMap) {
    for (const key of Object.keys(traceMap)) {
      const variable = this.globalScope.set.get(key);
      if (!isModifiedGlobal(variable)) yield* this.variableReferences(variable, [key], traceMap[key], true);
    }
    for (const key of this.globalObjectNames) {
      const variable = this.globalScope.set.get(key);
      if (!isModifiedGlobal(variable)) yield* this.variableReferences(variable, [], traceMap, false);
    }
  }

  /** The references to the properties of a node's value that a trace map asks for. */
  *iteratePropertyReferences(node, traceMap) {
    yield* this.propertyReferences(node, [], traceMap);
  }

  *variableReferences(variable, path, traceMap, report) {
    if (this.variableStack.includes(variable)) return;
    this.variableStack.push(variable);
    try {
      for (const reference of variable.references) {
        if (!reference.isRead()) continue;
        const node = reference.identifier;
        if (report && traceMap[READ]) yield { node, path, type: READ, info: traceMap[READ] };
        yield* this.propertyReferences(node, path, traceMap);
      }
    } finally {
      this.variableStack.pop();
    }
  }

  // Where a value goes: a property read of it, a call or construction of it, a variable or a pattern it is assigned.
  *propertyReferences(start, path, traceMap) {
    let node = start;
    while (passesThrough(node)) node = node.parent;
    const { parent } = node;
    if (!parent) return;
    switch (parent.type) {
      case 'MemberExpression': {
        if (parent.object !== node) return;
        const key = getPropertyName(parent);
        if (key == null || !has(traceMap, key)) return;
        const next = traceMap[key];
        const nextPath = path.concat(key);
        if (next[READ]) yield { node: parent, path: nextPath, type: READ, info: next[READ] };
        yield* this.propertyReferences(parent, nextPath, next);
        return;
      }
      case 'CallExpression':
        if (parent.callee === node && traceMap[CALL]) yield { node: parent, path, type: CALL, info: traceMap[CALL] };
        return;
      case 'NewExpression':
        if (parent.callee === node && traceMap[CONSTRUCT]) {
          yield { node: parent, path, type: CONSTRUCT, info: traceMap[CONSTRUCT] };
        }
        return;
      case 'AssignmentExpression':
        if (parent.right === node) {
          yield* this.assignedReferences(parent.left, path, traceMap);
          yield* this.propertyReferences(parent, path, traceMap);
        }
        return;
      case 'AssignmentPattern':
        if (parent.right === node) yield* this.assignedReferences(parent.left, path, traceMap);
        return;
      case 'VariableDeclarator':
        if (parent.init === node) yield* this.assignedReferences(parent.id, path, traceMap);
        return;
      default:
    }
  }

  // The references through what a value is assigned to: a variable (its reads), or the keys of an object pattern.
  *assignedReferences(pattern, path, traceMap) {
    if (pattern.type === 'Identifier') {
      const variable = findVariable(this.globalScope, pattern);
      if (variable != null) yield* this.variableReferences(variable, path, traceMap, false);
    } else if (pattern.type === 'ObjectPattern') {
      for (const property of pattern.properties) {
        const key = getPropertyName(property);
        if (key == null || !has(traceMap, key)) continue;
        const next = traceMap[key];
        const nextPath = path.concat(key);
        if (next[READ]) yield { node: property, path: nextPath, type: READ, info: next[READ] };
        yield* this.assignedReferences(property.value, nextPath, next);
      }
    } else if (pattern.type === 'AssignmentPattern') {
      yield* this.assignedReferences(pattern.left, path, traceMap);
    }
  }
}

ReferenceTracker.READ = READ;
ReferenceTracker.CALL = CALL;
ReferenceTracker.CONSTRUCT = CONSTRUCT;

export { ReferenceTracker, READ, CALL, CONSTRUCT };
