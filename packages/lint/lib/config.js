// Configs: xufa.lint.config.js (or .mjs, .cjs) exports a list of config objects, as ESLint's flat config does; without
// one, ESLint's config of the project is read (./eslint-config.js).
//
//   { files, ignores, languageOptions: { ecmaVersion, sourceType, globals, parserOptions }, linterOptions, rules,
//     settings, format, plugins }
//
// format holds the options of the formatter (prettier's: printWidth, singleQuote, trailingComma...), merged as the rest;
// format: false leaves the files of its object unformatted, and format.ignores (of any object) are files never formatted. The files formatted are those of JavaScript, TypeScript,
// JSON and markdown that no ignores ignore.
//
// An object with files applies to the files that match them (and not its ignores); one without, to all. An object
// with ignores alone ignores those files everywhere (node_modules and .git are ignored too). The objects that apply to
// a file are merged in order: languageOptions and settings deeply, rules by rule (a rule given only a severity keeps
// the options before it). The files to lint are those that match a files pattern: .js, .mjs and .cjs by default.
// plugins, as ESLint's ({ jest: { rules } }), name their rules `jest/rule` (rules only: no processors or configs).

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { matches, ignored } from './glob.js';
import { defineRule } from './rules/index.js';
import {
  ESLINT_FLAT_FILES,
  eslintrcIn,
  isEslintrcFile,
  isFlatFile,
  loadEslintFlat,
  loadEslintrc,
} from './eslint-config.js';

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

/**
 * The config file of a folder, or of the nearest folder above it that has one; null when none. In each folder:
 * xufa.lint.config.js (.mjs, .cjs), else ESLint's flat config (eslint.config.js, .mjs, .cjs, .ts, .mts, .cts), else
 * ESLint's config of before ESLint 9 (.eslintrc.js, .cjs, .yaml, .yml, .json, .eslintrc, package.json's eslintConfig).
 */
function findConfigFile(from = process.cwd()) {
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    for (const name of [...CONFIG_FILES, ...ESLINT_FLAT_FILES]) {
      const file = path.join(dir, name);
      if (fs.existsSync(file)) return file;
    }
    const eslintrc = eslintrcIn(dir);
    if (eslintrc) return eslintrc;
    if (path.dirname(dir) === dir) return null;
  }
}

const flatten = (list) =>
  list.flatMap((item) => (Array.isArray(item) ? flatten(item) : item === undefined || item === null ? [] : [item]));

class ConfigArray {
  // The merged configs, by the configs that apply (files with the same ones share it).
  #merged = new Map();

  // configs: the list of config objects; base: the folder their patterns are relative to.
  constructor(configs, base = process.cwd()) {
    this.configs = flatten(configs);
    this.base = base;
    this.globalIgnores = [...DEFAULT_IGNORES];
    for (const config of this.configs) {
      for (const [namespace, plugin] of Object.entries(config.plugins ?? {})) {
        for (const [name, rule] of Object.entries(plugin?.rules ?? {})) defineRule(`${namespace}/${name}`, rule);
      }
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

  /** The config of a file: the objects that apply to it, merged (the same object for files they all apply to). */
  configFor(file) {
    const relative = this.relative(file);
    const applying = [];
    const indexes = [];
    this.configs.forEach((config, i) => {
      if (appliesTo(config, relative)) {
        applying.push(config);
        indexes.push(i);
      }
    });
    const key = indexes.join(',');
    let merged = this.#merged.get(key);
    if (!merged) {
      merged = mergeConfigs(applying);
      this.#merged.set(key, merged);
    }
    return merged;
  }
}

// Whether a config applies to a file (a config of global ignores alone applies to none).
function appliesTo(config, relative) {
  const keys = Object.keys(config).filter((key) => key !== 'name');
  if (keys.length === 1 && keys[0] === 'ignores') return false;
  if (config.files && !config.files.some((pattern) => matches(pattern, relative))) return false;
  return !(config.ignores && ignored(config.ignores, relative));
}

// Configs merged in order, as ESLint merges them.
function mergeConfigs(configs) {
  let merged = { languageOptions: {}, linterOptions: {}, rules: {}, settings: {}, format: {} };
  for (const config of configs) {
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

/** Loads a config file (its default export, a list or a function that gives one): a ConfigArray. */
async function loadConfig(file) {
  const resolved = path.resolve(file);
  const base = path.dirname(resolved);
  if (isFlatFile(resolved)) return new ConfigArray(await loadEslintFlat(resolved), base);
  if (isEslintrcFile(resolved)) return new ConfigArray(await loadEslintrc(resolved), base);
  const module = await import(pathToFileURL(resolved).href);
  let configs = module.default ?? module;
  if (typeof configs === 'function') configs = await configs();
  return new ConfigArray(Array.isArray(configs) ? configs : [configs], base);
}

export { ConfigArray, loadConfig, findConfigFile, CONFIG_FILES };
