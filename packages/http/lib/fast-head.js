// The head of common responses written by xufa as one string, given to Node as the header it would have made
// (res._header), instead of res.writeHead(): Node checks and assembles every header of every response, which is most
// of what a small response costs. On by default (the option fastHead: false turns it off), for HTTP/1.1 responses
// kept alive, with a body, without trailers nor headers set on the response of Node itself (reply.raw.setHeader);
// anything else goes through res.writeHead(). Header names and values are checked as Node checks them.
//
// It sets the fields of Node's ServerResponse that writeHead() sets (_header, _headerSent) and reads those that decide
// keep-alive: the first time it is used, a self-test compares its head with the one of Node, and turns it off for good
// when they differ (a version of Node that changed them).
const http = require('node:http');
const { Duplex } = require('node:stream');

// The symbol of the headers set on Node's response (setHeader), found once.
const kOutHeaders = Object.getOwnPropertySymbols(new http.OutgoingMessage()).find(
  (symbol) => symbol.description === 'kOutHeaders'
);

// What Node accepts in names (tokens) and values (no control characters but tab).
const TOKEN = /^[\^_`a-zA-Z\-0-9!#$%&'*+.|~]+$/;
const INVALID_VALUE = /[^\t\x20-\x7e\x80-\xff]/;

// Names and values already checked; values that change on every request (ids, lengths) are checked every time.
const goodNames = new Set();
const goodValues = new Set();
const MAX_CACHED = 1000;

function checkName(name) {
  if (goodNames.has(name)) return true;
  if (!TOKEN.test(name)) return false;
  if (goodNames.size < MAX_CACHED) goodNames.add(name);
  return true;
}

function checkValue(value) {
  if (goodValues.has(value)) return true;
  if (INVALID_VALUE.test(value)) return false;
  if (goodValues.size < MAX_CACHED) goodValues.add(value);
  return true;
}

// The Date header, made once a second, as Node makes it.
let date = null;
function dateLine() {
  if (date === null) {
    date = `Date: ${new Date().toUTCString()}\r\n`;
    setTimeout(() => {
      date = null;
    }, 1000 - new Date().getMilliseconds()).unref();
  }
  return date;
}

const statusLines = new Map();
function statusLine(code) {
  let line = statusLines.get(code);
  if (line === undefined) {
    line = `HTTP/1.1 ${code} ${http.STATUS_CODES[code] || 'unknown'}\r\n`;
    statusLines.set(code, line);
  }
  return line;
}

// The lines of a header, or null when it is not one this path writes.
function headerLines(name, value) {
  if (typeof value === 'string') return checkValue(value) ? `${name}: ${value}\r\n` : null;
  if (typeof value === 'number') return `${name}: ${value}\r\n`;
  if (Array.isArray(value)) {
    let lines = '';
    for (let i = 0; i < value.length; i += 1) {
      const item = value[i];
      if (typeof item === 'string') {
        if (!checkValue(item)) return null;
      } else if (typeof item !== 'number') return null;
      lines += `${name}: ${item}\r\n`;
    }
    return lines;
  }
  return null;
}

// The head of a response, or null when this path does not write it. `length` is the byte length of the body.
// Headers that decide how the connection is kept: with one of them, Node writes the head.
const CONNECTION = new Set(['connection', 'transfer-encoding', 'date', 'keep-alive']);

// The head of a response, or null when this path does not write it. `length` is the byte length of the body, null
// when it has none (204, 304 and HEAD: Node frames a body without a length as chunks, and that is left to it).
function writeFastHead(res, req, statusCode, headers, length) {
  if (
    res._header !== null ||
    req.httpVersionMajor !== 1 ||
    req.httpVersionMinor !== 1 ||
    !Number.isInteger(statusCode) ||
    statusCode < 200 ||
    statusCode > 599 ||
    res.shouldKeepAlive !== true ||
    res.maxRequestsOnConnectionReached ||
    res.statusMessage !== undefined ||
    res.sendDate !== true
  ) {
    return null;
  }
  if (length === null || length === undefined) {
    const bodyless = statusCode === 204 || statusCode === 304 || req.method === 'HEAD';
    // Without a length, Node keeps the connection only when it could frame a body as chunks (or has an agent).
    if (!bodyless || (!res.useChunkedEncodingByDefault && !res.agent)) return null;
  }
  let head = statusLine(statusCode);
  // Headers set on Node's response (reply.raw.setHeader) come first, as writeHead() gives them: one of the reply with
  // the same name takes its place.
  const raw = res[kOutHeaders];
  let replaced = null;
  if (raw !== null) {
    replaced = new Set();
    for (const key in raw) {
      if (key === 'content-length' || CONNECTION.has(key)) return null;
      let name = raw[key][0];
      let value = raw[key][1];
      if (headers[key] !== undefined) {
        name = key;
        value = headers[key];
        replaced.add(key);
      }
      if (!checkName(name)) return null;
      const lines = headerLines(name, value);
      if (lines === null) return null;
      head += lines;
    }
  }
  for (const name in headers) {
    const value = headers[name];
    if (value === undefined || name === 'content-length') continue; // the length is written below
    if (replaced !== null && replaced.has(name)) continue;
    if (CONNECTION.has(name)) return null;
    if (!checkName(name)) return null;
    const lines = headerLines(name, value);
    if (lines === null) return null;
    head += lines;
  }
  if (length !== null && length !== undefined) head += `content-length: ${length}\r\n`;
  head += `${dateLine()}Connection: keep-alive\r\n`;
  if (res._keepAliveTimeout && res._defaultKeepAlive) {
    const max = ~~res._maxRequestsPerSocket > 0 ? `, max=${res._maxRequestsPerSocket}` : ''; // eslint-disable-line no-bitwise
    head += `Keep-Alive: timeout=${Math.floor(res._keepAliveTimeout / 1000)}${max}\r\n`;
  }
  return `${head}\r\n`;
}

class NullSocket extends Duplex {
  _read() {}

  _write(chunk, encoding, callback) {
    callback();
  }
}

// A response of Node for the self-test, as the server makes them.
function sampleResponse(method = 'GET') {
  const socket = new NullSocket();
  const req = new http.IncomingMessage(socket);
  req.method = method;
  req.httpVersionMajor = 1;
  req.httpVersionMinor = 1;
  req.headers = {};
  const res = new http.ServerResponse(req);
  res._keepAliveTimeout = 72000;
  res._defaultKeepAlive = true;
  res._maxRequestsPerSocket = 7;
  return { req, res };
}

let works = null;

// Whether this path writes the head Node writes (the same lines, Date apart): checked once.
function fastHeadWorks() {
  if (works !== null) return works;
  try {
    const withoutDate = (text) => text.replace(/\r\nDate: [^\r]*/i, '');
    // The same head as Node's writeHead() for these headers (after those set on the response, rawHeaders).
    const same = (method, statusCode, headers, rawHeaders, length) => {
      const node = sampleResponse(method);
      const ours = sampleResponse(method);
      for (const [name, value] of rawHeaders) {
        node.res.setHeader(name, value);
        ours.res.setHeader(name, value);
      }
      node.res.writeHead(statusCode, length === null ? headers : { ...headers, 'content-length': String(length) });
      const head = writeFastHead(ours.res, ours.req, statusCode, headers, length);
      return (
        head !== null &&
        typeof node.res._header === 'string' &&
        /\r\nDate: /.test(node.res._header) &&
        withoutDate(head) === withoutDate(node.res._header) &&
        node.res._headerSent === false
      );
    };
    const json = { 'content-type': 'application/json; charset=utf-8', 'x-many': ['a', 'b'], 'x-count': 3 };
    works =
      same('GET', 201, json, [], 2) &&
      same(
        'HEAD',
        200,
        { 'content-type': 'text/plain', 'x-raw': 'reply' },
        [
          ['X-Raw', 'raw'],
          ['x-first', '1'],
        ],
        5
      );
  } catch {
    works = false;
  }
  return works;
}

// Gives the head to the response, as writeHead() would: true when this path wrote it.
function fastHead(res, req, statusCode, headers, length) {
  const head = writeFastHead(res, req, statusCode, headers, length);
  if (head === null) return false;
  res._header = head;
  res._headerSent = false;
  // When headers were set on the response, writeHead() sets those of the reply there too (getHeaders() gives them).
  const raw = res[kOutHeaders];
  if (raw !== null) {
    for (const name in headers) {
      if (headers[name] !== undefined) raw[name] = [name, headers[name]];
    }
  }
  // As writeHead(): 204 and 304 have no body (a HEAD response has none from the start).
  if (statusCode === 204 || statusCode === 304) res._hasBody = false;
  return true;
}

module.exports = { fastHead, fastHeadWorks, writeFastHead };
