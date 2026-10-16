// ESLint's configs, where a project has no xufa.lint.config.js: its flat config (eslint.config.js and the other
// extensions ESLint 9 reads) taken as it is, or its config of before ESLint 9 (eslintrc: .eslintrc.js, .cjs, .yaml,
// .yml, .json, .eslintrc, or package.json's eslintConfig) made a flat one, as ESLint's migration does:
// - env: the globals of those environments (es20xx: also their ecmaVersion); globals, parserOptions (ecmaVersion,
//   sourceType), rules and settings as they are;
// - extends: 'eslint:recommended' (and 'eslint:all': the rules here), 'plugin:<plugin>/<config>', shareable configs
//   ('airbnb' is eslint-config-airbnb, '@scope' @scope/eslint-config) and paths, each converted the same way;
// - plugins: 'jest' is eslint-plugin-jest ('@scope' @scope/eslint-plugin), required from the config's folder;
// - overrides: their files and excludedFiles (a pattern without a '/' matches in any folder, as in eslintrc);
// - ignorePatterns and .eslintignore: ignored everywhere;
// - the .eslintrc files of the folders above, merged first, up to one with root: true; those of the folders below,
//   each for the files of its folder (root: true there leaves the configs above out of it).
// Parsers (parser, languageOptions.parser) are not used: TypeScript's parses every file.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { RECOMMENDED, RULES } from './rules/index.js';
import globals from './globals.js';

const ESLINT_FLAT_FILES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
];
const ESLINTRC_FILES = [
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.yaml',
  '.eslintrc.yml',
  '.eslintrc.json',
  '.eslintrc',
];

const isFlatFile = (file) => ESLINT_FLAT_FILES.includes(path.basename(file));
const isEslintrcFile = (file) => ESLINTRC_FILES.includes(path.basename(file)) || path.basename(file) === 'package.json';

// The config of before ESLint 9 of a folder (its file, or package.json with eslintConfig), or null.
function eslintrcIn(dir) {
  for (const name of ESLINTRC_FILES) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) return file;
  }
  const pkg = path.join(dir, 'package.json');
  if (fs.existsSync(pkg)) {
    try {
      if (JSON.parse(fs.readFileSync(pkg, 'utf8')).eslintConfig) return pkg;
    } catch {
      // (A package.json that does not parse has no config.)
    }
  }
  return null;
}

// --- Reading files of configs ---

// JSON with comments (/* */ and //, as ESLint reads .eslintrc.json).
function stripComments(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (char === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
    } else if (char === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
    } else {
      out += char;
      i += 1;
    }
  }
  return out;
}

async function parseYaml(text) {
  const { load } = await import('@xufa/yaml');
  return load(text) ?? {};
}

async function importDefault(file) {
  const module = await import(pathToFileURL(file).href);
  return module.default ?? module;
}

// The object of a file of an eslintrc config.
async function readEslintrc(file) {
  const name = path.basename(file);
  if (name === 'package.json') return JSON.parse(fs.readFileSync(file, 'utf8')).eslintConfig;
  if (/\.c?js$/.test(name)) return importDefault(file);
  const text = fs.readFileSync(file, 'utf8');
  if (/\.ya?ml$/.test(name)) return parseYaml(text);
  if (name.endsWith('.json')) return JSON.parse(stripComments(text));
  // (.eslintrc: JSON, or else YAML.)
  try {
    return JSON.parse(stripComments(text));
  } catch {
    return parseYaml(text);
  }
}

// --- Packages: plugins and shareable configs, required from a folder ---

function pluginPackage(name) {
  if (name.startsWith('@')) {
    const [scope, rest] = name.split('/');
    if (!rest) return `${scope}/eslint-plugin`;
    return rest.startsWith('eslint-plugin') ? name : `${scope}/eslint-plugin-${rest}`;
  }
  return name.startsWith('eslint-plugin-') ? name : `eslint-plugin-${name}`;
}

