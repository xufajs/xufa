// Query strings and urlencoded bodies with nested keys (qs, as Express uses it: 'extended'): a[b]=1&a[c][]=2 ->
// { a: { b: '1', c: ['2'] } }. Indexes under arrayLimit make arrays (compacted: a[1]=x is ['x']), larger ones
// objects; a key given twice gathers its values in an array; keys deeper than depth stay as text (or throw a
// RangeError with strictDepth). Keys of Object.prototype are allowed (Express parses with allowPrototypes).

const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

// Objects made of arrays longer than arrayLimit, with their largest index.
const overflows = new WeakMap();

const markOverflow = (object, max) => {
  overflows.set(object, max);
  return object;
};

const arrayToObject = (array) => {
  const object = {};
  array.forEach((value, i) => {
    if (value !== undefined) object[i] = value;
  });
  return object;
};

function combine(a, b, arrayLimit) {
  if (overflows.has(a)) {
    let index = overflows.get(a);
    (Array.isArray(b) ? b : [b]).forEach((value) => {
      index += 1;
      a[index] = value;
    });
    overflows.set(a, index);
    return a;
  }
  const result = [].concat(a, b);
  return result.length > arrayLimit ? markOverflow(arrayToObject(result), result.length - 1) : result;
}

function setProperty(object, key, value) {
  if (key === '__proto__')
    Object.defineProperty(object, key, { configurable: true, enumerable: true, value, writable: true });
  else object[key] = value;
}

function merge(target, source, options) {
  if (!source) return target;
  if (typeof source !== 'object' && typeof source !== 'function') {
    if (Array.isArray(target)) {
      const next = target.length;
      if (next >= options.arrayLimit) return markOverflow(arrayToObject(target.concat(source)), next);
      target[next] = source;
    } else if (target && typeof target === 'object') {
      if (overflows.has(target)) {
        const index = overflows.get(target) + 1;
        target[index] = source;
        overflows.set(target, index);
      } else return [target, source];
    } else return [target, source];
    return target;
  }
  if (!target || typeof target !== 'object') {
    if (overflows.has(source)) {
      const result = { 0: target };
      Object.keys(source).forEach((key) => {
        result[parseInt(key, 10) + 1] = source[key];
      });
      return markOverflow(result, overflows.get(source) + 1);
    }
    const combined = [target].concat(source);
    return combined.length > options.arrayLimit ? markOverflow(arrayToObject(combined), combined.length - 1) : combined;
  }
  let mergeTarget = target;
  if (Array.isArray(target) && !Array.isArray(source)) mergeTarget = arrayToObject(target);
  if (Array.isArray(target) && Array.isArray(source)) {
    source.forEach((item, i) => {
      if (has(target, i)) {
        const targetItem = target[i];
        if (targetItem && typeof targetItem === 'object' && item && typeof item === 'object') {
          target[i] = merge(targetItem, item, options);
        } else target[target.length] = item;
      } else target[i] = item;
    });
    return target.length > options.arrayLimit ? markOverflow(arrayToObject(target), target.length - 1) : target;
  }
  return Object.keys(source).reduce((acc, key) => {
    const value = source[key];
    setProperty(acc, key, has(acc, key) ? merge(acc[key], value, options) : value);
    if (overflows.has(source) && !overflows.has(acc)) markOverflow(acc, overflows.get(source));
    if (overflows.has(acc)) {
      const index = parseInt(key, 10);
      if (String(index) === key && index >= 0 && index > overflows.get(acc)) overflows.set(acc, index);
    }
    return acc;
  }, mergeTarget);
}

// Arrays without their holes, all the way down.
function compact(value) {
  const queue = [{ obj: { o: value }, prop: 'o' }];
  const seen = new Set();
  for (let i = 0; i < queue.length; i += 1) {
    const { obj, prop } = queue[i];
    const object = obj[prop];
    Object.keys(object).forEach((key) => {
      const item = object[key];
      if (typeof item === 'object' && item !== null && !seen.has(item)) {
        queue.push({ obj: object, prop: key });
        seen.add(item);
      }
    });
  }
  while (queue.length > 1) {
    const { obj, prop } = queue.pop();
    const item = obj[prop];
    if (Array.isArray(item)) obj[prop] = item.filter((element) => element !== undefined);
  }
  return value;
}

function decode(text, charset) {
  const spaced = text.replace(/\+/g, ' ');
  if (charset === 'iso-8859-1') return spaced.replace(/%[0-9a-f]{2}/gi, unescape);
  try {
    return decodeURIComponent(spaced);
  } catch {
    return spaced;
  }
}

