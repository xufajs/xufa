// Files sent (send): a path read under a root (or absolute), with Content-Type, Last-Modified, a weak ETag,
// Cache-Control and Accept-Ranges; conditional requests (304, 412), ranges (206, 416), HEAD, index files of folders,
// extensions tried, dotfiles allowed, denied or ignored. Its events, as send's: 'headers' (res, path, stat) before
// they are sent, 'file' (path, stat), 'stream', 'end', 'directory' (res, path: a folder), 'error' (an error of HTTP:
// with a listener, the error is the listener's to answer). Small files whose stat has not changed are sent from
// memory.
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { STATUS_CODES } from 'node:http';
import { createError } from './errors.js';
import { contentType } from './mime.js';
import { encodeUrl, escapeHtml, fresh, htmlDocument, parseHttpDate, parseMs, parseRange, statTag } from './headers.js';
import { finished } from './finished.js';

const MAX_MAXAGE = 60 * 60 * 24 * 365 * 1000;
const UP_PATH = /(?:^|[\\/])\.\.(?:[\\/]|$)/;
const BYTES_RANGE = /^ *bytes=/;

function listOf(value, name) {
  const list = [].concat(value || []);
  list.forEach((item) => {
    if (typeof item !== 'string') throw new TypeError(`${name} must be array of strings or false`);
  });
  return list;
}

function tokenList(text) {
  const list = [];
  let start = 0;
  let end = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code === 0x20) {
      if (start === end) {
        start = i + 1;
        end = start;
      }
    } else if (code === 0x2c) {
      if (start !== end) list.push(text.substring(start, end));
      start = i + 1;
      end = start;
    } else end = i + 1;
  }
  if (start !== end) list.push(text.substring(start, end));
  return list;
}

const containsDotFile = (parts) => parts.some((part) => part.length > 1 && part[0] === '.');

const collapseLeadingSlashes = (text) => {
  let i = 0;
  while (i < text.length && text[i] === '/') i += 1;
  return i > 1 ? `/${text.slice(i)}` : text;
};

// --- Small files kept in memory: the bytes read and the stat they were read with (the oldest dropped first). ---
const FILE_MAX = 64 * 1024;
const FILES_MAX = 1000;
const BYTES_MAX = 16 * 1024 * 1024;
const files = new Map();
let bytesKept = 0;

const sameFile = (a, b) =>
  a.size === b.size && a.ino === b.ino && a.dev === b.dev && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;

// The bytes a turn of the event loop later, as a file's (an abort of the client is seen first, as with a file).
function memoryStream(bytes) {
  let started = false;
  return new Readable({
    read() {
      if (started) return;
      started = true;
      setImmediate(() => {
        this.push(bytes);
        this.push(null);
      });
    },
  });
}

function keep(filePath, stat, stream) {
  const chunks = [];
  let length = 0;
  stream.on('data', (chunk) => {
    chunks.push(chunk);
    length += chunk.length;
  });
  stream.on('end', () => {
    if (length !== stat.size) return;
    const old = files.get(filePath);
    if (old !== undefined) {
      bytesKept -= old.bytes.length;
      files.delete(filePath);
    }
    const bytes = Buffer.concat(chunks, length);
    files.set(filePath, { stat, bytes });
    bytesKept += bytes.length;
    while (files.size > FILES_MAX || bytesKept > BYTES_MAX) {
      const oldest = files.keys().next().value;
      bytesKept -= files.get(oldest).bytes.length;
      files.delete(oldest);
    }
  });
}

export class FileSender extends EventEmitter {
  constructor(req, filePath, options = {}) {
    super();
    this.options = options;
    this.path = filePath;
    this.req = req;
    this.res = null;
    this.acceptRanges = options.acceptRanges !== undefined ? Boolean(options.acceptRanges) : true;
    this.cacheControl = options.cacheControl !== undefined ? Boolean(options.cacheControl) : true;
    this.etag = options.etag !== undefined ? Boolean(options.etag) : true;
    this.dotfiles = options.dotfiles !== undefined ? options.dotfiles : 'ignore';
    if (this.dotfiles !== 'ignore' && this.dotfiles !== 'allow' && this.dotfiles !== 'deny') {
      throw new TypeError('dotfiles option must be "allow", "deny", or "ignore"');
    }
    this.extensions = options.extensions !== undefined ? listOf(options.extensions, 'extensions option') : [];
    this.immutable = options.immutable !== undefined ? Boolean(options.immutable) : false;
    this.index = options.index !== undefined ? listOf(options.index, 'index option') : ['index.html'];
    this.lastModified = options.lastModified !== undefined ? Boolean(options.lastModified) : true;
    let maxAge = options.maxAge || options.maxage;
    maxAge = typeof maxAge === 'string' ? parseMs(maxAge) : Number(maxAge);
    this.maxAge = !Number.isNaN(maxAge) ? Math.min(Math.max(0, maxAge), MAX_MAXAGE) : 0;
    this.root = options.root ? path.resolve(options.root) : null;
  }

