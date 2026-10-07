// Blobs: the bodies of the objects of blob backends (disk, memory-blob, s3, azure-blob), the values of
// fields.blob().
//
// A blob read from a backend is a BlobValue: its body is not read until asked (buffer(), text(), json(), stream()),
// so listing and filtering objects reads no bodies. What can be written as a body: a Buffer or Uint8Array, a string
// (UTF-8), a readable stream or async iterable of chunks, a Blob of the web, or a BlobValue (of this backend or
// another: it is copied).
const { Readable } = require('node:stream');

// The body of a stored object, read when asked.
class BlobValue {
  // `source`: () => a promise of a readable stream (or of a Buffer) of the body; `info`: { size, contentType, etag,
  // updatedAt }; `url`: (options) => a promise of a URL to read it (stores that have them).
  constructor({ source, info = {}, url = null, key = null, table = null, store = null, backend = 'blob' }) {
    this.source = source;
    this.size = info.size === undefined ? null : info.size;
    this.contentType = info.contentType || null;
    this.etag = info.etag || null;
    this.updatedAt = info.updatedAt || null;
    this.key = key;
    this.table = table;
    // The backend that has it (not enumerable: an object of a model as JSON or cloned does not carry it).
    Object.defineProperty(this, 'store', { value: store, enumerable: false });
    this.urlOf = url;
    this.backend = backend;
  }

  // The body as a readable stream.
  async stream() {
    const body = await this.source();
    return Buffer.isBuffer(body) ? Readable.from([body]) : body;
  }

  async buffer() {
    const body = await this.source();
    if (Buffer.isBuffer(body)) return body;
    const chunks = [];
    for await (const chunk of body) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    return Buffer.concat(chunks);
  }

  async text(encoding = 'utf8') {
    return (await this.buffer()).toString(encoding);
  }

  async json() {
    return JSON.parse(await this.text());
  }

  // A URL that reads the body without the app (signed, for a while), where the store has them.
  async url(options = {}) {
    if (!this.urlOf) {
      const { UnsupportedError } = require('./errors'); // eslint-disable-line global-require
      throw new UnsupportedError('URLs of blobs', this.backend);
    }
    return this.urlOf(options);
  }

  // As JSON (an object of a model as JSON): what is known of the body, not the body.
  toJSON() {
    return { size: this.size, contentType: this.contentType, etag: this.etag };
  }
}

const isStream = (value) =>
  value !== null &&
  typeof value === 'object' &&
  (typeof value.pipe === 'function' || typeof value[Symbol.asyncIterator] === 'function') &&
  !Buffer.isBuffer(value);

const isWebBlob = (value) =>
  value !== null &&
  typeof value === 'object' &&
  typeof value.arrayBuffer === 'function' &&
  typeof value.size === 'number';

// Whether a value can be the body of a blob.
function isBody(value) {
  return (
    value instanceof BlobValue ||
    Buffer.isBuffer(value) ||
    value instanceof Uint8Array ||
    typeof value === 'string' ||
    isStream(value) ||
    isWebBlob(value)
  );
}

// A body as a Buffer or a readable stream (what the backends write).
async function bodyOf(value) {
  if (value instanceof BlobValue) return value.stream();
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  if (isWebBlob(value)) return Buffer.from(await value.arrayBuffer());
  if (typeof value.pipe === 'function') return value;
  return Readable.from(value);
}

// A body as a Buffer (read whole).
async function bufferOf(value) {
  const body = await bodyOf(value);
  if (Buffer.isBuffer(body)) return body;
  const chunks = [];
  for await (const chunk of body) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

// The content type of a key by its extension, for objects written without one (application/octet-stream else).
const TYPES = {
  txt: 'text/plain; charset=utf-8',
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  json: 'application/json',
  xml: 'application/xml',
  yaml: 'application/yaml',
  yml: 'application/yaml',
  pdf: 'application/pdf',
  zip: 'application/zip',
  gz: 'application/gzip',
  wasm: 'application/wasm',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  woff: 'font/woff',
  woff2: 'font/woff2',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function contentTypeOf(key) {
  const match = /.([a-z0-9]+)$/i.exec(key);
  return (match && TYPES[match[1].toLowerCase()]) || 'application/octet-stream';
}

module.exports = { BlobValue, isBody, bodyOf, bufferOf, contentTypeOf };
