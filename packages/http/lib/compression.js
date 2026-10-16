// compression's API (1.8.2), xufa's own implementation: a middleware of node:http (Express, connect, @xufa/express)
// that compresses answers with brotli, gzip or deflate as the request accepts (Accept-Encoding, brotli and gzip
// preferred when the q are equal), when their type is compressible (mime-db, or text/* and +json/+text/+xml), they are
// not under the threshold (1kb), not encoded already, not HEAD, and Cache-Control has no no-transform. res.flush()
// sends what is compressed so far (server-sent events). The stream of zlib is let go when the response closes.
//
//   app.use(compression({ threshold: 256 }));
import zlib from 'node:zlib';
import { COMPRESSIBLE } from './mime-db.js';
import { vary } from './vary.js';

const NO_TRANSFORM = /(?:^|,)\s*?no-transform\s*?(?:,|$)/i;
const SUPPORTED_ENCODINGS = ['br', 'gzip', 'deflate', 'identity'];
const PREFERRED_ENCODINGS = ['br', 'gzip'];
const ENFORCEABLE = ['gzip', 'deflate', 'identity', 'br'];

// bytes.parse: a number, or a text of a size ('1kb', '1.5mb', '100'); null when it is none.
const UNITS = { b: 1, kb: 1 << 10, mb: 1 << 20, gb: 1 << 30, tb: 1024 ** 4, pb: 1024 ** 5 };
const SIZE = /^((-|\+)?(\d+(?:\.\d+)?)) *(kb|mb|gb|tb|pb)$/i;
function parseBytes(value) {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value !== 'string') return null;
  const match = SIZE.exec(value);
  const amount = match ? parseFloat(match[1]) : parseInt(value, 10);
  if (Number.isNaN(amount)) return null;
  return Math.floor(UNITS[match ? match[4].toLowerCase() : 'b'] * amount);
}

const MEDIA_TYPE = /^\s*([^;\s]*)(?:;|\s|$)/;
const COMPRESSIBLE_NAME = /^text\/|\+(?:json|text|xml)$/i;

/** Whether a Content-Type is compressible: mime-db's word, or by its name; undefined when unknown. */
function compressible(type) {
  if (!type || typeof type !== 'string') return false;
  const match = MEDIA_TYPE.exec(type);
  const mime = match && match[1].toLowerCase();
  const known = COMPRESSIBLE[mime];
  if (known !== undefined) return known;
  return COMPRESSIBLE_NAME.test(mime) || undefined;
}

// The encodings of an Accept-Encoding: { encoding, q, i } (identity added with the lowest q when not named).
const ENCODING = /^\s*([^\s;]+)\s*(?:;(.*))?$/;
function parseAcceptEncoding(header) {
  const parts = header.split(',');
  const accepted = [];
  let hasIdentity = false;
  let minQuality = 1;
  for (let i = 0; i < parts.length; i++) {
    const match = ENCODING.exec(parts[i].trim());
    if (!match) continue;
    let q = 1;
    if (match[2]) {
      for (const param of match[2].split(';')) {
        const [name, value] = param.trim().split('=');
        if (name === 'q') {
          q = parseFloat(value);
          break;
        }
      }
    }
    const entry = { encoding: match[1], q, i };
    accepted.push(entry);
    hasIdentity ||= specify('identity', entry) !== null;
    minQuality = Math.min(minQuality, q || 1);
  }
  if (!hasIdentity) accepted.push({ encoding: 'identity', q: minQuality, i: parts.length });
  return accepted;
}

function specify(encoding, spec, index) {
  let s = 0;
  if (spec.encoding.toLowerCase() === encoding.toLowerCase()) s |= 1;
  else if (spec.encoding !== '*') return null;
  return { encoding, i: index, o: spec.i, q: spec.q, s };
}

