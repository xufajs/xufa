'use strict';

// loadConfig(options): the configuration of an app, from layers, each over the one before:
//
//   1. defaults (an object of the options)
//   2. config/default.{json,yaml,yml,js,cjs}
//   3. config/{env}.*                 (env: options.env, or NODE_ENV, or 'development')
//   4. config/local.*, then config/local-{env}.*   (of the machine: kept out of git)
//   5. the variables of the schema    ({ type, env: 'PORT' })
//   6. prefixed variables             (envPrefix 'APP': APP__DATABASE__URL is database.url)
//   7. overrides (an object of the options)
//
// Objects are merged key by key; arrays and other values replace. The environment is that of the process, with what
// .env files have that it does not (.env, .env.{env}, .env.local, .env.{env}.local: the later first). Then templates
// ({{ env.X }}, {{ config.a.b }}) are resolved, and the schema (when given) converts, fills in defaults and checks:
// every error at once, in a ConfigError. The configuration is frozen, with get(path), has(path), redacted(), and the
// files it was read from (sources).
const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');
const { ConfigError } = require('./errors');
const { parseDotenv } = require('./dotenv');
const { resolveTemplates } = require('./templates');
const { leaves, coerce, check, isPlain } = require('./schema');

const EXTENSIONS = ['.json', '.yaml', '.yml', '.js', '.cjs'];
const RESERVED = ['get', 'has', 'redacted', 'toJSON', 'sources'];
const SECRET = /pass(word|phrase)?$|secret|token|api[-_]?key|private[-_]?key|credentials?$/i;
const REDACTED = '[redacted]';

function readFile(file, context) {
  const ext = path.extname(file);
  try {
    if (ext === '.json') return JSON.parse(fs.readFileSync(file, 'utf8'));
    if (ext === '.yaml' || ext === '.yml') {
      const yaml = require('@xufa/yaml'); // eslint-disable-line global-require
      return yaml.load(fs.readFileSync(file, 'utf8'), { filename: file });
    }
    const exported = require(file); // eslint-disable-line global-require
    return typeof exported === 'function' ? exported(context) : exported;
  } catch (err) {
    throw new ConfigError(`${file}: ${err.message}`);
  }
}

// Merges `source` over `target` (a new object): objects key by key; undefined leaves a value as it was.
function merge(target, source) {
  if (!isPlain(source)) return source === undefined ? target : source;
  const out = isPlain(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    out[key] = isPlain(value) && isPlain(out[key]) ? merge(out[key], value) : isPlain(value) ? merge({}, value) : value;
  }
  return out;
}

const getAt = (tree, keys) => {
  let node = tree;
  for (const key of keys) {
    if (node === null || typeof node !== 'object' || !Object.hasOwn(node, key)) return undefined;
    node = node[key];
  }
  return node;
};

const setAt = (tree, keys, value) => {
  let node = tree;
  for (const key of keys.slice(0, -1)) {
    if (!isPlain(node[key])) node[key] = {};
    node = node[key];
  }
  node[keys[keys.length - 1]] = value;
};

const camel = (text) => text.toLowerCase().replace(/_([a-z0-9])/g, (all, c) => c.toUpperCase());
const loose = (text) => text.toLowerCase().replace(/[_-]/g, '');

// The variables of the environment with the prefix, as keys of the tree: APP__DATABASE__MAX_CONNECTIONS is
// database.maxConnections (the keys there are found whatever their case; new ones are camelCase).
function prefixed(env, prefix, separator, tree, schemaTree) {
  const start = `${prefix}${separator}`;
  const out = [];
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith(start) || value === undefined) continue;
    const keys = [];
    let node = tree;
    let shape = schemaTree;
    for (const part of name.slice(start.length).split(separator)) {
      if (part === '') continue;
      const existing = [node, shape]
        .filter((n) => n && typeof n === 'object')
        .flatMap((n) => Object.keys(n))
        .find((key) => loose(key) === loose(part));
      const key = existing || camel(part);
      keys.push(key);
      node = node && typeof node === 'object' ? node[key] : undefined;
      shape = shape && typeof shape === 'object' && typeof shape.type !== 'string' ? shape[key] : undefined;
    }
    if (keys.length) out.push({ name, keys, value });
  }
  return out;
}

