// The bodies fetch takes, made into what the http transport sends: their bytes (or a stream of them), with the
// content-type and content-length fetch gives them.
// - URLSearchParams: its text, application/x-www-form-urlencoded;charset=UTF-8;
// - Blob (and File): its bytes as a stream, its type, its size;
// - ArrayBuffer, a typed array, a DataView: their bytes;
// - FormData: multipart/form-data, written here as fetch writes it (RFC 7578, the escapes of the HTML standard), its
//   files streamed and its length known before (as undici does): servers that refuse a chunked one take it.
// encodeBody(body) gives { body, headers } (headers: those to add when the caller has not given them), or null when it
// is not one of these (texts, Buffers and streams go as they are; anything else goes through fetch).
const { randomBytes } = require('node:crypto');
const { Blob } = require('node:buffer');
const { Readable } = require('node:stream');

// FormData is a global of Node.js (of undici), with no module of its own.
const { FormData } = globalThis;

const CRLF = '\r\n';

// The escapes of names and file names in the headers of a part (as browsers and undici write them).
const escapeName = (text) => text.replace(/\n/g, '%0A').replace(/\r/g, '%0D').replace(/"/g, '%22');
// Line breaks of text values as CRLF (the HTML standard normalizes them).
const normalizeLines = (text) => text.replace(/\r(?!\n)|(?<!\r)\n/g, CRLF);

function formData(form) {
  const boundary = `----xufa-form-${randomBytes(16).toString('hex')}`;
  const parts = [];
  let length = 0;
  for (const [name, value] of form) {
    let head = `--${boundary}${CRLF}Content-Disposition: form-data; name="${escapeName(name)}"`;
    if (typeof value === 'string') {
      head += `${CRLF}${CRLF}`;
      const bytes = Buffer.from(`${head}${normalizeLines(value)}${CRLF}`);
      parts.push(bytes);
      length += bytes.length;
    } else {
      head += `; filename="${escapeName(value.name || 'blob')}"${CRLF}Content-Type: ${
        value.type || 'application/octet-stream'
      }${CRLF}${CRLF}`;
      const headBytes = Buffer.from(head);
      parts.push(headBytes, value, Buffer.from(CRLF));
      length += headBytes.length + value.size + 2;
    }
  }
  const end = Buffer.from(`--${boundary}--${CRLF}`);
  parts.push(end);
  length += end.length;
  async function* pieces() {
    for (const part of parts) {
      if (Buffer.isBuffer(part)) yield part;
      else for await (const chunk of part.stream()) yield chunk;
    }
  }
  return {
    body: Readable.from(pieces()),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': String(length) },
  };
}

function encodeBody(body) {
  if (body instanceof URLSearchParams) {
    return {
      body: body.toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    };
  }
  if (FormData && body instanceof FormData) return formData(body);
  if (body instanceof Blob) {
    const headers = { 'content-length': String(body.size) };
    if (body.type) headers['content-type'] = body.type;
    return { body: Readable.fromWeb(body.stream()), headers };
  }
  if (body instanceof ArrayBuffer) return { body: Buffer.from(body), headers: {} };
  if (ArrayBuffer.isView(body) && !Buffer.isBuffer(body)) {
    return { body: Buffer.from(body.buffer, body.byteOffset, body.byteLength), headers: {} };
  }
  return null;
}

module.exports = { encodeBody };