/** negotiator's encoding(): the encoding offered the request prefers (by q, then `preferred`), or undefined. */
function negotiateEncoding(header, offered, preferred) {
  const accepted = parseAcceptEncoding(header || '');
  const priorities = offered.map((encoding, index) => {
    let priority = { encoding, o: -1, q: 0, s: 0 };
    for (const spec of accepted) {
      const match = specify(encoding, spec, index);
      if (match && (priority.s - match.s || priority.q - match.q || priority.o - match.o) < 0) priority = match;
    }
    return priority;
  });
  const compare = (a, b) => {
    if (a.q !== b.q) return b.q - a.q;
    const aPreferred = preferred.indexOf(a.encoding);
    const bPreferred = preferred.indexOf(b.encoding);
    if (aPreferred === -1 && bPreferred === -1) return b.s - a.s || a.o - b.o || a.i - b.i;
    if (aPreferred !== -1 && bPreferred !== -1) return aPreferred - bPreferred;
    return aPreferred === -1 ? 1 : -1;
  };
  const best = priorities.filter((priority) => priority.q > 0).sort(compare)[0];
  return best && offered[priorities.indexOf(best)];
}

// The answers of the filter by Content-Type, up to 100 of them: an app sends the same few types again and again.
const compressibleTypes = new Map();

/** The default filter: a Content-Type that is compressible. */
function shouldCompress(req, res) {
  const type = res.getHeader('Content-Type');
  if (type === undefined) return false;
  let answer = compressibleTypes.get(type);
  if (answer === undefined) {
    answer = !!compressible(type);
    if (typeof type === 'string') {
      if (compressibleTypes.size >= 100) compressibleTypes.clear();
      compressibleTypes.set(type, answer);
    }
  }
  return answer;
}

/** Whether a Cache-Control has no-transform (the answer is then sent as it is). */
const noTransform = (cacheControl) => !!cacheControl && NO_TRANSFORM.test(cacheControl);

const shouldTransform = (req, res) => !noTransform(res.getHeader('Cache-Control'));

/** The encoding the middleware uses for an Accept-Encoding ('br', 'gzip' or 'deflate'), or null for none. */
function acceptedEncoding(header, enforceEncoding = 'identity') {
  let method = negotiateEncoding(header, SUPPORTED_ENCODINGS, PREFERRED_ENCODINGS);
  if (!header && ENFORCEABLE.includes(enforceEncoding)) method = enforceEncoding;
  return method && method !== 'identity' ? method : null;
}

const chunkLength = (chunk, encoding) => {
  if (!chunk) return 0;
  return Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding);
};

const toBuffer = (chunk, encoding) => (Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));

const headersSent = (res) => (typeof res.headersSent !== 'boolean' ? Boolean(res._header) : res.headersSent);

// on-headers: the listener runs once, right before the headers of the response are written (writeHead, its headers
// given as an object or arrays set first, so that the listener sees them).
function onHeaders(res, listener) {
  const writeHead = res.writeHead;
  let fired = false;
  res.writeHead = function (_statusCode) {
    const args = setWriteHeadHeaders.apply(this, arguments);
    if (!fired) {
      fired = true;
      listener.call(this);
      if (typeof args[0] === 'number' && this.statusCode !== args[0]) {
        args[0] = this.statusCode;
        args.length = 1;
      }
    }
    return writeHead.apply(this, args);
  };
}

function setWriteHeadHeaders(statusCode) {
  const { length } = arguments;
  const headerIndex = length > 1 && typeof arguments[1] === 'string' ? 2 : 1;
  const headers = length >= headerIndex + 1 ? arguments[headerIndex] : undefined;
  this.statusCode = statusCode;
  if (Array.isArray(headers)) {
    if (headers.length && Array.isArray(headers[0])) {
      for (const [name, value] of headers) if (name) this.setHeader(name, value);
    } else {
      if (headers.length % 2 !== 0) throw new TypeError('headers array is malformed');
      // Repeated names: appended (Set-Cookie twice is two of them).
      for (let i = 0; i < headers.length; i += 2) this.removeHeader(headers[i]);
      for (let i = 0; i < headers.length; i += 2) if (headers[i]) this.appendHeader(headers[i], headers[i + 1]);
    }
  } else if (headers) {
    for (const name of Object.keys(headers)) if (name) this.setHeader(name, headers[name]);
  }
  const args = new Array(Math.min(length, headerIndex));
  for (let i = 0; i < args.length; i++) args[i] = arguments[i];
  return args;
}

