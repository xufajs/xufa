// Checks of a plugin being registered: its metadata (name, version range, decorators and plugins it needs).
const semver = require('./semver');
const { kTestInternals } = require('./symbols');
const { exist, existReply, existRequest } = require('./decorate');
const {
  XUFA_ERR_PLUGIN_VERSION_MISMATCH,
  XUFA_ERR_PLUGIN_NOT_PRESENT_IN_INSTANCE,
  XUFA_ERR_PLUGIN_INVALID_ASYNC_HANDLER,
  XUFA_ERR_PLUGIN_DEPENDENCY_NOT_REGISTERED,
} = require('./errors');

const kRegisteredPlugins = Symbol.for('registered-plugin');
const PRERELEASE = /-(?:rc|pre|alpha).+$/u;

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.code = 'ERR_ASSERTION';
    throw err;
  }
}

function getMeta(fn) {
  return fn[Symbol.for('plugin-meta')];
}

function getDisplayName(fn) {
  return fn[Symbol.for('fastify.display-name')] || fn[Symbol.for('xufa.display-name')];
}

// A name for a plugin: the one displayed, the file exporting it, or the name of the function.
function getPluginName(func) {
  const display = getDisplayName(func);
  if (display) return display;
  const cache = require.cache; // eslint-disable-line prefer-destructuring
  if (cache) {
    for (const key of Object.keys(cache)) {
      if (cache[key].exports === func) return key;
    }
  }
  return func.name || null;
}

function getFuncPreview(func) {
  return func
    .toString()
    .split('\n', 2)
    .map((line) => line.trim())
    .join(' -- ');
}

function shouldSkipOverride(fn) {
  return Boolean(fn[Symbol.for('skip-override')]);
}

function checkDependencies(fn) {
  const meta = getMeta(fn);
  if (!meta || !meta.dependencies) return;
  assert(Array.isArray(meta.dependencies), 'The dependencies should be an array of strings');
  for (const dependency of meta.dependencies) {
    if (!this[kRegisteredPlugins].includes(dependency)) {
      throw new XUFA_ERR_PLUGIN_DEPENDENCY_NOT_REGISTERED(dependency, meta.name);
    }
  }
}

const checks = { Xufa: exist, Request: existRequest, Reply: existReply };

function checkDecoratorList(that, kind, decorators, name) {
  assert(Array.isArray(decorators), 'The decorators should be an array of strings');
  const withName = typeof name === 'string' ? ` required by '${name}'` : '';
  for (const decorator of decorators) {
    if (!checks[kind].call(that, decorator)) {
      throw new XUFA_ERR_PLUGIN_NOT_PRESENT_IN_INSTANCE(decorator, withName, kind);
    }
  }
}

function checkDecorators(fn) {
  const meta = getMeta(fn);
  if (!meta || !meta.decorators) return;
  const { decorators, name } = meta;
  // Plugins written for fastify name the instance decorators "fastify".
  const instance = decorators.xufa || decorators.fastify;
  if (instance) checkDecoratorList(this, 'Xufa', instance, name);
  if (decorators.reply) checkDecoratorList(this, 'Reply', decorators.reply, name);
  if (decorators.request) checkDecoratorList(this, 'Request', decorators.request, name);
}

// The range of xufa versions a plugin declares (meta.xufa). Ranges of fastify versions are not checked.
function checkVersion(fn) {
  const meta = getMeta(fn);
  if (!meta || meta.xufa == null) return;
  const required = meta.xufa;
  const isPrerelease = PRERELEASE.test(this.version);
  // While a release candidate is tested, plugins of the previous versions load.
  if (isPrerelease && semver.gt(this.version, semver.coerce(required))) return;
  if (!semver.satisfies(this.version, required, { includePrerelease: isPrerelease })) {
    throw new XUFA_ERR_PLUGIN_VERSION_MISMATCH(meta.name, required, this.version);
  }
}

function registerPluginName(fn) {
  const meta = getMeta(fn);
  if (!meta || !meta.name) return undefined;
  this[kRegisteredPlugins].push(meta.name);
  return meta.name;
}

function checkPluginHealthiness(fn, name) {
  if (fn.constructor.name === 'AsyncFunction' && fn.length === 3) throw new XUFA_ERR_PLUGIN_INVALID_ASYNC_HANDLER(name);
}

// Returns whether the plugin runs in the instance registering it (not encapsulated).
function registerPlugin(fn) {
  const name = registerPluginName.call(this, fn) || getPluginName(fn);
  checkPluginHealthiness.call(this, fn, name);
  checkVersion.call(this, fn);
  checkDecorators.call(this, fn);
  checkDependencies.call(this, fn);
  return shouldSkipOverride(fn);
}

module.exports = { getPluginName, getFuncPreview, kRegisteredPlugins, getDisplayName, registerPlugin };
module.exports[kTestInternals] = { shouldSkipOverride, getMeta, checkDecorators, checkDependencies };