// The name a plugin's rules are under: 'eslint-plugin-react' and 'react' are react, '@scope/eslint-plugin' @scope.
function pluginNamespace(name) {
  if (name.startsWith('@')) {
    const [scope, rest] = name.split('/');
    if (!rest || rest === 'eslint-plugin') return scope;
    return `${scope}/${rest.replace(/^eslint-plugin-/, '')}`;
  }
  return name.replace(/^eslint-plugin-/, '');
}

function configPackage(name) {
  if (name.startsWith('@')) {
    const [scope, rest] = name.split('/');
    if (!rest) return `${scope}/eslint-config`;
    return rest.startsWith('eslint-config') ? name : `${scope}/eslint-config-${rest}`;
  }
  return name.startsWith('eslint-config-') ? name : `eslint-config-${name}`;
}

async function requireFrom(dir, name) {
  const resolved = createRequire(path.join(dir, 'noop.js')).resolve(name);
  return { file: resolved, value: await importDefault(resolved) };
}

// --- eslintrc to flat ---

// ESLint's names of environments: es6 is es2015, the others as globals has them.
const ENV_ALIASES = { es6: 'es2015' };

function globalsOfEnv(env) {
  const all = {};
  let ecmaVersion;
  for (const [name, on] of Object.entries(env ?? {})) {
    if (!on) continue;
    const key = ENV_ALIASES[name] ?? name;
    if (globals[key]) Object.assign(all, globals[key]);
    const year = /^es(\d{4})$/.exec(key);
    if (year) ecmaVersion = Math.max(ecmaVersion ?? 0, Number(year[1]));
    else if (key === 'es2015') ecmaVersion = Math.max(ecmaVersion ?? 0, 2015);
  }
  return { globals: all, ecmaVersion };
}

// A pattern of eslintrc as one of a flat config: one without a '/' (but a last one) matches in any folder.
function flatPattern(pattern) {
  if (pattern.startsWith('!')) return `!${flatPattern(pattern.slice(1))}`;
  if (pattern.startsWith('/')) return pattern.slice(1);
  const body = pattern.endsWith('/') ? pattern.slice(0, -1) : pattern;
  return body.includes('/') || pattern.startsWith('**') ? pattern : `**/${pattern}`;
}

const ALL_RULES = () => Object.fromEntries([...RULES].map((id) => [id, 'error']));

// The flat configs of an eslintrc object (dir: where its paths and packages are from).
async function fromEslintrc(rc, dir, seen = new Set()) {
  const out = [];
  if (!rc || typeof rc !== 'object') return out;
  const plugins = {};
  for (const name of [].concat(rc.plugins ?? [])) {
    const { value } = await requireFrom(dir, pluginPackage(name));
    plugins[pluginNamespace(name)] = value;
  }
  if (Object.keys(plugins).length) out.push({ plugins });
  for (const name of [].concat(rc.extends ?? [])) out.push(...(await extendedConfig(name, dir, plugins, seen)));
  const own = {};
  const languageOptions = {};
  const env = globalsOfEnv(rc.env);
  const allGlobals = { ...env.globals, ...rc.globals };
  if (Object.keys(allGlobals).length) languageOptions.globals = allGlobals;
  const { ecmaVersion, sourceType, ...parserOptions } = rc.parserOptions ?? {};
  if (ecmaVersion !== undefined || env.ecmaVersion !== undefined) {
    languageOptions.ecmaVersion = ecmaVersion === 'latest' ? 'latest' : (ecmaVersion ?? env.ecmaVersion);
  }
  if (sourceType !== undefined) languageOptions.sourceType = sourceType;
  if (Object.keys(parserOptions).length) languageOptions.parserOptions = parserOptions;
  if (Object.keys(languageOptions).length) own.languageOptions = languageOptions;
  if (rc.rules) own.rules = rc.rules;
  if (rc.settings) own.settings = rc.settings;
  if (rc.noInlineConfig !== undefined || rc.reportUnusedDisableDirectives !== undefined) {
    own.linterOptions = {
      ...(rc.noInlineConfig !== undefined && { noInlineConfig: rc.noInlineConfig }),
      ...(rc.reportUnusedDisableDirectives !== undefined && {
        reportUnusedDisableDirectives: rc.reportUnusedDisableDirectives,
      }),
    };
  }
  if (Object.keys(own).length) out.push(own);
  for (const override of rc.overrides ?? []) {
    const files = [].concat(override.files ?? []).map(flatPattern);
    const ignores = [].concat(override.excludedFiles ?? []).map(flatPattern);
    for (const config of await fromEslintrc({ ...override, files: undefined, excludedFiles: undefined }, dir, seen)) {
      // (Plugins apply everywhere; the rest to the override's files.)
      if (Object.keys(config).length === 1 && config.plugins) out.push(config);
      else out.push({ ...config, files, ...(ignores.length && { ignores }) });
    }
  }
  if (rc.ignorePatterns) out.push({ ignores: [].concat(rc.ignorePatterns).map(flatPattern) });
  return out;
}