/**
 * The middleware: options { filter(req, res), threshold (bytes or '1kb'; 1kb by default), enforceEncoding (for
 * requests without Accept-Encoding: 'identity' by default), brotli (options of zlib's brotli; quality 4 by default),
 * and zlib's options for gzip and deflate (level, memLevel, chunkSize, windowBits, strategy...) }.
 */
function compression(options) {
  const opts = options || {};
  const brotliOptions = { ...opts.brotli };
  brotliOptions.params = { [zlib.constants.BROTLI_PARAM_QUALITY]: 4, ...brotliOptions.params };
  const filter = opts.filter || shouldCompress;
  let threshold = parseBytes(opts.threshold);
  if (threshold == null) threshold = 1024;
  const enforceEncoding = opts.enforceEncoding || 'identity';

  return function compression(req, res, next) {
    let ended = false;
    let length;
    let listeners = [];
    let stream;
    let closed = false;
    const end = res.end;
    const on = res.on;
    const write = res.write;

    res.flush = function flush() {
      if (stream) stream.flush();
    };

    res.write = function (chunk, encoding) {
      if (ended) return false;
      if (!headersSent(res)) this.writeHead(this.statusCode);
      return stream ? stream.write(toBuffer(chunk, encoding)) : write.call(this, chunk, encoding);
    };

    res.end = function (chunk, encoding) {
      if (ended) return false;
      if (!headersSent(res)) {
        // The length, when the whole body is given here.
        if (!this.getHeader('Content-Length')) length = chunkLength(chunk, encoding);
        this.writeHead(this.statusCode);
      }
      if (!stream) return end.call(this, chunk, encoding);
      ended = true;
      return chunk ? stream.end(toBuffer(chunk, encoding)) : stream.end();
    };

    // 'drain' listeners go to the stream when there is one (kept until it is known).
    res.on = function (type, listener) {
      if (!listeners || type !== 'drain') return on.call(this, type, listener);
      if (stream) return stream.on(type, listener);
      listeners.push([type, listener]);
      return this;
    };

    const nocompress = () => {
      for (const [type, listener] of listeners) on.call(res, type, listener);
      listeners = null;
    };

    // The stream of zlib let go when the response closes (a client gone before the end too).
    on.call(res, 'close', () => {
      closed = true;
      if (stream) stream.destroy();
    });

    onHeaders(res, () => {
      if (!filter(req, res)) return nocompress();
      if (!shouldTransform(req, res)) return nocompress();
      // (No Vary yet, the most often: set as it is.)
      if (res.getHeader('Vary') === undefined) res.setHeader('Vary', 'Accept-Encoding');
      else vary(res, 'Accept-Encoding');
      if (Number(res.getHeader('Content-Length')) < threshold || length < threshold) return nocompress();
      if ((res.getHeader('Content-Encoding') || 'identity') !== 'identity') return nocompress();
      if (req.method === 'HEAD') return nocompress();

      const method = acceptedEncoding(req.headers['accept-encoding'], enforceEncoding);
      if (!method) return nocompress();

      stream =
        method === 'gzip'
          ? zlib.createGzip(opts)
          : method === 'br'
            ? zlib.createBrotliCompress(brotliOptions)
            : zlib.createDeflate(opts);
      // A response closed already: no stream, and what is written goes to the response.
      if (closed) {
        stream.destroy();
        stream = null;
        return undefined;
      }
      for (const [type, listener] of listeners) stream.on(type, listener);
      res.setHeader('Content-Encoding', method);
      res.removeHeader('Content-Length');
      stream.on('data', (chunk) => {
        if (write.call(res, chunk) === false) stream.pause();
      });
      stream.on('end', () => end.call(res));
      on.call(res, 'drain', () => stream.resume());
      return undefined;
    });

    next();
  };
}

compression.filter = shouldCompress;

export { compression, shouldCompress, compressible, negotiateEncoding, acceptedEncoding, noTransform, parseBytes };
