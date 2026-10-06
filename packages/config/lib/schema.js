'use strict';

// Schemas: the keys of a configuration, nested as it is; a key whose `type` is a text is one value:
//
//   { server: { port: { type: 'port', default: 3000, env: 'PORT' } },
//     database: { url: { type: 'url', env: 'DATABASE_URL', required: true, sensitive: true } } }
//
// type: string, number, integer, boolean, port, url, duration (ms), array, object, any. Options: default, required,
// nullable, env (the variable that sets it), values (the ones allowed), pattern (of strings), min, max (of numbers, or
// of the length of strings and arrays), items (the type of the items of an array), sensitive (redacted when shown),
// doc. Texts (as the variables of the environment are) become the type: '8080' a port, 'true' or 'off' a boolean,
// '1h30m' a duration, '["a"]' or 'a,b' an array, '{"a":1}' an object.
const { ConfigError } = require('./errors');

const TYPES = ['string', 'number', 'integer', 'boolean', 'port', 'url', 'duration', 'array', 'object', 'any'];
const TRUE = ['true', '1', 'yes', 'on'];
const FALSE = ['false', '0', 'no', 'off'];
const UNITS = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };

const isSpec = (node) =>
  node !== null && typeof node === 'object' && !Array.isArray(node) && typeof node.type === 'string';
const isPlain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// The leaves of a schema: [{ path: ['a', 'b'], spec }]; a spec of a type that is not one is an error.
function leaves(schema, prefix = [], out = []) {
  for (const [key, node] of Object.entries(schema)) {
    const path = [...prefix, key];
    if (isSpec(node)) {
      if (!TYPES.includes(node.type)) {
        throw new ConfigError(`The schema of ${path.join('.')}: '${node.type}' is not a type (${TYPES.join(', ')})`);
      }
      out.push({ path, spec: node });
    } else if (isPlain(node)) leaves(node, path, out);
    else throw new ConfigError(`The schema of ${path.join('.')} is an object: a key ({ type, ... }) or keys`);
  }
  return out;
}

function duration(text) {
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  const parts = text.match(/^(?:\s*\d+(?:\.\d+)?\s*(?:ms|s|m|h|d|w))+\s*$/);
  if (!parts) return undefined;
  let total = 0;
  for (const [, amount, unit] of text.matchAll(/(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)/g))
    total += Number(amount) * UNITS[unit];
  return total;
}

// A value as its type (texts converted): { value } or { error }.
function coerce(value, type, items) {
  const fail = (what) => ({ error: `${JSON.stringify(value)} is not ${what}` });
  switch (type) {
    case 'any':
      return { value };
    case 'string':
      if (typeof value === 'string') return { value };
      if (typeof value === 'number' || typeof value === 'boolean') return { value: String(value) };
      return fail('a string');
    case 'number':
    case 'integer':
    case 'port': {
      let number = value;
      if (typeof value === 'string' && value.trim() !== '') number = Number(value);
      if (typeof number !== 'number' || !Number.isFinite(number))
        return fail(`a${type === 'integer' ? 'n integer' : type === 'port' ? ' port' : ' number'}`);
      if (type !== 'number' && !Number.isInteger(number)) return fail(type === 'port' ? 'a port' : 'an integer');
      if (type === 'port' && (number < 0 || number > 65535)) return fail('a port (0-65535)');
      return { value: number };
    }
    case 'boolean':
      if (typeof value === 'boolean') return { value };
      if (typeof value === 'string') {
        const text = value.trim().toLowerCase();
        if (TRUE.includes(text)) return { value: true };
        if (FALSE.includes(text)) return { value: false };
      }
      if (value === 1 || value === 0) return { value: value === 1 };
      return fail('a boolean');
    case 'url':
      if (typeof value !== 'string') return fail('a URL');
      try {
        new URL(value); // eslint-disable-line no-new
        return { value };
      } catch {
        return fail('a URL');
      }
    case 'duration': {
      if (typeof value === 'number' && value >= 0) return { value };
      const ms = typeof value === 'string' ? duration(value.trim()) : undefined;
      return ms === undefined ? fail("a duration (as '30s' or 1500)") : { value: ms };
    }
    case 'array': {
      let list = value;
      if (typeof value === 'string') {
        const text = value.trim();
        if (text.startsWith('[')) {
          try {
            list = JSON.parse(text);
          } catch {
            return fail('an array');
          }
        } else list = text === '' ? [] : text.split(',').map((part) => part.trim());
      }
      if (!Array.isArray(list)) return fail('an array');
      if (!items) return { value: list };
      const out = [];
      for (let i = 0; i < list.length; i += 1) {
        const item = coerce(list[i], items);
        if (item.error) return { error: `item ${i}: ${item.error}` };
        out.push(item.value);
      }
      return { value: out };
    }
    case 'object': {
      let object = value;
      if (typeof value === 'string') {
        try {
          object = JSON.parse(value);
        } catch {
          return fail('an object');
        }
      }
      return isPlain(object) ? { value: object } : fail('an object');
    }
    default:
      return fail(type);
  }
}

// Checks a value of a key against its spec (after coercion): an error message, or null.
function check(value, spec) {
  if (spec.values && !spec.values.some((allowed) => allowed === value)) {
    return `${JSON.stringify(value)} is not one of ${spec.values.map((v) => JSON.stringify(v)).join(', ')}`;
  }
  if (spec.pattern && typeof value === 'string') {
    const pattern = spec.pattern instanceof RegExp ? spec.pattern : new RegExp(spec.pattern);
    if (!pattern.test(value)) return `${JSON.stringify(value)} does not match ${pattern}`;
  }
  const size =
    typeof value === 'number' ? value : typeof value === 'string' || Array.isArray(value) ? value.length : null;
  const what = typeof value === 'number' ? '' : ' long';
  if (size !== null && spec.min !== undefined && size < spec.min)
    return `${JSON.stringify(value)} is less than ${spec.min}${what}`;
  if (size !== null && spec.max !== undefined && size > spec.max)
    return `${JSON.stringify(value)} is more than ${spec.max}${what}`;
  return null;
}

module.exports = { leaves, coerce, check, isSpec, isPlain, TYPES };
