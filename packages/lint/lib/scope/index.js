// Scope analysis of an ESTree tree, as ESLint's JavaScript language asks for it (languages/js/index.js):
//
//   analyze(ast, { ecmaVersion, sourceType, nodejsScope, impliedStrict, ignoreEval })  -> ScopeManager
//
// sourceType is 'script', 'module' or 'commonjs' (its scope is a function's, as with nodejsScope). Before ES2015
// blocks have no scopes; before ES5 nothing is strict.

import { Analyzer } from './analyzer.js';
import { ScopeManager } from './scope-manager.js';
import { Scope } from './scope.js';
import { Variable, Definition, Reference } from './variable.js';

const DEFAULTS = { optimistic: false, nodejsScope: false, impliedStrict: false, sourceType: 'script', ecmaVersion: 5 };

function analyze(ast, options) {
  const manager = new ScopeManager({ ...DEFAULTS, ...options });
  new Analyzer(manager).visit(ast);
  if (manager.__currentScope !== null) throw new Error('currentScope should be null.');
  return manager;
}

export { analyze, ScopeManager, Scope, Variable, Definition, Reference };
