// Express's parsers of bodies (body-parser 2): express.json(), raw(), text() and urlencoded(). Each reads the body of
// a request of its type (type: a type, a list or a function of the request), inflated (gzip, deflate, br) unless
// inflate is false, up to limit ('100kb'), in its charset; verify(req, res, body, encoding) may refuse it. Their
// errors are errors of HTTP with a type, as body-parser's: entity.too.large (413), entity.parse.failed (400),
// entity.verify.failed (403), charset.unsupported and encoding.unsupported (415), request.aborted,
// request.size.invalid, parameters.too.many (413)...
import { AsyncResource } from 'node:async_hooks';
import zlib from 'node:zlib';
import { createError } from './errors.js';
import { charsetExists, decode, decoderOf } from './charset.js';
import { hasBody, parseBytes, parseMedia, typeIs } from './headers.js';
import { finished, isFinished } from './finished.js';
import { parseQuery } from './query.js';

function charsetOf(req) {
  const header = req.headers['content-type'];
  if (!header) return undefined;
  return parseMedia(header).parameters.charset?.toLowerCase();
}

function normalizeOptions(options, defaultType) {
  const inflate = options?.inflate !== false;
  const limit = options?.limit === undefined || options?.limit === null ? 102400 : parseBytes(options.limit);
  const type = options?.type || defaultType;
  const verify = options?.verify || false;
  const defaultCharset = options?.defaultCharset || 'utf-8';
  if (limit === null) throw new TypeError(`option limit "${String(options.limit)}" is invalid`);
  if (verify !== false && typeof verify !== 'function') throw new TypeError('option verify must be function');
  const types = Array.isArray(type) ? type : [type];
  const shouldParse = typeof type === 'function' ? type : (req) => Boolean(typeIs(req.headers['content-type'], types));
  return { inflate, limit, verify, defaultCharset, shouldParse };
}

const unsupportedCharset = (charset) =>
  createError(415, `unsupported charset "${charset.toUpperCase()}"`, {
    charset: charset.toLowerCase(),
    type: 'charset.unsupported',
  });

// The stream of the body: the request, or its inflation.
function contentStream(req, inflate) {
  const encoding = (req.headers['content-encoding'] || 'identity').toLowerCase();
  if (inflate === false && encoding !== 'identity') {
    throw createError(415, 'content encoding unsupported', { encoding, type: 'encoding.unsupported' });
  }
  if (encoding === 'identity') return { stream: req, length: req.headers['content-length'] };
  let stream;
  if (encoding === 'deflate') stream = zlib.createInflate();
  else if (encoding === 'gzip') stream = zlib.createGunzip();
  else if (encoding === 'br') stream = zlib.createBrotliDecompress();
  else {
    throw createError(415, `unsupported content encoding "${encoding}"`, { encoding, type: 'encoding.unsupported' });
  }
  req.pipe(stream);
  return { stream, length: undefined };
}

