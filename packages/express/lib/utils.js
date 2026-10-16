// Express's utilities (its lib/utils.js): the methods, the ETag generators, and the functions of the settings 'etag',
// 'query parser' and 'trust proxy'; normalizeType of res.format().
import { METHODS } from 'node:http';
import { compile as compileProxies } from '@xufa/http/lib/proxy-addr';
import { parse as parseSimple } from '@xufa/http/lib/querystring';
import { entityTag, setCharset } from './headers.js';
import { lookup } from './mime.js';
import { parseQuery } from './query.js';

export { setCharset };

export const methods = METHODS.map((method) => method.toLowerCase());

// Generators of ETags that take a string as it is (res.send gives them strings without making a Buffer).
export const kHashesStrings = Symbol('xufa.express.hashesStrings');

function generator(weak) {
  // (The tag of the last string kept: a route that sends the same text again is not hashed again.)
  let lastBody = null;
  let lastTag = null;
  const generate = (body, encoding) => {
    if (typeof body === 'string' && (encoding === 'utf8' || encoding === undefined)) {
      if (body === lastBody) return lastTag;
      lastTag = entityTag(body, weak);
      lastBody = body;
      return lastTag;
    }
    return entityTag(
      !Buffer.isBuffer(body) && encoding !== 'utf8' && encoding !== undefined ? Buffer.from(body, encoding) : body,
      weak
    );
  };
  generate[kHashesStrings] = true;
  return generate;
}

export const etag = generator(false);
export const wetag = generator(true);

// The media type of a key of res.format(): a type with its parameters (and q), or the type of an extension.
function acceptParams(text) {
  const { length } = text;
  const semicolon = text.indexOf(';');
  let index = semicolon === -1 ? length : semicolon;
  const result = { value: text.slice(0, index).trim(), quality: 1, params: {} };
  while (index < length) {
    const equals = text.indexOf('=', index);
    if (equals === -1) break;
    const next = text.indexOf(';', index);
    const end = next === -1 ? length : next;
    if (equals > end) {
      index = text.lastIndexOf(';', equals - 1) + 1;
      continue;
    }
    const key = text.slice(index, equals).trim();
    const value = text.slice(equals + 1, end).trim();
    if (key === 'q') result.quality = parseFloat(value);
    else result.params[key] = value;
    index = end + 1;
  }
  return result;
}

export const normalizeType = (type) =>
  type.indexOf('/') !== -1 ? acceptParams(type) : { value: lookup(type) || 'application/octet-stream', params: {} };

export const normalizeTypes = (types) => types.map(normalizeType);

export function compileETag(value) {
  if (typeof value === 'function') return value;
  if (value === true || value === 'weak') return wetag;
  if (value === false) return undefined;
  if (value === 'strong') return etag;
  throw new TypeError(`unknown value for etag function: ${value}`);
}

// 'extended': nested keys (qs), Object.prototype's keys allowed.
const parseExtended = (text) => parseQuery(text);

export function compileQueryParser(value) {
  if (typeof value === 'function') return value;
  if (value === true || value === 'simple') return parseSimple;
  if (value === false) return undefined;
  if (value === 'extended') return parseExtended;
  throw new TypeError(`unknown value for query parser function: ${value}`);
}

// 'trust proxy': true, a number of hops, addresses and ranges (a list, or text separated by commas), a function.
export function compileTrust(value) {
  if (typeof value === 'function') return value;
  if (value === true) return () => true;
  if (typeof value === 'number') return (address, i) => i < value;
  const list = typeof value === 'string' ? value.split(',').map((item) => item.trim()) : value;
  return compileProxies(list || []);
}
