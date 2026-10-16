// Files of multipart/form-data requests, with multer's API (Express's middleware of uploads), read by the parser of
// @xufa/http (./multipart.js) instead of busboy:
//
//   const multer = require('@xufa/http/multer');
//   const upload = multer({ storage: multer.memoryStorage(), defParamCharset: 'utf8' });
//   app.post('/photos', upload.single('photo'), (req, res) => res.send(req.file.originalname));
//
// single(name): req.file; array(name, maxCount) and any(): req.files (a list); fields([{ name, maxCount }]):
// req.files by field; none(): fields only. The text fields are in req.body (names as a[b][0] nested, as multer's
// append-field makes them). Files: { fieldname, originalname, encoding, mimetype } and what the storage adds:
// memoryStorage() { buffer, size }, diskStorage({ destination, filename }) { destination, filename, path, size } (or
// `dest`). Options: limits (fieldNameSize, fieldSize, fields, fileSize, files, parts), fileFilter(req, file, cb),
// preservePath, defParamCharset ('latin1' as multer's; 'utf8' reads names as browsers send them). Errors: MulterError
// (code LIMIT_PART_COUNT, LIMIT_FILE_SIZE, LIMIT_FILE_COUNT, LIMIT_FIELD_KEY, LIMIT_FIELD_VALUE, LIMIT_FIELD_COUNT,
// LIMIT_UNEXPECTED_FILE, MISSING_FIELD_NAME; field), and those of the parser and the storage. A request that is not
// multipart goes on as it is.
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MultipartParser } from './multipart.js';

const MESSAGES = {
  LIMIT_PART_COUNT: 'Too many parts',
  LIMIT_FILE_SIZE: 'File too large',
  LIMIT_FILE_COUNT: 'Too many files',
  LIMIT_FIELD_KEY: 'Field name too long',
  LIMIT_FIELD_VALUE: 'Field value too long',
  LIMIT_FIELD_COUNT: 'Too many fields',
  LIMIT_UNEXPECTED_FILE: 'Unexpected field',
  MISSING_FIELD_NAME: 'Field name missing',
};

class MulterError extends Error {
  constructor(code, field) {
    super(MESSAGES[code]);
    this.name = 'MulterError';
    this.code = code;
    if (field) this.field = field;
  }
}

// --- Text fields: names with [] and [key] nested (the meaning of append-field, the W3C's JSON form encoding) --------

// The steps of a name: 'a[b][0]' -> a (object), b (array), 0; or the whole name when it does not parse.
function stepsOf(key) {
  const whole = [{ type: 'object', key, last: true }];
  const first = /^[^[]*/.exec(key)[0];
  if (!first) return whole;
  let tail = { type: 'object', key: first };
  const steps = [tail];
  let at = first.length;
  while (at < key.length) {
    if (key[at] === '[' && key[at + 1] === ']') {
      at += 2;
      tail.append = true;
      if (at !== key.length) return whole;
      continue;
    }
    const rest = key.slice(at);
    const digits = /^\[(\d+)\]/.exec(rest);
    if (digits) {
      at += digits[0].length;
      tail.nextType = 'array';
      tail = { type: 'array', key: Number.parseInt(digits[1], 10) };
      steps.push(tail);
      continue;
    }
    const name = /^\[([^\]]+)\]/.exec(rest);
    if (name) {
      at += name[0].length;
      tail.nextType = 'object';
      tail = { type: 'object', key: name[1] };
      steps.push(tail);
      continue;
    }
    return whole;
  }
  tail.last = true;
  return steps;
}

const kindOf = (value) => {
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  return typeof value === 'object' ? 'object' : 'scalar';
};

function setLast(context, step, current, value) {
  switch (kindOf(current)) {
    case 'undefined':
      context[step.key] = step.append ? [value] : value;
      break;
    case 'array':
      context[step.key].push(value);
      break;
    case 'object':
      return setLast(current, { type: 'object', key: '', last: true }, current[''], value);
    default:
      context[step.key] = [context[step.key], value];
  }
  return context;
}

