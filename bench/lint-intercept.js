'use strict';

// What a check of a piece of @xufa/lint (bench/lint-*.js) puts in place of a function or a class of its ES modules,
// to watch what the linter gives it: ES modules export read-only bindings, so each module watch() names is loaded
// with a setter of those names (module.registerHooks), which replace() calls. The modules that import a name see what
// replaced it (bindings are live). watch() comes before the module is loaded.
//
//   watch(file, ['analyze']);  ...  const ours = replace(file, 'analyze', (ast, options) => ...);

const { registerHooks } = require('node:module');
const { pathToFileURL } = require('node:url');

const watched = new Map(); // url -> names

registerHooks({
  load(url, context, next) {
    const result = next(url, context);
    const names = watched.get(url);
    if (!names) return result;
    // (Function and class declarations are bindings their module may assign.)
    const setters = names.map((name) => `${name}: (value) => { ${name} = value; }`).join(', ');
    return { ...result, source: `${result.source}\nexport const __replace = { ${setters} };\n` };
  },
});

/** Names of the module at `file` that replace() may replace. */
function watch(file, names) {
  watched.set(pathToFileURL(file).href, names);
}

/** Puts `value` in place of `name` of the module at `file` (named by watch()); returns what was there. */
function replace(file, name, value) {
  const module = require(file);
  const original = module[name];
  module.__replace[name](value);
  return original;
}

module.exports = { watch, replace };
