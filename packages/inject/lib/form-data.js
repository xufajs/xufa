// A FormData payload as a multipart/form-data stream (the encoding of undici's fetch).
const { randomUUID } = require('node:crypto');
const { Readable } = require('node:stream');

function isFormDataLike(payload) {
  return (
    Boolean(payload) &&
    typeof payload === 'object' &&
    typeof payload.append === 'function' &&
    typeof payload.delete === 'function' &&
    typeof payload.get === 'function' &&
    typeof payload.getAll === 'function' &&
    typeof payload.has === 'function' &&
    typeof payload.set === 'function' &&
    payload[Symbol.toStringTag] === 'FormData'
  );
}

function formDataToStream(formData) {
  const encoder = new TextEncoder();
  const boundary = `----formdata-${randomUUID()}`;
  const prefix = `--${boundary}\r\nContent-Disposition: form-data`;
  const escape = (str) => str.replace(/\n/g, '%0A').replace(/\r/g, '%0D').replace(/"/g, '%22');
  const normalizeLinefeeds = (value) => value.replace(/\r?\n|\r/g, '\r\n');
  const linebreak = new Uint8Array([13, 10]);

  async function* parts() {
    for (const [name, value] of formData) {
      if (typeof value === 'string') {
        yield encoder.encode(`${prefix}; name="${escape(normalizeLinefeeds(name))}"\r\n\r\n`);
        yield encoder.encode(`${normalizeLinefeeds(value)}\r\n`);
      } else {
        let header = `${prefix}; name="${escape(normalizeLinefeeds(name))}"`;
        if (value.name) header += `; filename="${escape(value.name)}"`;
        header += `\r\nContent-Type: ${value.type || 'application/octet-stream'}\r\n\r\n`;
        yield encoder.encode(header);
        if (value.stream) yield* value.stream();
        else yield value;
        yield linebreak;
      }
    }
    yield encoder.encode(`--${boundary}--`);
  }

  return { stream: Readable.from(parts()), contentType: `multipart/form-data; boundary=${boundary}` };
}

module.exports = { isFormDataLike, formDataToStream };