function setStep(context, step, current, value) {
  if (step.last) return setLast(context, step, current, value);
  switch (kindOf(current)) {
    case 'undefined':
      context[step.key] = step.nextType === 'array' ? [] : Object.create(null);
      return context[step.key];
    case 'object':
      return context[step.key];
    case 'array': {
      if (step.nextType === 'array') return current;
      const object = Object.create(null);
      context[step.key] = object;
      current.forEach((item, i) => {
        if (item !== undefined) object[String(i)] = item;
      });
      return object;
    }
    default: {
      const object = Object.create(null);
      object[''] = current;
      context[step.key] = object;
      return object;
    }
  }
}

function appendField(store, key, value) {
  stepsOf(key).reduce((context, step) => setStep(context, step, context[step.key], value), store);
}

// --- Storages ------------------------------------------------------------------------------------------------------

class MemoryStorage {
  _handleFile(req, file, cb) {
    const chunks = [];
    file.stream.on('data', (chunk) => chunks.push(chunk));
    file.stream.on('end', () => {
      const buffer = Buffer.concat(chunks);
      cb(null, { buffer, size: buffer.length });
    });
  }

  _removeFile(req, file, cb) {
    delete file.buffer;
    cb(null);
  }
}

class DiskStorage {
  constructor(options = {}) {
    this.getFilename =
      options.filename ||
      ((req, file, cb) => crypto.randomBytes(16, (err, raw) => cb(err, err ? undefined : raw.toString('hex'))));
    if (typeof options.destination === 'string') {
      fs.mkdirSync(options.destination, { recursive: true });
      this.getDestination = (req, file, cb) => cb(null, options.destination);
    } else {
      this.getDestination = options.destination || ((req, file, cb) => cb(null, os.tmpdir()));
    }
  }

  _handleFile(req, file, cb) {
    this.getDestination(req, file, (err, destination) => {
      if (err) return cb(err);
      return this.getFilename(req, file, (nameError, filename) => {
        if (nameError) return cb(nameError);
        const finalPath = path.join(destination, filename);
        const out = fs.createWriteStream(finalPath);
        file.stream.pipe(out);
        out.on('error', cb);
        out.on('finish', () => cb(null, { destination, filename, path: finalPath, size: out.bytesWritten }));
        return undefined;
      });
    });
  }

  _removeFile(req, file, cb) {
    const { path: filePath } = file;
    delete file.destination;
    delete file.filename;
    delete file.path;
    fs.unlink(filePath, cb);
  }
}

const memoryStorage = () => new MemoryStorage();
const diskStorage = (options) => new DiskStorage(options);

// --- The middleware ------------------------------------------------------------------------------------------------

// Whether the request has a multipart body (type-is's: a body, Transfer-Encoding or Content-Length, and a type
// multipart/*).
function isMultipart(req) {
  const { headers } = req;
  const hasBody =
    headers['transfer-encoding'] !== undefined || !Number.isNaN(Number.parseInt(headers['content-length'], 10));
  if (!hasBody) return false;
  const type = headers['content-type'];
  return typeof type === 'string' && /^\s*multipart\/[^\s;]+/i.test(type);
}

// Where the files go in the request: VALUE (req.file), ARRAY (req.files), OBJECT (req.files by field), NONE.
class FileAppender {
  constructor(strategy, req) {
    this.strategy = strategy;
    this.req = req;
    if (strategy === 'ARRAY') req.files = [];
    else if (strategy === 'OBJECT') req.files = Object.create(null);
  }

  insertPlaceholder(file) {
    const placeholder = { fieldname: file.fieldname };
    if (this.strategy === 'ARRAY') this.req.files.push(placeholder);
    else if (this.strategy === 'OBJECT') {
      if (this.req.files[file.fieldname]) this.req.files[file.fieldname].push(placeholder);
      else this.req.files[file.fieldname] = [placeholder];
    }
    return placeholder;
  }

  removePlaceholder(placeholder) {
    const remove = (list) => {
      const at = list.indexOf(placeholder);
      if (at !== -1) list.splice(at, 1);
    };
    if (this.strategy === 'ARRAY') remove(this.req.files);
    else if (this.strategy === 'OBJECT') {
      if (this.req.files[placeholder.fieldname].length === 1) delete this.req.files[placeholder.fieldname];
      else remove(this.req.files[placeholder.fieldname]);
    }
  }

