// The API of the form-data package (as of form-data 4.0.5), xufa's own implementation: forms of multipart/form-data
// written as a stream, to send to a server (submit(), pipe(), or as the body of axios and other clients). Its parts are
// texts, Buffers, and streams (files, HTTP responses, any Readable) read when their turn comes; the stream is the old
// kind form-data is (a 'data' listener does not start it: pipe() or resume() do), so what listens before it is piped
// misses nothing.
//
//   const form = new FormData();
//   form.append('title', 'Dune');
//   form.append('cover', fs.createReadStream('cover.png')); // its name and type from its path
//   form.append('notes', buffer, 'notes.txt');
//   axios.post(url, form, { headers: form.getHeaders() });
//
// The types of files come from @xufa/http's mime table (mime-db 1.54, as mime-types 3 reads it; form-data reads mime-db
// 1.52 with mime-types 2: newer types, and .js text/javascript). form-data's own tests pass on it
// (tools/port-form-data).
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { Stream } from 'node:stream';
import { lookup } from './mime.js';

const LINE_BREAK = '\r\n';
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

// A stream of a part (strings, Buffers, numbers, booleans and functions are not).
const isStreamLike = (value) =>
  typeof value !== 'function' &&
  typeof value !== 'string' &&
  typeof value !== 'boolean' &&
  typeof value !== 'number' &&
  !Buffer.isBuffer(value);

// A stream appended, held until its turn: what it says (data, end, errors) is kept and said again then, so a stream
// that runs before (an old one, a response) loses nothing. (delayed-stream's way, which form-data's streams have.)
class HeldStream extends Stream {
  constructor(source, pause) {
    super();
    this.source = source;
    this.dataSize = 0;
    this.released = false;
    this.events = [];
    const emit = source.emit;
    const held = this;
    source.emit = function (...args) {
      held.heard(args);
      return emit.apply(source, args);
    };
    // (Its errors are said by this stream, when its turn comes.)
    source.on('error', () => {});
    if (pause) source.pause();
  }

  get readable() {
    return this.source.readable;
  }

  heard(args) {
    if (this.released) {
      this.emit(...args);
      return;
    }
    if (args[0] === 'data') this.dataSize += args[1].length;
    this.events.push(args);
  }

  setEncoding(...args) {
    return this.source.setEncoding(...args);
  }

  resume() {
    if (!this.released) {
      this.released = true;
      for (const args of this.events) this.emit(...args);
      this.events = [];
    }
    this.source.resume();
  }

  pause() {
    this.source.pause();
  }

  pipe(...args) {
    const dest = Stream.prototype.pipe.apply(this, args);
    this.resume();
    return dest;
  }
}

class FormData extends Stream {
  static LINE_BREAK = LINE_BREAK;
  static DEFAULT_CONTENT_TYPE = DEFAULT_CONTENT_TYPE;

  // options: properties of the form (maxDataSize: what streams may say before their turn, 2 MiB; pauseStreams).
  constructor(options = {}) {
    super();
    this.writable = false;
    this.readable = true;
    this.dataSize = 0;
    this.maxDataSize = 2 * 1024 * 1024;
    this.pauseStreams = true;
    this._released = false;
    this._streams = [];
    this._currentStream = null;
    this._insideLoop = false;
    this._pendingNext = false;
    this._overheadLength = 0;
    this._valueLength = 0;
    this._valuesToMeasure = [];
    for (const option in options) this[option] = options[option];
  }

  // A part: a text (numbers, null and undefined as text), a Buffer or a stream; options its filename (a string is
  // one), filepath (a name with its folders), contentType, knownLength, or header (an object of headers to add, or the
  // whole header as a string).
  append(field, value, options = {}) {
    const opts = typeof options === 'string' ? { filename: options } : options || {};
    let part = value;
    if (typeof part === 'number' || part == null) part = String(part);
    if (Array.isArray(part)) {
      this._error(new Error('Arrays are not supported.'));
      return;
    }
    const header = this._multiPartHeader(field, part, opts);
    this.add(header);
    this.add(part);
    this.add(this._multiPartFooter());
    this._trackLength(header, part, opts);
  }

  add(part) {
    let stream = part;
    if (isStreamLike(stream)) {
      if (!(stream instanceof HeldStream)) {
        const held = new HeldStream(stream, this.pauseStreams);
        stream.on('data', () => this.checkDataSize());
        stream = held;
      }
      stream.on('error', (err) => this.emitError(err));
      if (this.pauseStreams) stream.pause();
    }
    this._streams.push(stream);
    return this;
  }

  _trackLength(header, value, options) {
    let valueLength = 0;
    if (options.knownLength != null) valueLength += Number(options.knownLength);
    else if (Buffer.isBuffer(value)) valueLength = value.length;
    else if (typeof value === 'string') valueLength = Buffer.byteLength(value);
    this._valueLength += valueLength;
    this._overheadLength += Buffer.byteLength(header) + LINE_BREAK.length;
    // (A stream of a file, a response or any other: its length is asked for, unless known.)
    if (!value || (!value.path && !(value.readable && hasOwn(value, 'httpVersion')) && !(value instanceof Stream)))
      return;
    if (!options.knownLength) this._valuesToMeasure.push(value);
  }