// What an entry of extends gives.
async function extendedConfig(name, dir, plugins, seen) {
  if (name === 'eslint:recommended')
    return [{ rules: Object.fromEntries([...RECOMMENDED].map((id) => [id, 'error'])) }];
  if (name === 'eslint:all') return [{ rules: ALL_RULES() }];
  if (name.startsWith('plugin:')) {
    const at = name.lastIndexOf('/');
    const pluginName = name.slice('plugin:'.length, at);
    const configName = name.slice(at + 1);
    let plugin = plugins[pluginNamespace(pluginName)];
    let pluginDir = dir;
    if (!plugin) {
      const found = await requireFrom(dir, pluginPackage(pluginName));
      plugin = found.value;
      pluginDir = path.dirname(found.file);
      plugins[pluginNamespace(pluginName)] = plugin;
    }
    const config = plugin.configs?.[configName];
    if (!config) throw new Error(`The plugin "${pluginName}" has no config "${configName}" (extends of ${dir}).`);
    // (A plugin's flat configs are taken as they are; its legacy ones converted.)
    if (Array.isArray(config)) return config;
    if (config.languageOptions || (config.plugins && !Array.isArray(config.plugins))) return [config];
    return fromEslintrc(config, pluginDir, seen);
  }
  let file;
  let value;
  if (name.startsWith('.') || path.isAbsolute(name)) {
    file = path.resolve(dir, name);
    value = await readEslintrc(file);
  } else {
    ({ file, value } = await requireFrom(dir, configPackage(name)));
  }
  if (seen.has(file)) return [];
  seen.add(file);
  return fromEslintrc(value, path.dirname(file), seen);
}

// The lines of an .eslintignore as ignores.
function eslintignoreOf(dir) {
  const file = path.join(dir, '.eslintignore');
  if (!fs.existsSync(file)) return [];
  const patterns = fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map(flatPattern);
  return patterns.length ? [{ ignores: patterns }] : [];
}

/** The flat configs of an eslintrc file, with those of the folders above it (up to root: true) first. */
async function loadEslintrc(file) {
  const chain = [];
  for (let current = file; current;) {
    const value = await readEslintrc(current);
    chain.unshift({ file: current, value });
    if (value?.root) break;
    const parent = path.dirname(path.dirname(current));
    if (parent === path.dirname(current)) break;
    let above = null;
    for (let dir = parent; ; dir = path.dirname(dir)) {
      above = eslintrcIn(dir);
      if (above || path.dirname(dir) === dir) break;
    }
    current = above;
  }
  const configs = [];
  for (const { file: one, value } of chain) configs.push(...(await fromEslintrc(value, path.dirname(one))));
  configs.push(...eslintignoreOf(path.dirname(file)));
  configs.push(...(await nestedEslintrc(path.dirname(file), configs)));
  return configs;
}

const SCRIPTS = ['**/*.js', '**/*.mjs', '**/*.cjs'];
const SKIPPED_FOLDERS = new Set(['node_modules', '.git']);

