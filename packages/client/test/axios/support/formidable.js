// The part of formidable 3 that axios's tests use, on @xufa/http's parser of multipart bodies: new IncomingForm(),
// parse(req, callback(err, fields, files)): fields and files by name as arrays (formidable 3), each file
// { filepath, newFilename, originalFilename (with its folders), mimetype, size } once written to the system's temp
// folder. A part is a file when it has a filename.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { MultipartParser } from '@xufa/http/lib/multipart';

class IncomingForm extends EventEmitter {
  constructor(options = {}) {
    super();
    this.uploadDir = options.uploadDir || os.tmpdir();
  }

  parse(req, callback) {
    if (callback) {
      const fields = {};
      const files = {};
      const add = (target, name, value) => (target[name] ||= []).push(value);
      this.on('field', (name, value) => add(fields, name, value));
      this.on('file', (name, file) => add(files, name, file));
      this.once('error', (err) => callback(err));
      this.once('end', () => callback(null, fields, files));
    }
    let parser;
    try {
      parser = new MultipartParser({ headers: req.headers, defParamCharset: 'utf8', preservePath: true });
    } catch (err) {
      process.nextTick(() => this.emit('error', err));
      return this;
    }
    let pending = 1;
    const done = () => {
      pending -= 1;
      if (pending === 0) this.emit('end');
    };
    parser.on('field', (name, value) => this.emit('field', name, value));
    parser.on('file', (name, stream, info) => {
      pending += 1;
      if (info.filename === undefined) {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
          this.emit('field', name, Buffer.concat(chunks).toString('utf8'));
          done();
        });
        return;
      }
      const newFilename = crypto.randomBytes(16).toString('hex');
      const file = {
        filepath: path.join(this.uploadDir, newFilename),
        newFilename,
        originalFilename: info.filename,
        mimetype: info.mimeType,
        size: 0,
      };
      const out = fs.createWriteStream(file.filepath);
      stream.on('data', (chunk) => {
        file.size += chunk.length;
      });
      stream.pipe(out);
      out.on('finish', () => {
        fs.rm(file.filepath, { force: true }, () => {});
        this.emit('file', name, file);
        done();
      });
    });
    parser.on('error', (err) => this.emit('error', err));
    parser.on('close', done);
    req.pipe(parser);
    return this;
  }
}

export { IncomingForm };
export default { IncomingForm };