  // The length of a stream: of its file (the range of it read: from start, 0 without one, to end or the end of the
  // file), of a response, of a response to come (request's streams); 'Unknown stream' for others. (form-data counted
  // the whole file for a stream with an end and no start, as Node once read them: a request of that length waits for
  // bytes that never come.)
  _lengthRetriever(value, callback) {
    if (hasOwn(value, 'fd')) {
      fs.stat(value.path, (err, stat) => {
        if (err) {
          callback(err);
          return;
        }
        const start = value.start || 0;
        const last =
          value.end === undefined || value.end === Infinity ? stat.size - 1 : Math.min(value.end, stat.size - 1);
        callback(null, Math.max(0, last - start + 1));
      });
    } else if (hasOwn(value, 'httpVersion')) {
      callback(null, Number(value.headers['content-length']));
    } else if (hasOwn(value, 'httpModule')) {
      value.on('response', (response) => {
        value.pause();
        callback(null, Number(response.headers['content-length']));
      });
      value.resume();
    } else {
      callback('Unknown stream');
    }
  }

  _multiPartHeader(field, value, options) {
    if (typeof options.header === 'string') return options.header;
    const disposition = this._getContentDisposition(value, options);
    const type = this._getContentType(value, options);
    const headers = {
      'Content-Disposition': ['form-data', `name="${field}"`].concat(disposition || []),
      'Content-Type': [].concat(type || []),
    };
    // (Headers of the options fill those that are not there.)
    if (typeof options.header === 'object') {
      for (const name of Object.keys(options.header)) headers[name] = headers[name] || options.header[name];
    }
    let contents = '';
    for (const name of Object.keys(headers)) {
      let header = headers[name];
      if (header == null) continue;
      if (!Array.isArray(header)) header = [header];
      if (header.length) contents += `${name}: ${header.join('; ')}${LINE_BREAK}`;
    }
    return `--${this.getBoundary()}${LINE_BREAK}${contents}${LINE_BREAK}`;
  }

  // filename="..." of the options (filepath keeps its folders), of the value (a name, a path), or of the path of the
  // request of a response.
  _getContentDisposition(value, options) {
    let filename;
    if (typeof options.filepath === 'string') {
      filename = path.normalize(options.filepath).replace(/\\/g, '/');
    } else if (options.filename || (value && (value.name || value.path))) {
      filename = path.basename(options.filename || (value && (value.name || value.path)));
    } else if (value && value.readable && hasOwn(value, 'httpVersion')) {
      filename = path.basename(value.client._httpMessage.path || '');
    }
    return filename ? `filename="${filename}"` : undefined;
  }

  // The type of the options, of the name or path of the value, of a response, of the filename; or
  // application/octet-stream for a value that is not text.
  _getContentType(value, options) {
    let type = options.contentType;
    if (!type && value && value.name) type = lookup(value.name);
    if (!type && value && value.path) type = lookup(value.path);
    if (!type && value && value.readable && hasOwn(value, 'httpVersion')) type = value.headers['content-type'];
    if (!type && (options.filepath || options.filename)) type = lookup(options.filepath || options.filename);
    if (!type && value && typeof value === 'object') type = DEFAULT_CONTENT_TYPE;
    return type;
  }

  // The end of a part, and of the form after its last part.
  _multiPartFooter() {
    return (next) => {
      let footer = LINE_BREAK;
      if (this._streams.length === 0) footer += this._lastBoundary();
      next(footer);
    };
  }

  _lastBoundary() {
    return `--${this.getBoundary()}--${LINE_BREAK}`;
  }

  // Its Content-Type, and the headers given (names in lowercase).
  getHeaders(userHeaders) {
    const headers = { 'content-type': `multipart/form-data; boundary=${this.getBoundary()}` };
    for (const name in userHeaders) {
      if (hasOwn(userHeaders, name)) headers[name.toLowerCase()] = userHeaders[name];
    }
    return headers;
  }

  setBoundary(boundary) {
    if (typeof boundary !== 'string') throw new TypeError('FormData boundary must be a string');
    this._boundary = boundary;
  }

  // 26 dashes and 24 random hex digits (crypto's: a boundary nobody can guess, to put in a value).
  getBoundary() {
    if (!this._boundary) this._boundary = `--------------------------${crypto.randomBytes(12).toString('hex')}`;
    return this._boundary;
  }

  // The form at once, of its texts and Buffers (streams are left out).
  getBuffer() {
    const boundary = this.getBoundary();
    const chunks = [];
    for (const part of this._streams) {
      if (typeof part === 'function') continue;
      chunks.push(Buffer.isBuffer(part) ? part : Buffer.from(part));
      if (typeof part !== 'string' || part.substring(2, boundary.length + 2) !== boundary) {
        chunks.push(Buffer.from(LINE_BREAK));
      }
    }
    chunks.push(Buffer.from(this._lastBoundary()));
    return Buffer.concat(chunks);
  }