// A text of the environment as the type of the value it replaces (without a schema).
function likeExisting(text, existing) {
  if (typeof existing === 'number' || typeof existing === 'boolean') {
    const { value, error } = coerce(text, typeof existing === 'number' ? 'number' : 'boolean');
    return error ? text : value;
  }
  if (Array.isArray(existing)) return coerce(text, 'array').value || text;
  if (isPlain(existing)) return coerce(text, 'object').value || text;
  return text;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function loadConfig(options = {}) {
  if (options.remote)
    throw new ConfigError('Remote sources are read by loadRemoteConfig() (they take time: it is async)');
  return complete(readLocal(options), options);
}

// The environment (with .env files), and the tree of the defaults and the files: what is read before remote sources.
function readLocal(options) {
  const environment = options.environment || process.env;
  const cwd = options.cwd || process.cwd();
  const name = options.env || environment.NODE_ENV || 'development';
  const sources = [];

  // The environment: the process's, with what .env files have that it does not.
  let fromFiles = {};
  const dotenvFiles =
    options.dotenv === false
      ? []
      : Array.isArray(options.dotenv) || typeof options.dotenv === 'string'
        ? [].concat(options.dotenv).map((file) => ({ file: path.resolve(cwd, file), required: true }))
        : ['.env', `.env.${name}`, '.env.local', `.env.${name}.local`].map((file) => ({
            file: path.join(cwd, file),
            required: false,
          }));
  for (const { file, required } of dotenvFiles) {
    if (!fs.existsSync(file)) {
      if (required) throw new ConfigError(`The .env file ${file} does not exist`);
      continue;
    }
    fromFiles = { ...fromFiles, ...parseDotenv(fs.readFileSync(file, 'utf8'), file) };
    sources.push(file);
  }
  const env = { ...fromFiles };
  for (const [key, value] of Object.entries(environment)) if (value !== undefined) env[key] = value;
  if (options.populate) {
    for (const [key, value] of Object.entries(fromFiles)) if (process.env[key] === undefined) process.env[key] = value;
  }
  Object.freeze(env);

  // The files of the configuration.
  const dirGiven = options.dir !== undefined;
  const dir = path.resolve(cwd, options.dir || 'config');
  let tree = merge({}, options.defaults || {});
  if (fs.existsSync(dir)) {
    for (const base of ['default', name, 'local', `local-${name}`]) {
      const found = EXTENSIONS.map((ext) => path.join(dir, `${base}${ext}`)).filter((file) => fs.existsSync(file));
      if (found.length > 1) {
        throw new ConfigError(
          `Several files of ${base} in ${dir}: ${found.map((f) => path.basename(f)).join(', ')} (one only)`
        );
      }
      if (found.length === 1) {
        const content = readFile(found[0], { env, name });
        if (content !== undefined && content !== null && !isPlain(content)) {
          throw new ConfigError(`${found[0]}: a configuration is an object`);
        }
        tree = merge(tree, content || {});
        sources.push(found[0]);
      }
    }
  } else if (dirGiven) {
    throw new ConfigError(`The folder of the configuration ${dir} does not exist`);
  }
  return { env, name, tree, sources, sensitive: [], literal: new Map() };
}

// Over the tree read: the variables of the schema, then the prefixed ones, then the overrides; the templates; the
// schema. `sensitive`: paths redacted (of sources that are secret); `literal`: values that are not templates (of
// sources that hold secrets: a {{ in a password is a {{), by path.
function complete(state, options) {
  const { env, name, sources, literal } = state;
  const separator = options.envSeparator || '__';
  const schema = options.schema || null;
  let { tree } = state;

  // The variables of the schema, then the prefixed ones, then the overrides.
  const specs = schema ? leaves(schema) : [];
  for (const { path: keys, spec } of specs) {
    if (spec.env && env[spec.env] !== undefined) setAt(tree, keys, env[spec.env]);
  }
  if (options.envPrefix) {
    for (const { keys, value } of prefixed(env, options.envPrefix, separator, tree, schema)) {
      setAt(tree, keys, schema ? value : likeExisting(value, getAt(tree, keys)));
    }
  }
  tree = merge(tree, options.overrides || {});

  tree = resolveTemplates(tree, env, literal);

  // The schema: converts, fills in defaults, checks.
  const errors = [];
  const sensitive = [...state.sensitive];
  for (const { path: keys, spec } of specs) {
    const where = keys.join('.');
    if (spec.sensitive) sensitive.push(where);
    let value = getAt(tree, keys);
    if (value === undefined && spec.default !== undefined)
      value = typeof spec.default === 'function' ? spec.default() : spec.default;
    if (value === undefined) {
      if (spec.required) errors.push({ path: where, message: `is required${spec.env ? ` (set ${spec.env})` : ''}` });
      continue;
    }
    if (value === null) {
      if (!spec.nullable) errors.push({ path: where, message: 'cannot be null' });
      else setAt(tree, keys, null);
      continue;
    }
    const converted = coerce(value, spec.type, spec.items);
    if (converted.error) {
      errors.push({ path: where, message: converted.error });
      continue;
    }
    const problem = check(converted.value, spec);
    if (problem) errors.push({ path: where, message: problem });
    else setAt(tree, keys, converted.value);
  }
  if (schema && options.strict) {
    const unknown = (node, shape, prefix) => {
      if (!isPlain(node)) return;
      for (const key of Object.keys(node)) {
        const at = [...prefix, key];
        const spec = shape && shape[key];
        if (spec === undefined) errors.push({ path: at.join('.'), message: 'is not in the schema' });
        else if (typeof spec.type !== 'string') unknown(node[key], spec, at);
      }
    };
    unknown(tree, schema, []);
  }
  if (errors.length) throw new ConfigError(`The configuration (${name}) has errors`, errors);

  for (const key of RESERVED) {
    if (Object.hasOwn(tree, key)) throw new ConfigError(`'${key}' cannot be a key of the configuration (its methods)`);
  }
  return finish(tree, { sensitive, sources });
}

// The configuration, frozen, with its methods (not enumerable: its keys are its own).
function finish(tree, { sensitive, sources }) {
  const config = deepFreeze(tree);
  const isSensitive = (keys) => {
    const at = keys.join('.');
    return sensitive.includes(at) || SECRET.test(keys[keys.length - 1]);
  };
  const redact = (node, keys) => {
    if (Array.isArray(node)) return node.map((item, i) => redact(item, [...keys, String(i)]));
    if (isPlain(node)) {
      const out = {};
      for (const [key, value] of Object.entries(node)) {
        out[key] =
          isSensitive([...keys, key]) && value !== null && value !== undefined
            ? REDACTED
            : redact(value, [...keys, key]);
      }
      return out;
    }
    return node;
  };
  const methods = {
    // The value at a path ('database.url', or ['database', 'url']): a key that is not there is an error.
    get(at) {
      const keys = Array.isArray(at) ? at : String(at).split('.');
      let node = config;
      for (let i = 0; i < keys.length; i += 1) {
        if (node === null || typeof node !== 'object' || !Object.hasOwn(node, keys[i])) {
          throw new ConfigError(`The configuration has no ${keys.slice(0, i + 1).join('.')}`);
        }
        node = node[keys[i]];
      }
      return node;
    },
    has(at) {
      return getAt(config, Array.isArray(at) ? at : String(at).split('.')) !== undefined;
    },
    // A copy without its secrets: the keys sensitive in the schema, and those named as secrets (password, token...).
    redacted() {
      return redact(config, []);
    },
    toJSON() {
      return redact(config, []);
    },
    sources: Object.freeze([...sources]),
    [util.inspect.custom](depth, opts) {
      return util.inspect(redact(config, []), opts);
    },
  };
  // On a copy of the root (frozen objects cannot take properties).
  const root = Object.create(Object.prototype, Object.getOwnPropertyDescriptors(config));
  for (const [key, value] of Object.entries(methods)) {
    Object.defineProperty(root, key, { value, enumerable: false });
  }
  Object.defineProperty(root, util.inspect.custom, { value: methods[util.inspect.custom], enumerable: false });
  return Object.freeze(root);
}

module.exports = { loadConfig, readLocal, complete, merge, getAt, setAt, deepFreeze };
