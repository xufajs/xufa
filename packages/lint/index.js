// @xufa/lint: ESLint's recommended rules (with their tests) and prettier's formatter (ported), on TypeScript's parser.
//
//   import { configs, globals } from '@xufa/lint';
//   export default [configs.recommended, { languageOptions: { globals: globals.node } }];  // xufa.lint.config.js
//
// What configs need is loaded here; the linter, the formatter and the parser when first used (a config loads none of
// them), with require() of their ES modules.

import { createRequire } from 'node:module';
import { ConfigArray, loadConfig, findConfigFile } from './lib/config.js';
import { RECOMMENDED } from './lib/rules/index.js';
import * as formatters from './lib/formatters.js';
import globals from './lib/globals.js';

const require = createRequire(import.meta.url);
const engine = () => require('./lib/engine.js');
const rules = () => require('./lib/rules/index.js');
const parser = () => require('./lib/parser.js');
const formatter = () => require('./lib/format/index.js');

// ESLint's recommended rules (no-unexpected-multiline aside: what it checks is the formatter's).
const recommended = {
  name: '@xufa/lint/recommended',
  rules: Object.fromEntries([...RECOMMENDED].map((id) => [id, 'error'])),
};
const configs = { recommended };

// Plugins of rules ported (lib/plugins): eslint-plugin-jest's, as `plugins: { jest: plugins.jest }` in a config.
const plugins = {
  get jest() {
    return require('./lib/plugins/jest/index.js');
  },
};

const lintFiles = (...args) => engine().lintFiles(...args);
const lintText = (...args) => engine().lintText(...args);
const getRule = (...args) => rules().getRule(...args);
const defineRule = (...args) => rules().defineRule(...args);
const parse = (...args) => parser().parse(...args);
const tokenize = (...args) => parser().tokenize(...args);
const format = (...args) => formatter().format(...args);
const formatFiles = (...args) => formatter().formatFiles(...args);

// The linter, made by the class of lib/linter.js (loaded on the first new Linter()).
class Linter {
  constructor(...args) {
    return new (require('./lib/linter.js').Linter)(...args);
  }
}

export {
  ConfigArray,
  loadConfig,
  findConfigFile,
  formatters,
  globals,
  configs,
  plugins,
  Linter,
  lintFiles,
  lintText,
  getRule,
  defineRule,
  parse,
  tokenize,
  format,
  formatFiles,
};