// The bytes of a stream (or its text, in a charset), up to a limit, of the length announced (raw-body).
function readStream(stream, encoding, length, limit, onRead) {
  // (The callback in the async context of the reading: AsyncLocalStorage's store kept.)
  const resource = new AsyncResource('readStream');
  const callback = (error, body) => resource.runInAsyncScope(onRead, null, error, body);
  let complete = false;
  let sync = true;
  let cleanup = () => {};
  const done = (error, body) => {
    complete = true;
    const invoke = () => {
      cleanup();
      if (error) {
        stream.unpipe();
        if (typeof stream.pause === 'function') stream.pause();
      }
      callback(error, body);
    };
    if (sync) process.nextTick(invoke);
    else invoke();
  };
  if (limit !== null && length !== null && length > limit) {
    done(createError(413, 'request entity too large', { expected: length, length, limit, type: 'entity.too.large' }));
    return;
  }
  const state = stream._readableState;
  if (stream._decoder || (state && (state.encoding || state.decoder))) {
    done(createError(500, 'stream encoding should not be set', { type: 'stream.encoding.set' }));
    return;
  }
  if (typeof stream.readable !== 'undefined' && !stream.readable) {
    done(createError(500, 'stream is not readable', { type: 'stream.not.readable' }));
    return;
  }
  // (utf-8 is read as bytes and made text at the end: faster than decoding each chunk.)
  const utf8 = encoding === 'utf-8' || encoding === 'utf8';
  const decoder = encoding && !utf8 ? decoderOf(encoding) : null;
  let received = 0;
  let text = '';
  const chunks = [];
  const onAborted = () => {
    if (complete) return;
    done(
      createError(400, 'request aborted', {
        code: 'ECONNABORTED',
        expected: length,
        length,
        received,
        type: 'request.aborted',
      })
    );
  };
  const onData = (chunk) => {
    if (complete) return;
    received += chunk.length;
    if (limit !== null && received > limit) {
      done(createError(413, 'request entity too large', { limit, received, type: 'entity.too.large' }));
    } else if (decoder) text += decoder.write(chunk);
    else chunks.push(chunk);
  };
  const onEnd = (error) => {
    if (complete) return;
    if (error) {
      done(error);
      return;
    }
    if (length !== null && received !== length) {
      done(
        createError(400, 'request size did not match content length', {
          expected: length,
          length,
          received,
          type: 'request.size.invalid',
        })
      );
      return;
    }
    if (decoder) {
      done(null, text + (decoder.end() || ''));
      return;
    }
    const bytes = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
    if (!utf8) {
      done(null, bytes);
      return;
    }
    const body = bytes.toString('utf8');
    done(null, body.charCodeAt(0) === 0xfeff ? body.slice(1) : body);
  };
  cleanup = () => {
    stream.removeListener('aborted', onAborted);
    stream.removeListener('data', onData);
    stream.removeListener('end', onEnd);
    stream.removeListener('error', onEnd);
    stream.removeListener('close', cleanup);
  };
  stream.on('aborted', onAborted);
  stream.on('close', cleanup);
  stream.on('data', onData);
  stream.on('end', onEnd);
  stream.on('error', onEnd);
  sync = false;
}

// A request's body read off whole, then callback().
function dump(req, callback) {
  if (isFinished(req)) callback(null);
  else {
    finished(req, callback);
    req.resume();
  }
}

// The reading of a body: req.body set by parse(text or bytes, charset), or next(error).
function read(req, res, next, parse, options) {
  if (isFinished(req)) {
    next();
    return;
  }
  if (!('body' in req)) req.body = undefined;
  if (!hasBody(req) || !options.shouldParse(req)) {
    next();
    return;
  }
  let encoding = null;
  if (options.skipCharset !== true) {
    encoding = charsetOf(req) || options.defaultCharset;
    if (options.isValidCharset && !options.isValidCharset(encoding)) {
      next(
        createError(415, `unsupported charset "${encoding.toUpperCase()}"`, {
          charset: encoding,
          type: 'charset.unsupported',
        })
      );
      return;
    }
  }
  let stream;
  let length;
  try {
    ({ stream, length } = contentStream(req, options.inflate));
  } catch (error) {
    next(error);
    return;
  }
  const { verify } = options;
  const readEncoding = verify ? null : encoding;
  if (encoding !== null && !charsetExists(encoding)) {
    // (Refused before reading with verify; otherwise once the body is read off, as raw-body refuses it.)
    if (readEncoding === null) next(unsupportedCharset(encoding));
    else {
      if (stream !== req) {
        req.unpipe();
        stream.destroy();
      }
      dump(req, () => next(unsupportedCharset(encoding)));
    }
    return;
  }
  const expected = length != null && !Number.isNaN(Number(length)) ? parseInt(length, 10) : null;
  readStream(stream, readEncoding, Number.isNaN(expected) ? null : expected, options.limit, (error, body) => {
    if (error) {
      const failure = createError(400, error);
      if (stream !== req) {
        req.unpipe();
        stream.destroy();
      }
      dump(req, () => next(createError(400, failure)));
      return;
    }
    if (verify) {
      try {
        verify(req, res, body, encoding);
      } catch (refusal) {
        next(createError(403, refusal, { body, type: refusal.type || 'entity.verify.failed' }));
        return;
      }
    }
    let text = body;
    try {
      text = typeof body !== 'string' && encoding !== null ? decode(body, encoding) : body;
      req.body = parse(text, encoding);
    } catch (failure) {
      next(createError(400, failure, { body: text, type: failure.type || 'entity.parse.failed' }));
      return;
    }
    next();
  });
}

// --- json ---

const FIRST_CHAR = /^[\x20\x09\x0a\x0d]*([^\x20\x09\x0a\x0d])/; // eslint-disable-line no-control-regex

