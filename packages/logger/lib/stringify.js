// JSON text of the values of a log line.

// Characters that need escaping in a JSON string, and lone surrogates (JSON.stringify writes them as \u escapes).
// eslint-disable-next-line no-control-regex
const NEEDS_ESCAPE = /[\u0000-\u001f"\\\ud800-\udfff]/;

// Short strings are checked a character at a time, cheaper than the regular expression; longer ones by it.
function asString(str) {
  const length = str.length;
  if (length < 64) {
    for (let i = 0; i < length; i += 1) {
      const code = str.charCodeAt(i);
      if (code < 32 || code === 34 || code === 92 || (code >= 0xd800 && code <= 0xdfff)) return JSON.stringify(str);
    }
    return `"${str}"`;
  }
  if (length < 2048 && !NEEDS_ESCAPE.test(str)) return `"${str}"`;
  return JSON.stringify(str);
}

// JSON.stringify that writes "[Circular]" for references to an ancestor and BigInt as numbers in strings.
// `parent` is the object holding the value, a reference to it is circular too.
function safeStringify(value, parent) {
  if (parent !== undefined && value === parent) return '"[Circular]"';
  const ancestors = [];
  return JSON.stringify(value, function replacer(key, val) {
    if (typeof val === 'bigint') return val.toString();
    if (typeof val !== 'object' || val === null) return val;
    if (val === parent) return '[Circular]';
    while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) ancestors.pop();
    if (ancestors.includes(val)) return '[Circular]';
    ancestors.push(val);
    return val;
  });
}

// JSON of any value, undefined when it has none (functions, symbols, undefined).
function stringify(value, parent) {
  switch (typeof value) {
    case 'string':
      return asString(value);
    case 'number':
      return Number.isFinite(value) ? `${value}` : 'null';
    case 'boolean':
      return value ? 'true' : 'false';
    case 'bigint':
      return `${value}`;
    case 'object':
      if (value === null) return 'null';
      try {
        return JSON.stringify(value);
      } catch {
        return safeStringify(value, parent);
      }
    default:
      return undefined;
  }
}

// A key is quoted as any string.
const asKey = asString;

export { asString, asKey, stringify, safeStringify };