  replacePlaceholder(placeholder, file) {
    if (this.strategy === 'VALUE') {
      this.req.file = file;
      return;
    }
    delete placeholder.fieldname;
    Object.assign(placeholder, file);
  }
}

// The stream of the request read to its end (and left), as multer drains it.
function drain(req) {
  req.on('readable', () => {
    while (req.read() !== null);
  });
}

// Uploaded files removed by the storage, one after another; their errors kept.
function removeUploadedFiles(files, remove, cb) {
  const errors = [];
  if (files.length === 0) return cb(null, errors);
  const next = (i) => {
    remove(files[i], (err) => {
      if (err) {
        err.file = files[i];
        err.field = files[i].fieldname;
        errors.push(err);
      }
      if (i < files.length - 1) setImmediate(() => next(i + 1));
      else cb(null, errors);
    });
  };
  next(0);
  return undefined;
}

function makeMiddleware(setup) {
  return function multerMiddleware(req, res, next) {
    if (!isMultipart(req)) return next();
    const { limits, storage, fileFilter, fileStrategy, preservePath, defParamCharset } = setup();
    req.body = Object.create(null);
    let parser;
    let finished = false;
    let readFinished = false;
    let failed = false;
    const writes = Object.assign(new EventEmitter(), { count: 0 });
    const uploaded = [];

    const done = (err) => {
      if (finished) return;
      finished = true;
      if (parser) {
        req.unpipe(parser);
        setImmediate(() => parser.removeAllListeners());
      }
      drain(req);
      req.resume();
      // (An error waits for the rest of the body to come, so that the client is not cut while it sends.)
      if (err && req.readable && !req.destroyed) {
        let called = false;
        const after = () => {
          if (called) return;
          called = true;
          next(err);
        };
        req.once('end', after);
        req.once('error', after);
        req.once('close', after);
        return;
      }
      next(err);
    };
    const maybeDone = () => {
      if (readFinished && writes.count === 0 && !failed) done();
    };
    const abort = (error, now) => {
      if (failed) return;
      failed = true;
      const finish = () =>
        removeUploadedFiles(
          uploaded,
          (file, cb) => storage._removeFile(req, file, cb),
          (err, storageErrors) => {
            if (err) return done(err);
            error.storageErrors = storageErrors;
            return done(error);
          }
        );
      if (now || writes.count === 0) finish();
      else writes.once('zero', finish);
    };
    const abortWith = (code, field) => abort(new MulterError(code, field));
    const decrement = () => {
      writes.count -= 1;
      if (writes.count === 0) writes.emit('zero');
    };
    const requestFailed = (err) => {
      if (finished) return;
      if (parser) {
        req.unpipe(parser);
        parser.destroy(err);
      }
      abort(err, true);
    };

    req.on('error', (err) => requestFailed(err || new Error('Request error')));
    req.on('aborted', () => requestFailed(new Error('Request aborted')));
    req.on('close', () => {
      if (req.readableEnded) return;
      requestFailed(new Error('Request closed'));
    });

    try {
      parser = new MultipartParser({ headers: req.headers, limits, preservePath, defParamCharset });
    } catch (err) {
      return next(err);
    }
    const appender = new FileAppender(fileStrategy, req);
    const nameTooLong = (name) =>
      limits && Object.hasOwn(limits, 'fieldNameSize') && name.length > limits.fieldNameSize;

    parser.on('field', (fieldname, value, { nameTruncated, valueTruncated }) => {
      if (fieldname == null) return abortWith('MISSING_FIELD_NAME');
      if (nameTruncated) return abortWith('LIMIT_FIELD_KEY');
      if (valueTruncated) return abortWith('LIMIT_FIELD_VALUE', fieldname);
      if (nameTooLong(fieldname)) return abortWith('LIMIT_FIELD_KEY');
      return appendField(req.body, fieldname, value);
    });

    parser.on('file', (fieldname, stream, { filename, encoding, mimeType }) => {
      let counted = false;
      stream.on('error', (err) => {
        if (counted) decrement();
        abort(err);
      });
      if (fieldname == null) return abortWith('MISSING_FIELD_NAME');
      // (A file input left empty: no file.)
      if (!filename) return stream.resume();
      if (nameTooLong(fieldname)) return abortWith('LIMIT_FIELD_KEY');
      const file = { fieldname, originalname: filename, encoding, mimetype: mimeType };
      const placeholder = appender.insertPlaceholder(file);
      fileFilter(req, file, (err, include) => {
        if (failed) {
          appender.removePlaceholder(placeholder);
          return stream.resume();
        }
        if (err) {
          appender.removePlaceholder(placeholder);
          return abort(err);
        }
        if (!include) {
          appender.removePlaceholder(placeholder);
          return stream.resume();
        }
        let aborting = false;
        counted = true;
        writes.count += 1;
        Object.defineProperty(file, 'stream', { configurable: true, enumerable: false, value: stream });
        stream.on('limit', () => {
          aborting = true;
          abortWith('LIMIT_FILE_SIZE', fieldname);
        });
        return storage._handleFile(req, file, (storageError, info) => {
          if (aborting) {
            appender.removePlaceholder(placeholder);
            uploaded.push({ ...file, ...info });
            return decrement();
          }
          if (storageError) {
            appender.removePlaceholder(placeholder);
            decrement();
            return abort(storageError);
          }
          const stored = { ...file, ...info };
          appender.replacePlaceholder(placeholder, stored);
          uploaded.push(stored);
          decrement();
          return maybeDone();
        });
      });
      return undefined;
    });

    parser.on('error', (err) => abort(err));
    parser.on('partsLimit', () => abortWith('LIMIT_PART_COUNT'));
    parser.on('filesLimit', () => abortWith('LIMIT_FILE_COUNT'));
    parser.on('fieldsLimit', () => abortWith('LIMIT_FIELD_COUNT'));
    parser.on('close', () => {
      readFinished = true;
      maybeDone();
    });
    req.pipe(parser);
    return undefined;
  };
}

