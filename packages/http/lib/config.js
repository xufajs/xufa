// The options of an instance: defaults, and initialConfig, the frozen copy of the options that can be read back
// (only the known ones, coerced to their types, secrets like the https certificates hidden).
import { XUFA_ERR_INIT_OPTS_INVALID } from './errors.js';

const defaultInitOptions = {
  connectionTimeout: 0,
  keepAliveTimeout: 72000,
  maxRequestsPerSocket: 0,
  requestTimeout: 0,
  handlerTimeout: 0,
  bodyLimit: 1048576,
  onProtoPoisoning: 'error',
  onConstructorPoisoning: 'error',
  pluginTimeout: 10000,
  requestIdHeader: false,
  http2SessionTimeout: 72000,
  exposeHeadRoutes: true,
  allowErrorHandlerOverride: false,
  routerOptions: {
    allowUnsafeRegex: false,
    caseSensitive: true,
    ignoreTrailingSlash: false,
    ignoreDuplicateSlashes: false,
    maxParamLength: 100,
    useSemicolonDelimiter: false,
  },
};

class InvalidOption extends Error {}

// Coercions of ajv's coerceTypes, as the validation of fastify's options does them.
function toInteger(value, nullable) {
  if (value === null) {
    if (nullable) return null;
    return 0;
  }
  let number = value;
  if (typeof value === 'boolean') number = value ? 1 : 0;
  else if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) number = Number(value);
  if (typeof number !== 'number' || !Number.isInteger(number)) throw new InvalidOption('must be integer');
  return number;
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1) return true;
  if (value === 'false' || value === 0 || value === null) return false;
  throw new InvalidOption('must be boolean');
}

function toString(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return '';
  throw new InvalidOption('must be string');
}

const INTEGERS = [
  'connectionTimeout',
  'keepAliveTimeout',
  'maxRequestsPerSocket',
  'requestTimeout',
  'handlerTimeout',
  'bodyLimit',
  'pluginTimeout',
  'http2SessionTimeout',
];
const BOOLEANS = ['http2', 'ignoreTrailingSlash', 'ignoreDuplicateSlashes', 'exposeHeadRoutes'];
const STRINGS = ['onProtoPoisoning', 'onConstructorPoisoning'];
const ROUTER_BOOLEANS = [
  'allowUnsafeRegex',
  'caseSensitive',
  'ignoreTrailingSlash',
  'ignoreDuplicateSlashes',
  'useSemicolonDelimiter',
];

function buildConfig(options) {
  const config = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(options, key) && options[key] !== undefined;
  for (const key of INTEGERS) {
    config[key] = has(key) ? toInteger(options[key], key === 'maxRequestsPerSocket') : defaultInitOptions[key];
  }
  for (const key of BOOLEANS) {
    if (has(key)) config[key] = toBoolean(options[key]);
    else if (key === 'exposeHeadRoutes') config[key] = defaultInitOptions[key];
  }
  for (const key of STRINGS) config[key] = has(key) ? toString(options[key]) : defaultInitOptions[key];
  if (has('forceCloseConnections')) {
    const value = options.forceCloseConnections;
    if (!(typeof value === 'boolean' || (typeof value === 'string' && /idle/u.test(value)))) {
      throw new InvalidOption('must match exactly one schema in oneOf');
    }
    config.forceCloseConnections = value;
  }
  if (has('https')) {
    const { https } = options;
    // Certificates and keys are not exposed: only that https is on, and allowHTTP1.
    if (typeof https === 'boolean' || https === null) config.https = https;
    else if (typeof https === 'object' && typeof https.allowHTTP1 === 'boolean')
      config.https = { allowHTTP1: https.allowHTTP1 };
    else config.https = true;
  }
  if (has('requestIdHeader')) {
    const value = options.requestIdHeader;
    if (typeof value !== 'boolean' && typeof value !== 'string') throw new InvalidOption('must be boolean');
    config.requestIdHeader = value;
  } else {
    config.requestIdHeader = defaultInitOptions.requestIdHeader;
  }
  config.http2SessionTimeout = has('http2SessionTimeout')
    ? toInteger(options.http2SessionTimeout)
    : defaultInitOptions.http2SessionTimeout;

  const router = options.routerOptions || {};
  if (typeof router !== 'object') throw new InvalidOption('must be object');
  const routerConfig = {};
  for (const key of ROUTER_BOOLEANS) {
    routerConfig[key] = router[key] === undefined ? defaultInitOptions.routerOptions[key] : toBoolean(router[key]);
  }
  routerConfig.maxParamLength =
    router.maxParamLength === undefined
      ? defaultInitOptions.routerOptions.maxParamLength
      : toInteger(router.maxParamLength);
  if (router.constraints !== undefined && (router.constraints === null || typeof router.constraints !== 'object')) {
    throw new InvalidOption('must be object');
  }
  routerConfig.constraints = router.constraints;
  config.routerOptions = {
    allowUnsafeRegex: routerConfig.allowUnsafeRegex,
    caseSensitive: routerConfig.caseSensitive,
    constraints: routerConfig.constraints,
    ignoreTrailingSlash: routerConfig.ignoreTrailingSlash,
    ignoreDuplicateSlashes: routerConfig.ignoreDuplicateSlashes,
    maxParamLength: routerConfig.maxParamLength,
    useSemicolonDelimiter: routerConfig.useSemicolonDelimiter,
  };
  return config;
}

function deepFreeze(object) {
  for (const name of Object.getOwnPropertyNames(object)) {
    const value = object[name];
    if (value && typeof value === 'object' && !(ArrayBuffer.isView(value) && !(value instanceof DataView))) {
      deepFreeze(value);
    }
  }
  return Object.freeze(object);
}

// The read-only initialConfig of the options; throws XUFA_ERR_INIT_OPTS_INVALID for values of a wrong type.
function getSecuredInitialConfig(options) {
  let config;
  try {
    config = buildConfig(options);
  } catch (err) {
    if (!(err instanceof InvalidOption)) throw err;
    const error = new XUFA_ERR_INIT_OPTS_INVALID(JSON.stringify([err.message]));
    error.errors = [{ message: err.message }];
    throw error;
  }
  // Everything is frozen but the constraint strategies, which are objects of the user.
  for (const key of Object.keys(config)) {
    const value = config[key];
    if (key !== 'routerOptions' && value && typeof value === 'object') deepFreeze(value);
  }
  Object.freeze(config.routerOptions);
  return Object.freeze(config);
}

export default getSecuredInitialConfig;
getSecuredInitialConfig.getSecuredInitialConfig = getSecuredInitialConfig;
getSecuredInitialConfig.defaultInitOptions = defaultInitOptions;
getSecuredInitialConfig.deepFreeze = deepFreeze;
getSecuredInitialConfig.utils = { deepFreezeObject: deepFreeze };
const __utils = getSecuredInitialConfig.utils;

export { getSecuredInitialConfig, defaultInitOptions, deepFreeze, __utils as utils };

// What require() gives (the tests of fastify are CommonJS).
export { getSecuredInitialConfig as 'module.exports' };
