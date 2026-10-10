// Splitting the path from the query string, and decoding the path.
//
// The path is decoded with decodeURI, which keeps the reserved characters (# $ & + , / : ; = ? @) encoded, so that an
// encoded slash never splits a parameter. Parameters holding one of them are decoded afterwards on their own. An
// encoded % (%25) is encoded once more before decodeURI, so that it is never decoded twice.

// For the two hex digits after a %, the reserved character they decode to, or 0.
const RESERVED = new Uint8Array(768);
for (const [hex, char] of [
  ['23', '#'],
  ['24', '$'],
  ['25', '%'],
  ['26', '&'],
  ['2B', '+'],
  ['2b', '+'],
  ['2C', ','],
  ['2c', ','],
  ['2F', '/'],
  ['2f', '/'],
  ['3A', ':'],
  ['3a', ':'],
  ['3B', ';'],
  ['3b', ';'],
  ['3D', '='],
  ['3d', '='],
  ['3F', '?'],
  ['3f', '?'],
  ['40', '@'],
]) {
  RESERVED[((hex.charCodeAt(0) - 50) << 8) | hex.charCodeAt(1)] = char.charCodeAt(0);
}

function reservedCharCode(high, low) {
  if (high < 50 || high > 52 || low > 255) return 0;
  return RESERVED[((high - 50) << 8) | low];
}

// Result of splitURL(), reused: read its fields before calling it again.
const split = { path: '', querystring: '', decodeParams: false };

// Splits the request target at ?, # (and ; when asked) and decodes the path. Null when the path is malformed.
function splitURL(url, semicolon) {
  const len = url.length;
  let i = 1;
  for (; i < len; i += 1) {
    const code = url.charCodeAt(i);
    if (code === 63 || code === 35 || (code === 59 && semicolon)) {
      split.path = url.slice(0, i);
      split.querystring = url.slice(i + 1);
      split.decodeParams = false;
      return split;
    }
    if (code === 37) return splitEncoded(url, semicolon, i);
  }
  split.path = url;
  split.querystring = '';
  split.decodeParams = false;
  return split;
}

function splitEncoded(url, semicolon, start) {
  let path = url;
  let querystring = '';
  let decode = false;
  let decodeParams = false;
  for (let i = start; i < path.length; i += 1) {
    const code = path.charCodeAt(i);
    if (code === 37) {
      const reserved = reservedCharCode(path.charCodeAt(i + 1), path.charCodeAt(i + 2));
      if (reserved === 0) {
        decode = true;
      } else {
        decodeParams = true;
        if (reserved === 37) {
          decode = true;
          path = `${path.slice(0, i + 1)}25${path.slice(i + 1)}`;
          i += 2;
        }
        i += 2;
      }
    } else if (code === 63 || code === 35 || (code === 59 && semicolon)) {
      querystring = path.slice(i + 1);
      path = path.slice(0, i);
      break;
    }
  }
  if (decode) {
    try {
      split.path = decodeURI(path);
    } catch {
      return null;
    }
  } else {
    split.path = path;
  }
  split.querystring = querystring;
  split.decodeParams = decodeParams;
  return split;
}

// Decodes the reserved characters left encoded in a parameter.
function decodeParam(param) {
  const first = param.indexOf('%');
  if (first === -1) return param;
  let out = param.slice(0, first);
  let last = first;
  for (let i = first; i < param.length; i += 1) {
    if (param.charCodeAt(i) === 37) {
      const code = reservedCharCode(param.charCodeAt(i + 1), param.charCodeAt(i + 2));
      if (code !== 0) {
        out += param.slice(last, i) + String.fromCharCode(code);
        last = i + 3;
        i += 2;
      }
    }
  }
  return out + param.slice(last);
}

function safeDecodeURI(url, semicolon) {
  const result = splitURL(url, semicolon);
  if (result === null) throw new URIError('URI malformed');
  return { path: result.path, querystring: result.querystring, shouldDecodeParam: result.decodeParams };
}

// The path of an absolute-form request target (http://host/path?q), or null when it is not a valid one.
function pathFromAbsoluteURL(url) {
  const schemeEnd = url.indexOf('://');
  if (schemeEnd === -1) return url;
  const scheme = url.slice(0, schemeEnd).toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return url;
  const authorityStart = schemeEnd + 3;
  let authorityEnd = url.length;
  const pathStart = url.indexOf('/', authorityStart);
  if (pathStart !== -1) authorityEnd = pathStart;
  const queryStart = url.indexOf('?', authorityStart);
  if (queryStart !== -1 && queryStart < authorityEnd) authorityEnd = queryStart;
  if (url.indexOf('#', authorityStart) !== -1 || authorityEnd === authorityStart) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${scheme}:` || parsed.host.length === 0) return null;
  } catch {
    return null;
  }
  if (authorityEnd === url.length) return '/';
  if (authorityEnd === queryStart) return `/${url.slice(queryStart)}`;
  return url.slice(pathStart);
}

const DUPLICATE_SLASHES = /\/\/+/g;

function removeDuplicateSlashes(path) {
  return path.indexOf('//') !== -1 ? path.replace(DUPLICATE_SLASHES, '/') : path;
}

function trimLastSlash(path) {
  return path.length > 1 && path.charCodeAt(path.length - 1) === 47 ? path.slice(0, -1) : path;
}

export {
  splitURL,
  splitEncoded,
  decodeParam,
  safeDecodeURI,
  decodeParam as safeDecodeURIComponent,
  pathFromAbsoluteURL,
  removeDuplicateSlashes,
  trimLastSlash,
};
