// What Express reads and writes of headers: media types (Content-Type, type-is), freshness (ETag, Last-Modified),
// ranges, Vary, Content-Disposition, cookies (and their signatures), urls in Location, and sizes and times written
// as text ('100kb', '1d'). Each as the package Express used for it answers (named in each part).
import crypto from 'node:crypto';
import { lookup } from './mime.js';

// --- Media types ----------------------------------------------------------------------------------------------------

const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const TYPE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const TEXT = /^[\u000b\u0020-\u007e\u0080-\u00ff]+$/; // eslint-disable-line no-control-regex
const PARAMETER =
  /; *([!#$%&'*+.^_`|~0-9A-Za-z-]+) *= *("(?:[\u000b\u0020\u0021\u0023-\u005b\u005d-\u007e\u0080-\u00ff]|\\[\u000b\u0020-\u00ff])*"|[!#$%&'*+.^_`|~0-9A-Za-z-]+) */g; // eslint-disable-line no-control-regex
const QUOTED_ESCAPE = /\\([\u000b\u0020-\u00ff])/g; // eslint-disable-line no-control-regex

// A Content-Type, strictly (content-type 1): { type, parameters }; a type that is not one throws.
export function parseContentType(header) {
  if (!header || typeof header !== 'string') throw new TypeError('argument string is required');
  let index = header.indexOf(';');
  const type = (index === -1 ? header : header.slice(0, index)).trim();
  if (!TYPE.test(type)) throw new TypeError('invalid media type');
  const parameters = Object.create(null);
  if (index !== -1) {
    PARAMETER.lastIndex = index;
    let match;
    while ((match = PARAMETER.exec(header))) {
      if (match.index !== index) throw new TypeError('invalid parameter format');
      index += match[0].length;
      let value = match[2];
      if (value.charCodeAt(0) === 0x22) {
        value = value.slice(1, -1);
        if (value.indexOf('\\') !== -1) value = value.replace(QUOTED_ESCAPE, '$1');
      }
      parameters[match[1].toLowerCase()] = value;
    }
    if (index !== header.length) throw new TypeError('invalid parameter format');
  }
  return { type: type.toLowerCase(), parameters };
}

// A media type written: its parameters in order of their names, quoted when they are not tokens.
export function formatContentType({ type, parameters }) {
  if (!type || !TYPE.test(type)) throw new TypeError('invalid type');
  let text = type;
  if (parameters && typeof parameters === 'object') {
    Object.keys(parameters)
      .sort()
      .forEach((name) => {
        if (!TOKEN.test(name)) throw new TypeError('invalid parameter name');
        const value = String(parameters[name]);
        if (TOKEN.test(value)) text += `; ${name}=${value}`;
        else if (value.length > 0 && !TEXT.test(value)) throw new TypeError('invalid parameter value');
        else text += `; ${name}="${value.replace(/([\\"])/g, '\\$1')}"`;
      });
  }
  return text;
}

const SIMPLE_TYPE = /^[a-z0-9!#$%&'*+.^_`|~-]+\/[a-z0-9!#$%&'*+.^_`|~-]+$/;
let lastType = null;
let lastCharset = null;
let lastSet = null;

// A Content-Type with a charset (Express's setCharset); the answer to the same question as the last one is kept.
export function setCharset(type, charset) {
  if (!type || !charset) return type;
  if (type === lastType && charset === lastCharset) return lastSet;
  let set;
  const at = type.indexOf(';');
  const base = at === -1 ? type : type.slice(0, at);
  if (SIMPLE_TYPE.test(base) && (at === -1 || type.slice(at) === `; charset=${charset}`)) {
    set = `${base}; charset=${charset}`;
  } else {
    const parsed = parseContentType(type);
    parsed.parameters.charset = charset;
    set = formatContentType(parsed);
  }
  lastType = type;
  lastCharset = charset;
  lastSet = set;
  return set;
}

// A value of a header of media types (Accept, Content-Type), leniently (content-type 2): from start to the next ';'
// (or ',' with comma), with its parameters; { type, index (where it ended), parameters }.
export function parseMedia(header, comma = false, start = 0) {
  const stop = comma ? 44 : 65536;
  const length = header.length;
  let index = skipSpaces(header, start, length);
  const valueStart = index;
  index = skipValue(header, index, length, stop);
  const type = header.slice(valueStart, trimEnd(header, valueStart, index)).toLowerCase();
  const parameters = Object.create(null);
  parameter: while (index < length) {
    if (header.charCodeAt(index) === stop) break;
    index = skipSpaces(header, index + 1, length);
    const keyStart = index;
    while (index < length) {
      const code = header.charCodeAt(index);
      if (code === stop) break parameter;
      if (code === 59) continue parameter;
      if (code === 61) {
        const key = header.slice(keyStart, trimEnd(header, keyStart, index)).toLowerCase();
        index = skipSpaces(header, index + 1, length);
        if (index < length && header.charCodeAt(index) === 34) {
          index += 1;
          let value = '';
          while (index < length) {
            const char = header.charCodeAt(index++);
            if (char === 34) {
              index = skipValue(header, index, length, stop);
              if (parameters[key] === undefined) parameters[key] = value;
              break;
            }
            if (char === 92 && index < length) {
              value += header[index++];
              continue;
            }
            value += String.fromCharCode(char);
          }
          continue parameter;
        }
        const valueAt = index;
        index = skipValue(header, index, length, stop);
        if (parameters[key] === undefined) parameters[key] = header.slice(valueAt, trimEnd(header, valueAt, index));
        continue parameter;
      }
      index += 1;
    }
  }
  return { type, index, parameters };
}

function skipValue(text, index, length, stop) {
  let at = index;
  while (at < length) {
    const code = text.charCodeAt(at);
    if (code === 59 || code === stop) break;
    at += 1;
  }
  return at;
}

function skipSpaces(text, index, length) {
  let at = index;
  while (at < length && (text.charCodeAt(at) === 32 || text.charCodeAt(at) === 9)) at += 1;
  return at;
}

function trimEnd(text, start, end) {
  let at = end;
  while (at > start && (text.charCodeAt(at - 1) === 32 || text.charCodeAt(at - 1) === 9)) at -= 1;
  return at;
}

// The type of a Content-Type without its parameters (type-is), or null when it is not a media type.
const MEDIA_TYPE = /^ *[A-Za-z0-9][A-Za-z0-9!#$&^_-]{0,126}\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126} *$/;

function typeOfHeader(value) {
  if (!value) return null;
  const at = value.indexOf(';');
  const type = (at === -1 ? value : value.slice(0, at)).trim().toLowerCase();
  return MEDIA_TYPE.test(type) ? type : null;
}

// A type as type-is reads it: 'urlencoded', 'multipart', '+json' (any type of that suffix), an extension ('json').
function normalizeType(type) {
  if (typeof type !== 'string') return false;
  if (type === 'urlencoded') return 'application/x-www-form-urlencoded';
  if (type === 'multipart') return 'multipart/*';
  if (type[0] === '+') return `*/*${type}`;
  return type.indexOf('/') === -1 ? lookup(type) : type;
}

function typeMatches(expected, actual) {
  if (expected === false) return false;
  const actualParts = actual.split('/');
  const expectedParts = expected.split('/');
  if (actualParts.length !== 2 || expectedParts.length !== 2) return false;
  if (expectedParts[0] !== '*' && expectedParts[0] !== actualParts[0]) return false;
  if (expectedParts[1].slice(0, 2) === '*+') {
    return (
      expectedParts[1].length <= actualParts[1].length + 1 &&
      expectedParts[1].slice(1) === actualParts[1].slice(1 - expectedParts[1].length)
    );
  }
  return expectedParts[1] === '*' || expectedParts[1] === actualParts[1];
}

// type-is: the first of the types a Content-Type is (the type itself for wildcards and suffixes), false without one.
export function typeIs(value, types) {
  const type = typeOfHeader(value);
  if (!type) return false;
  if (!types || types.length === 0) return type;
  for (const candidate of types) {
    if (typeMatches(normalizeType(candidate), type)) {
      return candidate[0] === '+' || candidate.indexOf('*') !== -1 ? type : candidate;
    }
  }
  return false;
}

// Whether a request has a body: Transfer-Encoding, or a Content-Length that is a number.
export const hasBody = (req) =>
  req.headers['transfer-encoding'] !== undefined || !Number.isNaN(Number(req.headers['content-length'] ?? NaN));

// --- Freshness (fresh, etag) ----------------------------------------------------------------------------------------

export { parseHttpDate, fresh, entityTag } from '@xufa/http/lib/fresh';

// The weak ETag of a file, of its size and time of change.
export const statTag = (stat) => `W/"${stat.size.toString(16)}-${stat.mtime.getTime().toString(16)}"`;

// --- Ranges (range-parser) ------------------------------------------------------------------------------------------

const DIGITS = /^\d+$/;

// The ranges of a Range header for a size: [{ start, end }] with type, -1 when none can be met, -2 when it is not
// one. combine: ranges that overlap or touch as one.
export function parseRange(size, header, options) {
  if (typeof header !== 'string') throw new TypeError('argument str must be a string');
  const index = header.indexOf('=');
  if (index === -1) return -2;
  const ranges = [];
  ranges.type = header.slice(0, index);
  for (const part of header.slice(index + 1).split(',')) {
    const dash = part.indexOf('-');
    if (dash === -1) return -2;
    const startText = part.slice(0, dash).trim();
    const endText = part.slice(dash + 1).trim();
    let start = DIGITS.test(startText) ? Number(startText) : NaN;
    let end = DIGITS.test(endText) ? Number(endText) : NaN;
    if (startText.length === 0) {
      start = size - end;
      end = size - 1;
    } else if (endText.length === 0) end = size - 1;
    if (end > size - 1) end = size - 1;
    if (Number.isNaN(start) || Number.isNaN(end)) return -2;
    if (!(start > end || start < 0)) ranges.push({ start, end });
  }
  if (ranges.length < 1) return -1;
  return options && options.combine ? combineRanges(ranges) : ranges;
}

function combineRanges(ranges) {
  const ordered = ranges.map((range, index) => ({ ...range, index })).sort((a, b) => a.start - b.start);
  let j = 0;
  for (let i = 1; i < ordered.length; i += 1) {
    const range = ordered[i];
    const current = ordered[j];
    if (range.start > current.end + 1) {
      j += 1;
      ordered[j] = range;
    } else if (range.end > current.end) {
      current.end = range.end;
      current.index = Math.min(current.index, range.index);
    }
  }
  ordered.length = j + 1;
  const combined = ordered.sort((a, b) => a.index - b.index).map(({ start, end }) => ({ start, end }));
  combined.type = ranges.type;
  return combined;
}

// --- Vary ---------------------------------------------------------------------------------------------------------

export { appendVary, vary } from '@xufa/http/lib/vary';

// --- Urls and HTML --------------------------------------------------------------------------------------------------

const UNSAFE_URL = /(?:[^\x21\x23-\x3B\x3D\x3F-\x5F\x61-\x7A\x7C\x7E]|%(?:[^0-9A-Fa-f]|[0-9A-Fa-f][^0-9A-Fa-f]|$))+/g;
const LONE_SURROGATE = /(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]|[\uD800-\uDBFF]([^\uDC00-\uDFFF]|$)/g;

// A url with what is not allowed in one percent-encoded (encodeurl: what is encoded already is left).
// (A url with nothing to encode, the most of them, is given back as it is.)
const NEEDS_ENCODING = /[^\x21\x23-\x3B\x3D\x3F-\x5F\x61-\x7A\x7C\x7E]|%(?![0-9A-Fa-f]{2})/;
export function encodeUrl(url) {
  const text = String(url);
  if (!NEEDS_ENCODING.test(text)) return text;
  return text.replace(LONE_SURROGATE, '$1\uFFFD$2').replace(UNSAFE_URL, encodeURI);
}

const HTML_ESCAPES = { '"': '&quot;', '&': '&amp;', "'": '&#39;', '<': '&lt;', '>': '&gt;' };

const HTML_SPECIAL = /["&'<>]/;

export function escapeHtml(value) {
  const text = String(value);
  return HTML_SPECIAL.test(text) ? text.replace(/["&'<>]/g, (char) => HTML_ESCAPES[char]) : text;
}

// A small HTML page (send's and serve-static's answers).
export const htmlDocument = (title, body) =>
  `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>${title}</title>\n</head>\n<body>\n<pre>${body}</pre>\n</body>\n</html>\n`;

// --- Content-Disposition --------------------------------------------------------------------------------------------

const NON_LATIN1 = /[^\x20-\x7e\xa0-\xff]/g;
const LATIN1_TEXT = /^[\x20-\x7e\x80-\xff]+$/;
const URL_ATTR_UNSAFE = /[\x00-\x20"'()*,/:;<=>?@[\\\]{}\x7f]/g; // eslint-disable-line no-control-regex
const HEX_ESCAPE = /%[0-9A-Fa-f]{2}/;

function basename(path) {
  const normalized = path.replaceAll('\\', '/');
  let end = normalized.length;
  while (end > 0 && normalized[end - 1] === '/') end -= 1;
  if (end === 0) return '';
  return normalized.slice(normalized.lastIndexOf('/', end - 1) + 1, end);
}

// A Content-Disposition (content-disposition): attachment, the file's name (of a path) quoted when it is latin-1,
// filename* (UTF-8) otherwise, with a latin-1 fallback.
export function contentDisposition(filename, options = {}) {
  const type = options.type || 'attachment';
  if (!TOKEN.test(type)) throw new TypeError('invalid type');
  let text = type.toLowerCase();
  if (filename === undefined) return text;
  if (typeof filename !== 'string') throw new TypeError('filename must be a string');
  const fallback = options.fallback === undefined ? true : options.fallback;
  if (typeof fallback !== 'string' && typeof fallback !== 'boolean') {
    throw new TypeError('fallback must be a string or boolean');
  }
  if (typeof fallback === 'string' && /[^\x20-\x7e\xa0-\xff]/.test(fallback)) {
    throw new TypeError('fallback must be ISO-8859-1 string');
  }
  const name = basename(filename);
  const quotable = LATIN1_TEXT.test(name);
  const fallbackName = typeof fallback !== 'string' ? fallback && name.replace(NON_LATIN1, '?') : basename(fallback);
  const hasFallback = typeof fallbackName === 'string' && fallbackName !== name;
  if (quotable || hasFallback)
    text += `; filename="${(hasFallback ? fallbackName : name).replace(/([\\"])/g, '\\$1')}"`;
  if (hasFallback || !quotable || HEX_ESCAPE.test(name)) {
    const encoded = encodeURIComponent(name).replace(
      URL_ATTR_UNSAFE,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    );
    // (filename* after filename: the order of their names, as content-disposition writes them.)
    text += `; filename*=UTF-8''${encoded}`;
  }
  return text;
}

// --- Cookies (cookie, cookie-signature) -----------------------------------------------------------------------------

const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const COOKIE_VALUE = /^("?)[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*\1$/;
const COOKIE_DOMAIN = /^([.]?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
const COOKIE_PATH = /^[\x20-\x3A\x3D-\x7E]*$/;
const SAME_SITE = { true: 'Strict', lax: 'Lax', strict: 'Strict', none: 'None' };
const PRIORITY = { low: 'Low', medium: 'Medium', high: 'High' };

// A Set-Cookie of a name, a value and its options (maxAge in seconds, domain, path, expires, httpOnly, secure,
// partitioned, priority, sameSite).
export function serializeCookie(name, value, options = {}) {
  const encode = options.encode || encodeURIComponent;
  if (typeof encode !== 'function') throw new TypeError('option encode is invalid');
  if (!COOKIE_NAME.test(name)) throw new TypeError('argument name is invalid');
  const encoded = encode(value);
  if (!COOKIE_VALUE.test(encoded)) throw new TypeError('argument val is invalid');
  let text = `${name}=${encoded}`;
  if (options.maxAge != null) {
    const maxAge = Math.floor(options.maxAge);
    if (!Number.isFinite(maxAge)) throw new TypeError('option maxAge is invalid');
    text += `; Max-Age=${maxAge}`;
  }
  if (options.domain) {
    if (!COOKIE_DOMAIN.test(options.domain)) throw new TypeError('option domain is invalid');
    text += `; Domain=${options.domain}`;
  }
  if (options.path) {
    if (!COOKIE_PATH.test(options.path)) throw new TypeError('option path is invalid');
    text += `; Path=${options.path}`;
  }
  if (options.expires) {
    const { expires } = options;
    if (Object.prototype.toString.call(expires) !== '[object Date]' || Number.isNaN(expires.valueOf())) {
      throw new TypeError('option expires is invalid');
    }
    text += `; Expires=${expires.toUTCString()}`;
  }
  if (options.httpOnly) text += '; HttpOnly';
  if (options.secure) text += '; Secure';
  if (options.partitioned) text += '; Partitioned';
  if (options.priority) {
    const priority = PRIORITY[typeof options.priority === 'string' ? options.priority.toLowerCase() : options.priority];
    if (!priority) throw new TypeError('option priority is invalid');
    text += `; Priority=${priority}`;
  }
  if (options.sameSite) {
    const sameSite =
      SAME_SITE[typeof options.sameSite === 'string' ? options.sameSite.toLowerCase() : options.sameSite];
    if (!sameSite) throw new TypeError('option sameSite is invalid');
    text += `; SameSite=${sameSite}`;
  }
  return text;
}

// A value signed with a secret (HMAC-SHA256, base64 without its padding): <value>.<signature>.
export function signCookie(value, secret) {
  if (typeof value !== 'string') throw new TypeError('Cookie value must be provided as a string.');
  if (secret == null) throw new TypeError('Secret key must be provided.');
  return `${value}.${crypto.createHmac('sha256', secret).update(value).digest('base64').replace(/=+$/, '')}`;
}

// --- Sizes and times written as text (bytes, ms) --------------------------------------------------------------------

const UNITS = { b: 1, kb: 1 << 10, mb: 1 << 20, gb: 1 << 30, tb: 1024 ** 4, pb: 1024 ** 5 };
const BYTES = /^((-|\+)?(\d+(?:\.\d+)?)) *(kb|mb|gb|tb|pb)$/i;

// A size: a number, or '100kb', '1mb'... (a number of bytes without a unit); null when it is not one.
export function parseBytes(value) {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value !== 'string') return null;
  const match = BYTES.exec(value);
  const number = match ? parseFloat(match[1]) : parseInt(value, 10);
  if (Number.isNaN(number)) return null;
  return Math.floor(UNITS[match ? match[4].toLowerCase() : 'b'] * number);
}

const DURATION =
  /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i;
const MS = { y: 31557600000, w: 604800000, d: 86400000, h: 3600000, m: 60000, s: 1000 };

// A time as text ('1d', '2 hours', '500ms') in milliseconds; NaN when it is not one.
export function parseMs(text) {
  if (text.length > 100) return NaN;
  const match = DURATION.exec(text);
  if (!match) return NaN;
  const number = parseFloat(match[1]);
  const unit = (match[2] || 'ms').toLowerCase();
  if (unit.startsWith('ms') || unit.startsWith('msec') || unit.startsWith('milli')) return number;
  if (unit.startsWith('y')) return number * MS.y;
  if (unit.startsWith('w')) return number * MS.w;
  if (unit.startsWith('d')) return number * MS.d;
  if (unit.startsWith('h')) return number * MS.h;
  if (unit.startsWith('m')) return number * MS.m;
  return number * MS.s;
}
