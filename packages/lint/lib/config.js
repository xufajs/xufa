'use strict';

// Configs: xufa.lint.config.js (or .mjs, .cjs) exports a list of config objects, as ESLint's flat config does.
//
//   { files, ignores, languageOptions: { ecmaVersion, sourceType, globals, parserOptions }, linterOptions, rules,
//     settings, format }
//
// format holds the options of the formatter (prettier's: printWidth, singleQuote, trailingComma...), merged as the rest;
// format: false leaves the files of its object unformatted, and format.ignores (of any object) are files never formatted. The files formatted are those of JavaScript, TypeScript,
// JSON and markdown that no ignores ignore.
//
// An object with files applies to the files that match them (and not its ignores); one without, to all. An object
// with ignores alone ignores those files everywhere (node_modules and .git are ignored too). The objects that apply to
// a file are merged in order: languageOptions and settings deeply, rules by rule (a rule given only a severity keeps
// the options before it). The files to lint are those that match a files pattern: .js, .mjs and .cjs by default.

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { matches, ignored } = require('./glob');

const CONFIG_FILES = ['xufa.lint.config.js', 'xufa.lint.config.mjs', 'xufa.lint.config.cjs'];
const DEFAULT_FILES = ['**/*.js', '**/*.mjs', '**/*.cjs'];
const DEFAULT_IGNORES = ['**/node_modules/', '.git/'];
const FORMATTED = /\.(?:[cm]?[jt]sx?|json|md|markdown)$/i;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function mergeDeep(base, extra) {
  const out = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    out[key] = isObject(value) && isObject(base?.[key]) ? mergeDeep(base[key], value) : value;
  }
  return out;
}

function mergeRules(base, extra) {
  const out = { ...base };
  for (const [id, setting] of Object.entries(extra)) {
    const severityOnly = !Array.isArray(setting) || setting.length === 1;
    const before = out[id];
    if (severityOnly && Array.isArray(before) && before.length > 1) {
      out[id] = [Array.isArray(setting) ? setting[0] : setting, ...before.slice(1)];
    } else {
      out[id] = setting;
    }
  }
  return out;
}

/** The config file of a folder, or of the nearest folder above it that has one; null when none. */
function findConfigFile(from = process.cwd()) {
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    for (const name of CONFIG_FILES) {
      const file = path.join(dir, name);
      if (fs.existsSync(file)) return file;
    }
    if (path.dirname(dir) === dir) return null;
  }
}

const flatten = (list) =>
  list.flatMap((item) => (Array.isArray(item) ? flatten(item) : item === undefined || item === null ? [] : [item]));

class ConfigArray {
  // configs: the list of config objects; base: the folder their patterns are relative to.
  constructor(configs, base = process.cwd()) {
    this.configs = flatten(configs);
    this.base = base;
    this.globalIgnores = [...DEFAULT_IGNORES];
    for (const config of this.configs) {
      const keys = Object.keys(config).filter((key) => key !== 'name');
      if (keys.length === 1 && keys[0] === 'ignores') this.globalIgnores.push(...config.ignores);
    }
    this.formatIgnores = this.configs.flatMap((config) => (config.format && config.format.ignores) || []);
    this.files = [...DEFAULT_FILES];
    for (const config of this.configs) {
      for (const pattern of config.files ?? []) {
        if (typeof pattern === 'string' && !pattern.startsWith('!')) this.files.push(pattern);
      }
    }
  }

  relative(file) {
    return path.relative(this.base, path.resolve(this.base, file)).split(path.sep).join('/');
  }

  /** Whether a file (or a folder, with a final /) is ignored by the ignores of all the configs. */
  isIgnored(file) {
    const relative = this.relative(file);
    if (relative.startsWith('..')) return false;
    return ignored(this.globalIgnores, relative);
  }

  /** Whether a file is to be linted: matched by a files pattern, and not ignored. */
  isLinted(file) {
    const relative = this.relative(file);
    if (this.isIgnored(file)) return false;
    return this.files.some((pattern) => matches(pattern, relative));
  }

  /** Whether a file is to be formatted: of a language the formatter has, not ignored, nor in a format: false object. */
  isFormatted(file) {
    if (this.isIgnored(file) || !FORMATTED.test(file)) return false;
    if (ignored(this.formatIgnores, this.relative(file))) return false;
    return this.configFor(file).format !== false;
  }

  /** The config of a file: the objects that apply to it, merged. */
  configFor(file) {
    const relative = this.relative(file);
    let merged = { languageOptions: {}, linterOptions: {}, rules: {}, settings: {}, format: {} };
    for (const config of this.configs) {
      const keys = Object.keys(config).filter((key) => key !== 'name');
      if (keys.length === 1 && keys[0] === 'ignores') continue;
      if (config.files && !config.files.some((pattern) => matches(pattern, relative))) continue;
      if (config.ignores && ignored(config.ignores, relative)) continue;
      merged = {
        languageOptions: mergeDeep(merged.languageOptions, config.languageOptions ?? {}),
        linterOptions: { ...merged.linterOptions, ...config.linterOptions },
        rules: mergeRules(merged.rules, config.rules ?? {}),
        settings: mergeDeep(merged.settings, config.settings ?? {}),
        format: config.format === false || merged.format === false ? false : { ...merged.format, ...config.format },
      };
    }
    return merged;
  }
}

/** Loads a config file (its default export, a list or a function that gives one): a ConfigArray. */
async function loadConfig(file) {
  const module = await import(pathToFileURL(path.resolve(file)).href);
  let configs = module.default ?? module;
  if (typeof configs === 'function') configs = await configs();
  return new ConfigArray(Array.isArray(configs) ? configs : [configs], path.dirname(path.resolve(file)));
}

module.exports = { ConfigArray, loadConfig, findConfigFile, CONFIG_FILES };