// The folders under a folder (not node_modules, .git nor hidden ones) that have an eslintrc of their own, the
// nearest first.
function foldersWithEslintrc(base) {
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || SKIPPED_FOLDERS.has(entry.name) || entry.name.startsWith('.')) continue;
      const folder = path.join(dir, entry.name);
      const file = eslintrcIn(folder);
      if (file) found.push(file);
      walk(folder);
    }
  };
  walk(base);
  return found.sort((a, b) => a.split(path.sep).length - b.split(path.sep).length);
}

// A pattern of a config of a folder under the base, made relative to the base.
const under = (rel, pattern) =>
  pattern.startsWith('!') ? `!${rel}/${pattern.slice(1).replace(/^\/+/, '')}` : `${rel}/${pattern.replace(/^\/+/, '')}`;

// The eslintrc files of the folders under the base, as ESLint applies them to their own files: each one's objects
// limited to the files of its folder, after those of the folders above (so its rules win there); one with
// root: true leaves the configs of the folders above out of its folder.
async function nestedEslintrc(base, above) {
  const configs = [];
  for (const file of foldersWithEslintrc(base)) {
    const dir = path.dirname(file);
    const rel = path.relative(base, dir).split(path.sep).join('/');
    const value = await readEslintrc(file);
    if (value?.root) {
      for (const config of [...above, ...configs]) {
        const keys = Object.keys(config);
        // (Plugins and ignores everywhere stay; the rest leaves this folder.)
        if (keys.length === 1 && (keys[0] === 'plugins' || keys[0] === 'ignores')) continue;
        config.ignores = [...(config.ignores ?? []), `${rel}/**`];
      }
    }
    for (const config of await fromEslintrc(value, dir)) {
      const keys = Object.keys(config);
      if (keys.length === 1 && keys[0] === 'plugins') configs.push(config);
      else if (keys.length === 1 && keys[0] === 'ignores') {
        configs.push({ ignores: config.ignores.map((pattern) => under(rel, pattern)) });
      } else {
        configs.push({
          ...config,
          files: (config.files ?? SCRIPTS).map((pattern) => under(rel, pattern)),
          ...(config.ignores && { ignores: config.ignores.map((pattern) => under(rel, pattern)) }),
        });
      }
    }
    configs.push(
      ...eslintignoreOf(dir).map(({ ignores }) => ({ ignores: ignores.map((pattern) => under(rel, pattern)) }))
    );
  }
  return configs;
}

// The objects of a flat config of ESLint, with extends (of defineConfig) put in place: configs, lists of them, or
// 'plugin/config' of the object's plugins.
function expandFlat(configs) {
  return configs.flat(Infinity).flatMap((config) => {
    if (!config || typeof config !== 'object' || !config.extends) return config ? [config] : [];
    const { extends: extended, ...rest } = config;
    const base = [].concat(extended).flatMap((item) => {
      if (typeof item !== 'string') return expandFlat([item]);
      const at = item.indexOf('/');
      const plugin = rest.plugins?.[item.slice(0, at)];
      const found = plugin?.configs?.[item.slice(at + 1)];
      if (!found) throw new Error(`No config "${item}" among the plugins of a config.`);
      return expandFlat([found]);
    });
    const scope = { ...(rest.files && { files: rest.files }), ...(rest.ignores && { ignores: rest.ignores }) };
    return [...base.map((item) => ({ ...item, ...scope })), rest];
  });
}

/** The flat config of ESLint of a file (its default export: a list, an object, or a function or promise of one). */
async function loadEslintFlat(file) {
  let configs = await importDefault(file);
  if (typeof configs === 'function') configs = await configs();
  configs = await configs;
  return expandFlat(Array.isArray(configs) ? configs : [configs]);
}

export { ESLINT_FLAT_FILES, ESLINTRC_FILES, eslintrcIn, isFlatFile, isEslintrcFile, loadEslintFlat, loadEslintrc };
