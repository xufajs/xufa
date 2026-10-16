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
import { MultipartParser } from './multipart.js';

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

// A multipart body (RFC 7578) read as it comes (./multipart.js): its fields and files into an object; past a limit,
// or a body not well made, the error (and the rest of the body is not read).
function readMultipart(request, payload, limits, bodyLimit, next) {
  const body = {};
  let parts = 0;
  let files = 0;
  let fields = 0;
  let bytes = 0;
  let failed = false;
  let parser;
  const fail = (err) => {
    if (failed) return;
    failed = true;
    payload.unpipe(parser);
    parser.destroy();
    payload.resume();
    next(err);
  };
  try {
    // (Limits one past ours: busboy's tell of a value as long as the limit; ours refuse what passes it.)
    parser = new MultipartParser({
      headers: request.headers,
      limits: { fileSize: limits.fileSize + 1, fieldSize: limits.fieldSize + 1 },
      defParamCharset: 'utf8',
    });
  } catch {
    payload.resume();
    return next(createError(400, 'A multipart body needs the boundary of its content type'));
  }
  const counted = (name) => {
    if (name === undefined) {
      fail(createError(400, 'A part of the multipart body has no name'));
      return false;
    }
    parts += 1;
    if (parts > limits.parts) {
      fail(createError(400, `A multipart body has at most ${limits.parts} parts`));
      return false;
    }
    return true;
  };
  const field = (name, value) => {
    fields += 1;
    if (fields > limits.fields) return fail(createError(400, `A form sends at most ${limits.fields} fields`));
    if (Buffer.byteLength(value) > limits.fieldSize) {
      return fail(createError(413, `A field has at most ${limits.fieldSize} bytes`));
    }
    return put(body, name, value);
  };
  parser.on('field', (name, value, { valueTruncated }) => {
    if (!counted(name)) return;
    if (valueTruncated) {
      fail(createError(413, `A field has at most ${limits.fieldSize} bytes`));
      return;
    }
    field(name, value);
  });
  parser.on('file', (name, stream, { filename, contentType }) => {
    if (!counted(name)) {
      stream.resume();
      return;
    }
    const chunks = [];
    let size = 0;
    stream.on('data', (chunk) => {
      chunks.push(chunk);
      size += chunk.length;
    });
    stream.on('limit', () => fail(createError(413, `A file has at most ${limits.fileSize} bytes`)));
    // (Its stream ends with an error when the form stops: the first error is the answer.)
    stream.on('error', (err) => fail(err));
    stream.on('end', () => {
      if (failed) return;
      // (A part of application/octet-stream without a name of a file is a field.)
      if (filename === undefined) {
        field(name, Buffer.concat(chunks).toString('utf8'));
        return;
      }
      files += 1;
      if (files > limits.files) {
        fail(createError(413, `A form sends at most ${limits.files} files`));
        return;
      }
      // An input of a file left empty sends a part with no name of a file and no data: no file.
      if (filename !== '' || size > 0) {
        put(body, name, {
          filename,
          contentType: contentType || 'application/octet-stream',
          size,
          data: Buffer.concat(chunks, size),
        });
      }
    });
  });
  parser.on('error', (err) => {
    const message = /end of form/.test(err.message)
      ? 'The multipart body ends before its last boundary'
      : 'A part of the multipart body is not well made';
    fail(createError(400, parser.parts < 0 ? 'The multipart body has no boundary' : message));
  });
  parser.on('close', () => {
    if (!failed && parser.writableFinished) {
      failed = true;
      next(null, body);
    }
  });
  payload.on('data', (chunk) => {
    bytes += chunk.length;
    if (bytes > bodyLimit) fail(createError(413, 'Request body is too large'));
  });
  payload.on('error', (err) => fail(err));
  payload.pipe(parser);
  return undefined;
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
    app.addContentTypeParser('multipart/form-data', (request, payload, next) =>
      readMultipart(request, payload, limits, bodyLimit || 20 * MIB, next)
    );
  }
  done();
}

formBody[Symbol.for('skip-override')] = true;
formBody[Symbol.for('fastify.display-name')] = 'formBody';
formBody[Symbol.for('plugin-meta')] = { name: 'formBody' };

export { formBody, parseUrlencoded };
