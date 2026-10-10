// Checks of the options of inject(), with the messages of light-my-request (which come from ajv).
import { METHODS } from 'node:http';

const methods = new Set([...METHODS, 'QUERY'].flatMap((m) => [m, m.toLowerCase()]));

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function urlErrors(value) {
  if (typeof value === 'string') return [];
  if (isObject(value) && typeof value.pathname === 'string') return [];
  return ['must be string', 'must be object', 'must match exactly one schema in oneOf'];
}

// The messages of the first problems found, or an empty array when the options are valid.
function validateOptions(options) {
  if (!isObject(options)) return ['must be object'];
  const hasUrl = options.url !== undefined;
  const hasPath = options.path !== undefined;
  if (!hasUrl && !hasPath) {
    return [
      "must have required property 'url'",
      "must have required property 'path'",
      'must match exactly one schema in oneOf',
    ];
  }
  if (hasUrl && urlErrors(options.url).length) return urlErrors(options.url);
  if (hasPath && urlErrors(options.path).length) return urlErrors(options.path);
  for (const key of ['cookies', 'headers']) {
    if (options[key] !== undefined && !isObject(options[key])) return ['must be object'];
  }
  if (options.query !== undefined && !isObject(options.query) && typeof options.query !== 'string') {
    return ['must be object', 'must be string', 'must match a schema in anyOf'];
  }
  if (options.simulate !== undefined) {
    if (!isObject(options.simulate)) return ['must be object'];
    for (const key of ['end', 'split', 'error', 'close']) {
      if (options.simulate[key] !== undefined && typeof options.simulate[key] !== 'boolean') return ['must be boolean'];
    }
  }
  for (const key of ['authority', 'remoteAddress']) {
    if (options[key] !== undefined && typeof options[key] !== 'string') return ['must be string'];
  }
  if (options.method !== undefined) {
    if (typeof options.method !== 'string') return ['must be string'];
    if (!methods.has(options.method)) return ['must be equal to one of the allowed values'];
  }
  if (options.validate !== undefined && typeof options.validate !== 'boolean') return ['must be boolean'];
  return [];
}

export { validateOptions };