const ISO_SENTINEL = 'utf8=%26%2310003%3B';
const UTF8_SENTINEL = 'utf8=%E2%9C%93';

// The pairs of a string: { key: value or [values] } (keys still with their brackets).
function parseValues(text, options) {
  const values = { __proto__: null };
  const clean = text.replace(/%5B/gi, '[').replace(/%5D/gi, ']');
  const limit = options.parameterLimit === Infinity ? undefined : options.parameterLimit;
  const parts = clean.split('&', limit);
  let skip = -1;
  let { charset } = options;
  if (options.charsetSentinel) {
    const at = parts.findIndex((part) => part.indexOf('utf8=') === 0);
    if (at !== -1) {
      if (parts[at] === UTF8_SENTINEL) charset = 'utf-8';
      else if (parts[at] === ISO_SENTINEL) charset = 'iso-8859-1';
      skip = at;
    }
  }
  parts.forEach((part, i) => {
    if (i === skip) return;
    const bracketEquals = part.indexOf(']=');
    const pos = bracketEquals === -1 ? part.indexOf('=') : bracketEquals + 1;
    let key;
    let value;
    if (pos === -1) {
      key = decode(part, charset);
      value = '';
    } else {
      key = decode(part.slice(0, pos), charset);
      value = decode(part.slice(pos + 1), charset);
    }
    if (value && options.interpretNumericEntities && charset === 'iso-8859-1') {
      value = String(value).replace(/&#(\d+);/g, (all, code) => String.fromCharCode(parseInt(code, 10)));
    }
    if (has(values, key)) values[key] = combine(values[key], value, options.arrayLimit);
    else values[key] = value;
  });
  return values;
}

// The segments of a key: 'a[b][c]' -> ['a', '[b]', '[c]'] (to depth; the rest one segment, or a RangeError).
function segmentsOf(key, options) {
  if (options.depth <= 0) return [key];
  const segments = [];
  const first = key.indexOf('[');
  const parent = first >= 0 ? key.slice(0, first) : key;
  if (parent) segments.push(parent);
  let open = first;
  let collected = 0;
  while (open >= 0 && collected < options.depth) {
    let level = 1;
    let i = open + 1;
    let close = -1;
    while (i < key.length && close < 0) {
      const code = key.charCodeAt(i);
      if (code === 0x5b) level += 1;
      else if (code === 0x5d) {
        level -= 1;
        if (level === 0) close = i;
      }
      i += 1;
    }
    if (close < 0) {
      segments.push(`[${key.slice(open)}]`);
      return segments;
    }
    segments.push(key.slice(open, close + 1));
    collected += 1;
    open = key.indexOf('[', close + 1);
  }
  if (open >= 0) {
    if (options.strictDepth) {
      throw new RangeError(`Input depth exceeded depth option of ${options.depth} and strictDepth is true`);
    }
    segments.push(`[${key.slice(open)}]`);
  }
  return segments;
}

// The object of a key's segments holding the value.
function objectOf(chain, value, options) {
  let leaf = value;
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const root = chain[i];
    let object;
    if (root === '[]') {
      object = overflows.has(leaf) ? leaf : combine([], leaf, options.arrayLimit);
    } else {
      object = {};
      const clean = root.charAt(0) === '[' && root.charAt(root.length - 1) === ']' ? root.slice(1, -1) : root;
      const index = parseInt(clean, 10);
      const isIndex = !Number.isNaN(index) && root !== clean && String(index) === clean && index >= 0;
      if (isIndex && index < options.arrayLimit) {
        object = [];
        object[index] = leaf;
      } else if (isIndex) {
        object[index] = leaf;
        markOverflow(object, index);
      } else if (clean !== '__proto__') object[clean] = leaf;
    }
    leaf = object;
  }
  return leaf;
}

const DEFAULTS = {
  arrayLimit: 20,
  charset: 'utf-8',
  charsetSentinel: false,
  depth: 5,
  interpretNumericEntities: false,
  parameterLimit: 1000,
  strictDepth: false,
};

// parse(text, { arrayLimit, charset, charsetSentinel, depth, interpretNumericEntities, parameterLimit, strictDepth }).
export function parseQuery(text, given) {
  const options = { ...DEFAULTS };
  if (given) {
    Object.keys(given).forEach((key) => {
      if (given[key] !== undefined) options[key] = given[key];
    });
  }
  if (options.depth === false) options.depth = 0;
  if (text === '' || text === null || text === undefined) return {};
  const values = parseValues(text, options);
  let result = {};
  Object.keys(values).forEach((key) => {
    if (!key) return;
    result = merge(result, objectOf(segmentsOf(key, options), values[key], options), options);
  });
  return compact(result);
}
