'use strict';

// The cases of ESLint's tests of the rules (packages/lint/test/rules), for the checks of pieces of the linter against
// the originals (bench/lint-*.js): each case's rule, code, filename and language options, collected by a RuleTester
// that runs nothing. Cases for another parser are left out, as @xufa/lint's RuleTester skips them.

const fs = require('node:fs');
const path = require('node:path');
const { registerHooks } = require('node:module');
const { pathToFileURL } = require('node:url');

const LINT = path.join(__dirname, '../packages/lint');

function cases() {
  const found = [];
  const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const merge = (base, extra) => {
    const out = { ...base };
    for (const [key, value] of Object.entries(extra ?? {})) {
      if (value !== undefined) out[key] = isObject(value) && isObject(base?.[key]) ? merge(base[key], value) : value;
    }
    return out;
  };
  class CollectingRuleTester {
    constructor(config = {}) {
      this.config = config;
    }

    run(name, rule, { valid = [], invalid = [] }) {
      for (const raw of [...valid, ...invalid]) {
        const item = typeof raw === 'string' ? { code: raw } : raw;
        const languageOptions = merge(this.config.languageOptions, item.languageOptions);
        if (languageOptions.parser || item.parser) continue;
        found.push({
          name,
          code: item.code,
          filename: item.filename ?? 'file.js',
          languageOptions,
          options: item.options,
          settings: item.settings,
        });
      }
    }
  }
  // The tests import ../rule-tester.js: while they load, that module is the collecting one.
  const tester = pathToFileURL(path.join(LINT, 'test/rule-tester.js')).href;
  globalThis.__collectingRuleTester = CollectingRuleTester;
  const hooks = registerHooks({
    load: (url, context, next) =>
      url === tester
        ? { format: 'module', source: 'export default globalThis.__collectingRuleTester;', shortCircuit: true }
        : next(url, context),
  });
  const noop = () => {};
  Object.assign(globalThis, { describe: noop, it: noop });
  try {
    for (const file of fs.readdirSync(path.join(LINT, 'test/rules'))) require(path.join(LINT, 'test/rules', file));
  } finally {
    hooks.deregister();
    delete globalThis.__collectingRuleTester;
  }
  return found;
}

module.exports = { cases };
