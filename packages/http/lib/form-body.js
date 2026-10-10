// The bodies of HTML forms (as Django's request.POST and request.FILES, and @fastify/formbody with a multipart parser):
// application/x-www-form-urlencoded and multipart/form-data become request.body, an object of the fields. A field
// given more than once, or whose name ends with [], is a list; the files of a multipart body are objects
// { filename, contentType, size, data } (data: a Buffer), in the body by their field.
//
//   app.register(xufa.formBody);
//   app.post('/books', async (request) => request.body); // { title: 'Dune', genre: ['1', '3'], cover: { filename... } }
//
// Options: bodyLimit (the most bytes of a body: 1 MiB for urlencoded bodies, 20 MiB for multipart ones), and limits
// of multipart bodies: files (10), fileSize (10 MiB), fields (1000), fieldSize (1 MiB), parts (1000). Past a limit the
// answer is 413 (a file or a body too large) or 400 (too many parts, or a body that is not well made).
// An error of a body: its status (400, 413) and a code.
function createError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = statusCode === 413 ? 'XUFA_ERR_FORM_TOO_LARGE' : 'XUFA_ERR_FORM_INVALID';
  return err;
}

const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
const MIB = 1024 * 1024;

// A field into the body: a list when it comes again or its name ends with [].
function put(body, rawName, value) {
  const list = rawName.endsWith('[]');
  const name = list ? rawName.slice(0, -2) : rawName;
  if (FORBIDDEN.has(name)) return;
  if (Object.hasOwn(body, name)) {
    body[name] = Array.isArray(body[name]) ? [...body[name], value] : [body[name], value];
  } else body[name] = list ? [value] : value;
}

function parseUrlencoded(text) {
  const body = {};
  for (const [name, value] of new URLSearchParams(text)) put(body, name, value);
  return body;
}

// The value of a parameter of a header (name="x"; filename="y"), with quotes and RFC 5987 (filename*=UTF-8''...).
function paramOf(header, param) {
  const star = new RegExp(`(?:^|;)\\s*${param}\\*=([^;]*)`, 'i').exec(header);
  if (star) {
    const value = star[1].trim().replace(/^"|"$/g, '');
    const match = /^([\w-]+)'[^']*'(.*)$/.exec(value);
    try {
      return decodeURIComponent(match ? match[2] : value);
    } catch {
      return match ? match[2] : value;
    }
  }
  const quoted = new RegExp(`(?:^|;)\\s*${param}="((?:[^"\\\\]|\\\\.)*)"`, 'i').exec(header);
  if (quoted) return quoted[1].replace(/\\(.)/g, '$1');
  const plain = new RegExp(`(?:^|;)\\s*${param}=([^;\\s]*)`, 'i').exec(header);
  return plain ? plain[1] : null;
}

// A multipart body (RFC 7578) of a boundary: its fields and files into an object.
function parseMultipart(buffer, boundary, limits) {
  const body = {};
  const delimiter = Buffer.from(`--${boundary}`);
  let at = buffer.indexOf(delimiter);
  if (at === -1) throw createError(400, 'The multipart body has no boundary');
  let parts = 0;
  let files = 0;
  let fields = 0;
  for (;;) {
    at += delimiter.length;
    // The last boundary ends with --.
    if (buffer[at] === 0x2d && buffer[at + 1] === 0x2d) return body;
    if (buffer[at] === 0x0d && buffer[at + 1] === 0x0a) at += 2;
    else throw createError(400, 'A part of the multipart body is not well made');
    const headersEnd = buffer.indexOf('\r\n\r\n', at);
    if (headersEnd === -1) throw createError(400, 'A part of the multipart body has no end of its headers');
    const headers = {};
    for (const line of buffer.toString('utf8', at, headersEnd).split('\r\n')) {
      const colon = line.indexOf(':');
      if (colon > 0) headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
    }
    const next = buffer.indexOf(Buffer.concat([Buffer.from('\r\n'), delimiter]), headersEnd + 4);
    if (next === -1) throw createError(400, 'The multipart body ends before its last boundary');
    const data = buffer.subarray(headersEnd + 4, next);
    parts += 1;
    if (parts > limits.parts) throw createError(400, `A multipart body has at most ${limits.parts} parts`);
    const disposition = headers['content-disposition'] || '';
    const name = paramOf(disposition, 'name');
    if (name === null) throw createError(400, 'A part of the multipart body has no name');
    const filename = paramOf(disposition, 'filename');
    if (filename !== null) {
      files += 1;
      if (files > limits.files) throw createError(413, `A form sends at most ${limits.files} files`);
      if (data.length > limits.fileSize) throw createError(413, `A file has at most ${limits.fileSize} bytes`);
      // An input of a file left empty sends a part with no name of a file and no data: no file.
      if (filename !== '' || data.length > 0) {
        put(body, name, {
          filename,
          contentType: headers['content-type'] || 'application/octet-stream',
          size: data.length,
          data: Buffer.from(data),
        });
      }
    } else {
      fields += 1;
      if (fields > limits.fields) throw createError(400, `A form sends at most ${limits.fields} fields`);
      if (data.length > limits.fieldSize) throw createError(413, `A field has at most ${limits.fieldSize} bytes`);
      put(body, name, data.toString('utf8'));
    }
    at = next + 2;
  }
}

function formBody(app, options, done) {
  const {
    bodyLimit,
    multipart = true,
    files = 10,
    fileSize = 10 * MIB,
    fields = 1000,
    fieldSize = MIB,
    parts = 1000,
  } = options || {};
  const limits = { files, fileSize, fields, fieldSize, parts };
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string', bodyLimit: bodyLimit || MIB },
    (request, text, next) => next(null, parseUrlencoded(text))
  );
  if (multipart) {
    app.addContentTypeParser(
      'multipart/form-data',
      { parseAs: 'buffer', bodyLimit: bodyLimit || 20 * MIB },
      (request, buffer, next) => {
        const boundary = paramOf(request.headers['content-type'] || '', 'boundary');
        if (!boundary) return next(createError(400, 'A multipart body needs the boundary of its content type'));
        try {
          return next(null, parseMultipart(buffer, boundary, limits));
        } catch (err) {
          return next(err);
        }
      }
    );
  }
  done();
}

formBody[Symbol.for('skip-override')] = true;
formBody[Symbol.for('fastify.display-name')] = 'formBody';
formBody[Symbol.for('plugin-meta')] = { name: 'formBody' };

export { formBody, parseUrlencoded, parseMultipart };