  // An error of HTTP: to the 'error' listeners, or answered (a small page) without one.
  error(status, cause) {
    if (this.listenerCount('error') > 0) {
      let error;
      if (!cause) error = createError(status);
      else error = cause instanceof Error ? createError(status, cause, { expose: false }) : createError(status, cause);
      this.emit('error', error);
      return;
    }
    const { res } = this;
    const doc = htmlDocument('Error', escapeHtml(STATUS_CODES[status] || String(status)));
    for (const name of res.getHeaderNames()) res.removeHeader(name);
    if (cause && cause.headers) Object.keys(cause.headers).forEach((key) => res.setHeader(key, cause.headers[key]));
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    res.setHeader('Content-Length', Buffer.byteLength(doc));
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(doc);
  }

  hasTrailingSlash() {
    return this.path[this.path.length - 1] === '/';
  }

  isConditionalGET() {
    const { headers } = this.req;
    return (
      headers['if-match'] || headers['if-unmodified-since'] || headers['if-none-match'] || headers['if-modified-since']
    );
  }

  isPreconditionFailure() {
    const { headers } = this.req;
    const match = headers['if-match'];
    if (match) {
      const etag = this.res.getHeader('ETag');
      return (
        !etag ||
        (match !== '*' &&
          tokenList(match).every((item) => item !== etag && item !== `W/${etag}` && `W/${item}` !== etag))
      );
    }
    const unmodifiedSince = parseHttpDate(headers['if-unmodified-since']);
    if (!Number.isNaN(unmodifiedSince)) {
      const lastModified = parseHttpDate(this.res.getHeader('Last-Modified'));
      return Number.isNaN(lastModified) || lastModified > unmodifiedSince;
    }
    return false;
  }

  notModified() {
    const { res } = this;
    ['Content-Encoding', 'Content-Language', 'Content-Length', 'Content-Range', 'Content-Type'].forEach((name) =>
      res.removeHeader(name)
    );
    res.statusCode = 304;
    res.end();
  }

  isCachable() {
    const status = this.res.statusCode;
    return (status >= 200 && status < 300) || status === 304;
  }

  onStatError(error) {
    if (error.code === 'ENAMETOOLONG' || error.code === 'ENOENT' || error.code === 'ENOTDIR') this.error(404, error);
    else this.error(500, error);
  }

  isFresh() {
    return fresh(this.req.headers, this.res.getHeader('ETag'), this.res.getHeader('Last-Modified'));
  }

  isRangeFresh() {
    const ifRange = this.req.headers['if-range'];
    if (!ifRange) return true;
    if (ifRange.indexOf('"') !== -1) {
      const etag = this.res.getHeader('ETag');
      return Boolean(etag && ifRange.indexOf(etag) !== -1);
    }
    return parseHttpDate(this.res.getHeader('Last-Modified')) <= parseHttpDate(ifRange);
  }

  // A folder: to the 'directory' listeners, or a redirect to its path with a '/'.
  redirect(folder) {
    const { res } = this;
    if (this.listenerCount('directory') > 0) {
      this.emit('directory', res, folder);
      return;
    }
    if (this.hasTrailingSlash()) {
      this.error(403);
      return;
    }
    const location = encodeUrl(collapseLeadingSlashes(`${this.path}/`));
    const doc = htmlDocument('Redirecting', `Redirecting to ${escapeHtml(location)}`);
    res.statusCode = 301;
    res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    res.setHeader('Content-Length', Buffer.byteLength(doc));
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Location', location);
    res.end(doc);
  }

  pipe(res) {
    this.res = res;
    let filePath;
    try {
      filePath = decodeURIComponent(this.path);
    } catch {
      this.error(400);
      return res;
    }
    if (filePath.indexOf('\0') !== -1) {
      this.error(400);
      return res;
    }
    let parts;
    if (this.root !== null) {
      if (filePath) filePath = path.normalize(`.${path.sep}${filePath}`);
      if (UP_PATH.test(filePath)) {
        this.error(403);
        return res;
      }
      parts = filePath.split(path.sep);
      filePath = path.normalize(path.join(this.root, filePath));
    } else {
      if (UP_PATH.test(filePath)) {
        this.error(403);
        return res;
      }
      parts = path.normalize(filePath).split(path.sep);
      filePath = path.resolve(filePath);
    }
    if (containsDotFile(parts)) {
      if (this.dotfiles === 'deny') {
        this.error(403);
        return res;
      }
      if (this.dotfiles !== 'allow') {
        this.error(404);
        return res;
      }
    }
    if (this.index.length && this.hasTrailingSlash()) {
      this.sendIndex(filePath);
      return res;
    }
    this.sendFile(filePath);
    return res;
  }

