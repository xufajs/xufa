// A scope: the variables a block of code declares, the references made in it, and those it leaves to the scopes
// around it (through). References are resolved when the scope is closed, once all its declarations are known.
// The global scope also knows the globals that assignments make outside strict code (implicit); a function's scope
// declares `arguments`. The fields are eslint-scope's, which rules read.

import { Variable, Definition, Reference } from './variable.js';

// The types of scopes that hold `var` declarations (the variable scope of those inside them).
const VARIABLE_SCOPES = new Set(['global', 'module', 'function', 'class-field-initializer', 'class-static-block']);

// Whether code of a scope is strict: inside strict code, a method or a class, a module, or code that starts with the
// directive "use strict".
function isStrictScope(scope, block, isMethodDefinition) {
  if (scope.upper?.isStrict || isMethodDefinition) return true;
  if (scope.type === 'class' || scope.type === 'module') return true;
  let body;
  if (scope.type === 'function') {
    if (block.type === 'ArrowFunctionExpression' && block.body.type !== 'BlockStatement') return false;
    body = block.type === 'Program' ? block : block.body;
    if (!body) return false;
  } else if (scope.type === 'global') {
    body = block;
  } else {
    return false;
  }
  for (const statement of body.body) {
    if (typeof statement.directive !== 'string') break;
    if (statement.directive === 'use strict') return true;
  }
  return false;
}

// A global reference resolves in the global scope only to names that only let, const and class declare: others
// (var, functions) are properties of the global object, which the linter resolves with the globals it knows.
const declaresStatically = (def) =>
  def.type === Variable.ClassName || (def.type === Variable.Variable && def.parent.kind !== 'var');

class Scope {
  constructor(manager, type, upper, block, isMethodDefinition) {
    this.type = type;
    this.set = new Map();
    this.taints = new Map();
    this.dynamic = type === 'global' || type === 'with';
    this.block = block;
    this.through = [];
    this.variables = [];
    this.references = [];
    this.variableScope = VARIABLE_SCOPES.has(type) ? this : upper.variableScope;
    this.functionExpressionScope = false;
    this.directCallToEvalScope = false;
    this.thisFound = false;
    // The references not resolved yet; null once the scope is closed.
    this.__left = [];
    this.upper = upper;
    this.isStrict = manager.isStrictModeSupported() ? isStrictScope(this, block, isMethodDefinition) : false;
    this.childScopes = [];
    if (upper) upper.childScopes.push(this);
    this.__declaredVariables = manager.__declaredVariables;
    manager.__register(this);
  }

  // Resolves the references left in this scope, or passes them to the scope around it; returns that scope.
  __close(manager) {
    const statically = !this.dynamic || manager.__isOptimistic();
    for (const ref of this.__left) {
      if (statically || (this.type === 'global' && this.__closesStatically(ref))) {
        if (!this.__resolve(ref)) this.__delegateToUpperScope(ref);
      } else if (this.type === 'with') {
        ref.tainted = true;
        this.__delegateToUpperScope(ref);
      } else {
        for (let scope = this; scope; scope = scope.upper) scope.through.push(ref);
      }
    }
    this.__left = null;
    return this.upper;
  }

  __closesStatically(ref) {
    const variable = this.set.get(ref.identifier.name);
    return variable !== undefined && variable.defs.length > 0 && variable.defs.every(declaresStatically);
  }

  __isValidResolution() {
    return true;
  }

  __resolve(ref) {
    const variable = this.set.get(ref.identifier.name);
    if (variable === undefined || !this.__isValidResolution(ref, variable)) return false;
    variable.references.push(ref);
    variable.stack = variable.stack && ref.from.variableScope === this.variableScope;
    if (ref.tainted) {
      variable.tainted = true;
      this.taints.set(variable.name, true);
    }
    ref.resolved = variable;
    return true;
  }

  __delegateToUpperScope(ref) {
    if (this.upper) this.upper.__left.push(ref);
    this.through.push(ref);
  }