const allowAll = (req, file, cb) => cb(null, true);

class Multer {
  constructor(options) {
    if (options.storage) this.storage = options.storage;
    else if (options.dest) this.storage = diskStorage({ destination: options.dest });
    else this.storage = memoryStorage();
    this.limits = options.limits;
    this.preservePath = options.preservePath;
    this.defParamCharset = options.defParamCharset || 'latin1';
    this.fileFilter = options.fileFilter || allowAll;
  }

  // A middleware taking the files of these fields ({ name, maxCount }), put as the strategy says.
  makeMiddleware(fields, fileStrategy) {
    return makeMiddleware(() => {
      const left = Object.create(null);
      for (const field of fields) left[field.name] = typeof field.maxCount === 'number' ? field.maxCount : Infinity;
      const fileFilter = (req, file, cb) => {
        if ((left[file.fieldname] || 0) <= 0) return cb(new MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
        left[file.fieldname] -= 1;
        return this.fileFilter(req, file, cb);
      };
      return { ...this.settings(), fileFilter, fileStrategy };
    });
  }

  settings() {
    return {
      limits: this.limits,
      preservePath: this.preservePath,
      defParamCharset: this.defParamCharset,
      storage: this.storage,
    };
  }

  single(name) {
    return this.makeMiddleware([{ name, maxCount: 1 }], 'VALUE');
  }

  array(name, maxCount) {
    return this.makeMiddleware([{ name, maxCount }], 'ARRAY');
  }

  fields(fields) {
    return this.makeMiddleware(fields, 'OBJECT');
  }

  none() {
    return this.makeMiddleware([], 'NONE');
  }

  any() {
    return makeMiddleware(() => ({ ...this.settings(), fileFilter: this.fileFilter, fileStrategy: 'ARRAY' }));
  }
}

function multer(options) {
  if (options === undefined) return new Multer({});
  if (typeof options === 'object' && options !== null) return new Multer(options);
  throw new TypeError('Expected object for argument options');
}

multer.diskStorage = diskStorage;
multer.memoryStorage = memoryStorage;
multer.MulterError = MulterError;

export { multer, diskStorage, memoryStorage, MulterError, appendField, removeUploadedFiles };
