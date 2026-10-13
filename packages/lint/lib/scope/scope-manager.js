// The result of scope analysis: its scopes (the global one first, then in the order of the code), the scopes of a
// node and the variables a node declares. Rules get it as sourceCode.scopeManager: its fields and methods are
// eslint-scope's.

import { Scope, GlobalScope, FunctionScope } from './scope.js';

class ScopeManager {
  constructor(options) {
    this.scopes = [];
    this.globalScope = null;
    this.__nodeToScope = new Map();
    this.__currentScope = null;
    this.__options = options;
    this.__declaredVariables = new Map();
  }

  __isOptimistic() {
    return Boolean(this.__options.optimistic);
  }

  __ignoreEval() {
    return Boolean(this.__options.ignoreEval);
  }

  __isES6() {
    return this.__options.ecmaVersion >= 6;
  }

  isGlobalReturn() {
    return Boolean(this.__options.nodejsScope) || this.__options.sourceType === 'commonjs';
  }

  isModule() {
    return this.__options.sourceType === 'module';
  }

  isImpliedStrict() {
    return Boolean(this.__options.impliedStrict);
  }

  isStrictModeSupported() {
    return this.__options.ecmaVersion >= 5;
  }

  __register(scope) {
    this.scopes.push(scope);
    const scopes = this.__nodeToScope.get(scope.block);
    if (scopes) scopes.push(scope);
    else this.__nodeToScope.set(scope.block, [scope]);
  }

  __get(node) {
    return this.__nodeToScope.get(node);
  }

  /** The variables a node declares (a declaration, a declarator, a function, a class, an import...). */
  getDeclaredVariables(node) {
    return this.__declaredVariables.get(node) ?? [];
  }

  /**
   * The scope of a node, or null: of a node with more than one (a named function expression: the scope of its name,
   * then its own), the outermost, or with `inner` the innermost.
   */
  acquire(node, inner) {
    const scopes = this.__get(node);
    if (!scopes || scopes.length === 0) return null;
    if (scopes.length === 1) return scopes[0];
    const fits = (scope) => !(scope.type === 'function' && scope.functionExpressionScope);
    if (inner) {
      for (let i = scopes.length - 1; i >= 0; --i) if (fits(scopes[i])) return scopes[i];
    } else {
      for (const scope of scopes) if (fits(scope)) return scope;
    }
    return null;
  }

  acquireAll(node) {
    return this.__get(node);
  }

  release(node, inner) {
    const scopes = this.__get(node);
    if (!scopes?.length) return null;
    const upper = scopes[0].upper;
    return upper ? this.acquire(upper.block, inner) : null;
  }

  attach() {}

  detach() {}

  // A new scope, inside the current one, becomes the current one.
  __nest(scope) {
    this.__currentScope = scope;
    return scope;
  }

  __nestGlobalScope(node) {
    this.globalScope = new GlobalScope(this, node);
    return this.__nest(this.globalScope);
  }

  __nestFunctionScope(node, isMethodDefinition) {
    return this.__nest(new FunctionScope(this, this.__currentScope, node, isMethodDefinition));
  }

  // A scope of a type that only differs by its type (block, for, catch, with, class, switch, module...).
  __nestScope(type, node, isMethodDefinition = false) {
    return this.__nest(new Scope(this, type, this.__currentScope, node, isMethodDefinition));
  }
}

export { ScopeManager };
