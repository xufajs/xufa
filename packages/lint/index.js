'use strict';

// @xufa/lint: ESLint's recommended rules (ported, with their tests) and prettier's formatter (ported), on
// TypeScript's parser.
//
//   import { configs, globals } from '@xufa/lint';
//   export default [configs.recommended, { languageOptions: { globals: globals.node } }];  // xufa.lint.config.js
//
// What configs need is loaded here; the linter, the formatter and the parser when first used (ES modules import
// index.mjs, which does the same).

const { ConfigArray, loadConfig, findConfigFile } = require('./lib/config');
const { PORTED } = require('./lib/rules');
const formatters = require('./lib/formatters');
const globals = require('./lib/globals');

// ESLint's recommended rules (no-unexpected-multiline aside: what it checks is the formatter's).
const recommended = {
  name: '@xufa/lint/recommended',
  rules: Object.fromEntries([...PORTED].map((id) => [id, 'error'])),
};
const configs = { recommended };

module.exports = { ConfigArray, loadConfig, findConfigFile, formatters, globals, configs };

// Loaded when first used.
const LAZY = {
  Linter: './lib/linter',
  lintFiles: './lib/engine',
  lintText: './lib/engine',
  getRule: './lib/rules',
  defineRule: './lib/rules',
  parse: './lib/parser',
  tokenize: './lib/parser',
  format: './lib/format',
  formatFiles: './lib/format',
};
for (const [name, file] of Object.entries(LAZY)) {
  Object.defineProperty(module.exports, name, {
    enumerable: true,
    get: () => require(file)[name], // eslint-disable-line global-require
  });
}