  // The length of the form without streams of unknown length (an error says it when there are).
  getLengthSync() {
    let length = this._overheadLength + this._valueLength;
    if (this._streams.length) length += this._lastBoundary().length;
    if (!this.hasKnownLength()) this._error(new Error('Cannot calculate proper length in synchronous way.'));
    return length;
  }

  hasKnownLength() {
    return this._valuesToMeasure.length === 0;
  }

  // callback(err, length): with the lengths of its streams.
  getLength(callback) {
    let length = this._overheadLength + this._valueLength;
    if (this._streams.length) length += this._lastBoundary().length;
    if (!this._valuesToMeasure.length) {
      process.nextTick(callback.bind(this, null, length));
      return;
    }
    const values = this._valuesToMeasure;
    const lengths = new Array(values.length);
    let left = values.length;
    let failed = false;
    values.forEach((value, i) => {
      this._lengthRetriever(value, (err, size) => {
        if (failed) return;
        if (err) {
          failed = true;
          callback(err);
          return;
        }
        lengths[i] = size;
        left -= 1;
        if (left === 0)
          callback(
            null,
            lengths.reduce((sum, n) => sum + n, length)
          );
      });
    });
  }

  // A POST of the form to a URL (or to options of http.request, protocol 'https:' for HTTPS): the request, and
  // callback(err, response).
  submit(params, callback) {
    let options;
    if (typeof params === 'string') {
      const url = new URL(params);
      options = {
        port: url.port || null,
        path: url.pathname,
        host: url.hostname.replace(/^\[(.*)\]$/, '$1'),
        protocol: url.protocol,
        method: 'post',
      };
    } else {
      options = { ...params };
      if (!options.method) options.method = 'post';
      if (!options.port) options.port = options.protocol === 'https:' ? 443 : 80;
    }
    options.headers = this.getHeaders(params.headers);
    const request = options.protocol === 'https:' ? https.request(options) : http.request(options);
    this.getLength((err, length) => {
      if (err && err !== 'Unknown stream') {
        this._error(err);
        return;
      }
      if (length) request.setHeader('Content-Length', length);
      this.pipe(request);
      if (callback) {
        const done = (error, response) => {
          request.removeListener('error', done);
          request.removeListener('response', onResponse);
          return callback.call(this, error, response);
        };
        const onResponse = (response) => done(null, response);
        request.on('error', done);
        request.on('response', onResponse);
      }
    });
    return request;
  }

  _error(err) {
    if (!this.error) {
      this.error = err;
      this.pause();
      this.emit('error', err);
    }
  }

  toString() {
    return '[object FormData]';
  }

  get [Symbol.toStringTag]() {
    return 'FormData';
  }

  // The stream of the parts, one after the other.

  pipe(dest, options) {
    Stream.prototype.pipe.call(this, dest, options);
    this.resume();
    return dest;
  }

  getNext() {
    this._currentStream = null;
    if (this._insideLoop) {
      this._pendingNext = true;
      return;
    }
    this._insideLoop = true;
    try {
      do {
        this._pendingNext = false;
        this.nextPart();
      } while (this._pendingNext);
    } finally {
      this._insideLoop = false;
    }
  }

  nextPart() {
    const part = this._streams.shift();
    if (part === undefined) {
      this.end();
      return;
    }
    if (typeof part !== 'function') {
      this.sendPart(part);
      return;
    }
    part((value) => {
      if (isStreamLike(value)) {
        value.on('data', () => this.checkDataSize());
        value.on('error', (err) => this.emitError(err));
      }
      this.sendPart(value);
    });
  }

  sendPart(part) {
    this._currentStream = part;
    if (isStreamLike(part)) {
      part.on('end', () => this.getNext());
      part.pipe(this, { end: false });
      return;
    }
    this.write(part);
    this.getNext();
  }

  write(data) {
    this.emit('data', data);
  }

  pause() {
    if (!this.pauseStreams) return;
    if (this._currentStream && typeof this._currentStream.pause === 'function') this._currentStream.pause();
    this.emit('pause');
  }

  resume() {
    if (!this._released) {
      this._released = true;
      this.writable = true;
      this.getNext();
    }
    if (this.pauseStreams && this._currentStream && typeof this._currentStream.resume === 'function') {
      this._currentStream.resume();
    }
    this.emit('resume');
  }

  end() {
    this.reset();
    this.emit('end');
  }

  destroy() {
    this.reset();
    this.emit('close');
  }

  reset() {
    this.writable = false;
    this._streams = [];
    this._currentStream = null;
  }

  // What streams said before their turn, past maxDataSize: an error.
  checkDataSize() {
    this.dataSize = 0;
    for (const part of this._streams) if (part.dataSize) this.dataSize += part.dataSize;
    if (this._currentStream && this._currentStream.dataSize) this.dataSize += this._currentStream.dataSize;
    if (this.dataSize > this.maxDataSize) {
      this.emitError(new Error(`DelayedStream#maxDataSize of ${this.maxDataSize} bytes exceeded.`));
    }
  }

  emitError(err) {
    this.reset();
    this.emit('error', err);
  }
}

export { FormData };
