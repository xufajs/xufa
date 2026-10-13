// @xufa/lint for ES modules: the names of index.js, the linter, the formatter and the parser loaded when first used.
import { createRequire } from 'node:module';

const lint = createRequire(import.meta.url)('./index.js');

export const { ConfigArray, loadConfig, findConfigFile, formatters, globals, configs } = lint;

export const lintFiles = (...args) => lint.lintFiles(...args);
export const lintText = (...args) => lint.lintText(...args);
export const getRule = (...args) => lint.getRule(...args);
export const defineRule = (...args) => lint.defineRule(...args);
export const parse = (...args) => lint.parse(...args);
export const tokenize = (...args) => lint.tokenize(...args);
export const format = (...args) => lint.format(...args);
export const formatFiles = (...args) => lint.formatFiles(...args);

// The linter, made by the class of lib/linter.js (loaded on the first new Linter()).
export class Linter {
  constructor(...args) {
    return new lint.Linter(...args);
  }
}

export default lint;