  send(filePath, stat) {
    let length = stat.size;
    const { options, res, req } = this;
    let ranges = req.headers.range;
    let offset = options.start || 0;
    if (res.headersSent) {
      this.error(500, new Error("Can't set headers after they are sent."));
      return;
    }
    this.setHeaders(filePath, stat);
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', contentType(path.extname(filePath)) || 'application/octet-stream');
    }
    if (this.isConditionalGET()) {
      if (this.isPreconditionFailure()) {
        this.error(412);
        return;
      }
      if (this.isCachable() && this.isFresh()) {
        this.notModified();
        return;
      }
    }
    length = Math.max(0, length - offset);
    if (options.end !== undefined) {
      const bytes = options.end - offset + 1;
      if (length > bytes) length = bytes;
    }
    if (this.acceptRanges && BYTES_RANGE.test(ranges)) {
      ranges = parseRange(length, ranges, { combine: true });
      if (!this.isRangeFresh()) ranges = -2;
      if (ranges === -1) {
        res.setHeader('Content-Range', `bytes */${length}`);
        this.error(416, { headers: { 'Content-Range': res.getHeader('Content-Range') } });
        return;
      }
      if (ranges !== -2 && ranges.length === 1) {
        res.statusCode = 206;
        res.setHeader('Content-Range', `bytes ${ranges[0].start}-${ranges[0].end}/${length}`);
        offset += ranges[0].start;
        length = ranges[0].end - ranges[0].start + 1;
      }
    }
    const readOptions = { ...options, start: offset, end: Math.max(offset, offset + length - 1) };
    res.setHeader('Content-Length', length);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    this.stream(filePath, readOptions, stat);
  }

  sendFile(filePath) {
    let i = 0;
    const endsWithSep = filePath[filePath.length - 1] === path.sep;
    const next = (error) => {
      if (this.extensions.length <= i) {
        if (error) this.onStatError(error);
        else this.error(404);
        return;
      }
      const candidate = `${filePath}.${this.extensions[i++]}`;
      fs.stat(candidate, (statError, stat) => {
        if (statError) next(statError);
        else if (stat.isDirectory()) next();
        else {
          this.emit('file', candidate, stat);
          this.send(candidate, stat);
        }
      });
    };
    fs.stat(filePath, (error, stat) => {
      if (error && error.code === 'ENOENT' && !path.extname(filePath) && !endsWithSep) {
        next(error);
        return;
      }
      if (error) {
        this.onStatError(error);
        return;
      }
      if (stat.isDirectory()) {
        this.redirect(filePath);
        return;
      }
      if (endsWithSep) {
        this.error(404);
        return;
      }
      this.emit('file', filePath, stat);
      this.send(filePath, stat);
    });
  }

  sendIndex(folder) {
    let i = -1;
    const next = (error) => {
      i += 1;
      if (i >= this.index.length) {
        if (error) this.onStatError(error);
        else this.error(404);
        return;
      }
      const candidate = path.join(folder, this.index[i]);
      fs.stat(candidate, (statError, stat) => {
        if (statError) next(statError);
        else if (stat.isDirectory()) next();
        else {
          this.emit('file', candidate, stat);
          this.send(candidate, stat);
        }
      });
    };
    next();
  }

  stream(filePath, options, stat) {
    const { res } = this;
    const whole =
      stat.size > 0 && options.start === 0 && stat.size <= FILE_MAX && options.end === Math.max(0, stat.size - 1);
    const known = whole ? files.get(filePath) : undefined;
    let stream;
    if (known !== undefined && sameFile(known.stat, stat)) stream = memoryStream(known.bytes);
    else {
      stream = fs.createReadStream(filePath, options);
      if (whole) keep(filePath, stat, stream);
    }
    this.emit('stream', stream);
    stream.pipe(res);
    const cleanup = () => stream.destroy();
    finished(res, cleanup);
    stream.on('error', (error) => {
      cleanup();
      this.onStatError(error);
    });
    stream.on('end', () => this.emit('end'));
  }

  setHeaders(filePath, stat) {
    const { res } = this;
    this.emit('headers', res, filePath, stat);
    if (this.acceptRanges && !res.getHeader('Accept-Ranges')) res.setHeader('Accept-Ranges', 'bytes');
    if (this.cacheControl && !res.getHeader('Cache-Control')) {
      res.setHeader(
        'Cache-Control',
        `public, max-age=${Math.floor(this.maxAge / 1000)}${this.immutable ? ', immutable' : ''}`
      );
    }
    if (this.lastModified && !res.getHeader('Last-Modified')) res.setHeader('Last-Modified', stat.mtime.toUTCString());
    if (this.etag && !res.getHeader('ETag')) res.setHeader('ETag', statTag(stat));
  }
}