// A SyntaxError of JSON with only its message and stack (V8's own properties dropped).
function syntaxError(error, message, stack) {
  Object.getOwnPropertyNames(error).forEach((key) => {
    if (key !== 'stack' && key !== 'message') delete error[key];
  });
  error.stack = stack.replace(error.message, message);
  error.message = message;
  return error;
}

// The error of a strict body that is not an object or an array: JSON.parse's message at its first character.
function strictError(text, char) {
  const index = text.indexOf(char);
  const partial = index !== -1 ? text.substring(0, index) + '#'.repeat(text.length - index) : '';
  try {
    JSON.parse(partial);
    throw new SyntaxError('strict violation');
  } catch (error) {
    const message = error.message.replace(/#+/g, (placeholder) => text.substring(index, index + placeholder.length));
    return syntaxError(error, message, error.stack);
  }
}

export function json(options) {
  const normalized = normalizeOptions(options, 'application/json');
  const reviver = options?.reviver;
  const strict = options?.strict !== false;
  const parse = (body) => {
    if (body.length === 0) return {};
    if (strict) {
      const first = FIRST_CHAR.exec(body);
      const char = first ? first[1] : undefined;
      if (char !== '{' && char !== '[') throw strictError(body, char);
    }
    try {
      return JSON.parse(body, reviver);
    } catch (error) {
      throw syntaxError(error, error.message, error.stack);
    }
  };
  const readOptions = { ...normalized, isValidCharset: (charset) => charset.slice(0, 4) === 'utf-' };
  return function jsonParser(req, res, next) {
    read(req, res, next, parse, readOptions);
  };
}

// --- raw and text ---

const passthrough = (value) => value;

export function raw(options) {
  const readOptions = { ...normalizeOptions(options, 'application/octet-stream'), skipCharset: true };
  return function rawParser(req, res, next) {
    read(req, res, next, passthrough, readOptions);
  };
}

export function text(options) {
  const readOptions = normalizeOptions(options, 'text/plain');
  return function textParser(req, res, next) {
    read(req, res, next, passthrough, readOptions);
  };
}

// --- urlencoded ---

// The number of pairs of a body, or undefined beyond the limit.
function parameterCount(body, limit) {
  let count = 0;
  let index = -1;
  do {
    count += 1;
    if (count > limit) return undefined;
    index = body.indexOf('&', index + 1);
  } while (index !== -1);
  return count;
}

export function urlencoded(options) {
  const normalized = normalizeOptions(options, 'application/x-www-form-urlencoded');
  if (normalized.defaultCharset !== 'utf-8' && normalized.defaultCharset !== 'iso-8859-1') {
    throw new TypeError('option defaultCharset must be either utf-8 or iso-8859-1');
  }
  const extended = Boolean(options?.extended);
  let parameterLimit = options?.parameterLimit !== undefined ? options.parameterLimit : 1000;
  const depth = extended ? (options?.depth !== undefined ? options.depth : 32) : 0;
  if (Number.isNaN(Number(parameterLimit)) || parameterLimit < 1) {
    throw new TypeError('option parameterLimit must be a positive number');
  }
  if (Number.isNaN(Number(depth)) || depth < 0) {
    throw new TypeError('option depth must be a zero or a positive number');
  }
  if (Number.isFinite(parameterLimit)) parameterLimit |= 0;
  const parse = (body, encoding) => {
    if (!body.length) return {};
    const count = parameterCount(body, parameterLimit);
    if (count === undefined) throw createError(413, 'too many parameters', { type: 'parameters.too.many' });
    try {
      return parseQuery(body, {
        arrayLimit: extended ? Math.max(100, count) : count,
        depth,
        charsetSentinel: options?.charsetSentinel,
        interpretNumericEntities: options?.interpretNumericEntities,
        charset: encoding,
        parameterLimit,
        strictDepth: true,
      });
    } catch (error) {
      if (error instanceof RangeError) {
        throw createError(400, 'The input exceeded the depth', { type: 'querystring.parse.rangeError' });
      }
      throw error;
    }
  };
  const readOptions = {
    ...normalized,
    isValidCharset: (charset) => charset === 'utf-8' || charset === 'iso-8859-1',
  };
  return function urlencodedParser(req, res, next) {
    read(req, res, next, parse, readOptions);
  };
}
