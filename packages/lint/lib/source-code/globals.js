// The globals of a file in its global scope: those of its edition, of CommonJS, of the config, and of its
// `/* global a:writable */` comments, as variables (with the eslint* fields rules read: eslintImplicitGlobalSetting,
// eslintExplicitGlobal, eslintExplicitGlobalComments, writeable); the references left to the global scope resolved to
// them. And the variables of `/* exported a */` comments, marked used.

import { Variable } from '../scope/index.js';
import { editionGlobals, COMMONJS } from '../data/ecma-globals.js';

/** The value of a global's setting: 'off', 'writable' or 'readonly' (an error if not one). */
function normalizeConfigGlobal(value) {
  switch (value) {
    case 'off':
      return 'off';
    case true:
    case 'true':
    case 'writeable':
    case 'writable':
      return 'writable';
    case null:
    case false:
    case 'false':
    case 'readable':
    case 'readonly':
      return 'readonly';
    default:
      throw new Error(`'${value}' is not a valid configuration for a global (use 'readonly', 'writable', or 'off')`);
  }
}

const NO_GLOBALS = Object.freeze({});
// The globals of configs, by their own globals, then by edition and source type.
const configGlobalsCache = new WeakMap();

/** The globals a config gives: its edition's, CommonJS's for commonjs, and its own (made once a config; read only). */
function configGlobalsOf({ ecmaVersion, sourceType, globals = NO_GLOBALS }) {
  let byOptions = configGlobalsCache.get(globals);
  if (!byOptions) configGlobalsCache.set(globals, (byOptions = new Map()));
  const key = `${ecmaVersion}/${sourceType === 'commonjs'}`;
  let merged = byOptions.get(key);
  if (!merged) {
    merged = Object.assign(
      Object.create(null),
      editionGlobals(ecmaVersion),
      sourceType === 'commonjs' ? COMMONJS : undefined,
      globals
    );
    byOptions.set(key, merged);
  }
  return merged;
}

// A global of the config or of comments: its variable in the global scope (unless it is off).
function addGlobal(globalScope, name, configGlobals, inlineGlobals) {
  const configValue = configGlobals[name] === undefined ? undefined : normalizeConfigGlobal(configGlobals[name]);
  const comments = inlineGlobals[name]?.comments;
  const value = inlineGlobals[name]?.value || configValue;
  if (value === 'off') return;
  let variable = globalScope.set.get(name);
  if (!variable) {
    variable = new Variable(name, globalScope);
    globalScope.variables.push(variable);
    globalScope.set.set(name, variable);
  }
  variable.eslintImplicitGlobalSetting = configValue;
  variable.eslintExplicitGlobal = comments !== undefined;
  variable.eslintExplicitGlobalComments = comments;
  variable.writeable = value === 'writable';
}

/**
 * The globals of the config and of comments ({ name: { value, comments } }) into the global scope: a variable each
 * (unless off), the references left to the global scope resolved to them, and implicit globals they declare removed.
 */
function addDeclaredGlobals(globalScope, configGlobals = {}, inlineGlobals = {}) {
  // Those of the config, then those only of comments.
  for (const name of Object.keys(configGlobals)) addGlobal(globalScope, name, configGlobals, inlineGlobals);
  for (const name of Object.keys(inlineGlobals)) {
    if (!Object.hasOwn(configGlobals, name)) addGlobal(globalScope, name, configGlobals, inlineGlobals);
  }
  globalScope.through = globalScope.through.filter((reference) => {
    const variable = globalScope.set.get(reference.identifier.name);
    if (!variable) return true;
    reference.resolved = variable;
    variable.references.push(reference);
    return false;
  });
  const { implicit } = globalScope;
  if (typeof implicit === 'object' && implicit !== null) {
    implicit.variables = implicit.variables.filter((variable) => {
      if (!globalScope.set.has(variable.name)) return true;
      implicit.set.delete(variable.name);
      return false;
    });
    if (implicit.left)
      implicit.left = implicit.left.filter((reference) => !globalScope.set.has(reference.identifier.name));
  }
}

/** The variables of `/* exported *\/` comments, marked used and exported. */
function markExportedVariables(globalScope, names) {
  for (const name of Object.keys(names)) {
    const variable = globalScope.set.get(name);
    if (variable) {
      variable.eslintUsed = true;
      variable.eslintExported = true;
    }
  }
}

export { normalizeConfigGlobal, configGlobalsOf, addDeclaredGlobals, markExportedVariables };