  __addDeclaredVariablesOfNode(variable, node) {
    if (node == null) return;
    let variables = this.__declaredVariables.get(node);
    if (variables === undefined) {
      variables = [];
      this.__declaredVariables.set(node, variables);
    }
    if (!variables.includes(variable)) variables.push(variable);
  }

  __defineGeneric(name, set, variables, node, def) {
    let variable = set.get(name);
    if (!variable) {
      variable = new Variable(name, this);
      set.set(name, variable);
      variables.push(variable);
    }
    if (def) {
      variable.defs.push(def);
      this.__addDeclaredVariablesOfNode(variable, def.node);
      this.__addDeclaredVariablesOfNode(variable, def.parent);
    }
    if (node) variable.identifiers.push(node);
  }

  __define(node, def) {
    if (node?.type === 'Identifier') this.__defineGeneric(node.name, this.set, this.variables, node, def);
  }

  __referencing(node, assign, writeExpr, maybeImplicitGlobal, partial, init) {
    if (!node || (node.type !== 'Identifier' && node.type !== 'JSXIdentifier') || node.name === 'super') return;
    const ref = new Reference(node, this, assign || Reference.READ, writeExpr, maybeImplicitGlobal, !!partial, !!init);
    this.references.push(ref);
    this.__left.push(ref);
  }

  __detectEval() {
    this.directCallToEvalScope = true;
    for (let scope = this; scope; scope = scope.upper) scope.dynamic = true;
  }

  __detectThis() {
    this.thisFound = true;
  }

  __isClosed() {
    return this.__left === null;
  }

  /** The reference of an identifier of this scope, or null. */
  resolve(identifier) {
    if (!this.__isClosed()) throw new Error('Scope should be closed.');
    if (identifier.type !== 'Identifier') throw new Error('Target should be identifier.');
    return this.references.find((ref) => ref.identifier === identifier) ?? null;
  }

  isStatic() {
    return !this.dynamic;
  }

  isArgumentsMaterialized() {
    return true;
  }

  isThisMaterialized() {
    return true;
  }

  isUsedName(name) {
    return this.set.has(name) || this.through.some((ref) => ref.identifier.name === name);
  }
}

class GlobalScope extends Scope {
  constructor(manager, block) {
    super(manager, 'global', null, block, false);
    this.implicit = { set: new Map(), variables: [], left: [] };
  }

  // Assignments to names nothing declares, outside strict code, make implicit globals.
  __close(manager) {
    const implicit = [];
    for (const ref of this.__left) {
      if (ref.__maybeImplicitGlobal && !this.set.has(ref.identifier.name)) implicit.push(ref.__maybeImplicitGlobal);
    }
    for (const { pattern, node } of implicit) {
      if (pattern?.type !== 'Identifier') continue;
      const def = new Definition(Variable.ImplicitGlobalVariable, pattern, node, null, null, null);
      this.__defineGeneric(pattern.name, this.implicit.set, this.implicit.variables, pattern, def);
    }
    this.implicit.left = this.__left;
    return super.__close(manager);
  }
}

class FunctionScope extends Scope {
  constructor(manager, upper, block, isMethodDefinition) {
    super(manager, 'function', upper, block, isMethodDefinition);
    if (block.type !== 'ArrowFunctionExpression') {
      this.__defineGeneric('arguments', this.set, this.variables, null, null);
      this.taints.set('arguments', true);
    }
  }

  isArgumentsMaterialized() {
    if (this.block.type === 'ArrowFunctionExpression') return false;
    if (!this.isStatic()) return true;
    const variable = this.set.get('arguments');
    return variable.tainted || variable.references.length !== 0;
  }

  isThisMaterialized() {
    return !this.isStatic() || this.thisFound;
  }

  // A name in the parameters is not one declared only in the body: `function f(a = b) { var b; }` reads an outer b.
  __isValidResolution(ref, variable) {
    if (this.block.type === 'Program') return true;
    const bodyStart = this.block.body.range[0];
    return !(
      variable.scope === this &&
      ref.identifier.range[0] < bodyStart &&
      variable.defs.every((def) => def.name.range[0] >= bodyStart)
    );
  }
}

export { Scope, GlobalScope, FunctionScope };
