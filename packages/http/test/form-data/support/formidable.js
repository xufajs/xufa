// The part of formidable 1 that form-data's tests use, on @xufa/http's parser of multipart bodies: new IncomingForm({
// uploadDir }), parse(req), and its events: 'field' (name, value), 'file' (name, { name, type, path, size }) once the
// file is in uploadDir, 'end' after all, 'error'; or parse(req, callback(err, fields, files)). As formidable 1, a part
// is a file when it has a filename (a part without one is a field, whatever its type), names of files are read as
// UTF-8 and keep their folders but what is before a backslash (%22 is ", &#NNNN; its character).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { MultipartParser } = require('../../../lib/multipart.js');

class IncomingForm extends EventEmitter {
  constructor(options = {}) {
    super();
    this.uploadDir = options.uploadDir || require('os').tmpdir();
  }

  parse(req, callback) {
    if (callback) {
      const fields = {};
      const files = {};
      this.on('field', (name, value) => {
        fields[name] = value;
      });
      this.on('file', (name, file) => {
        files[name] = file;
      });
      this.on('error', (err) => callback(err));
      this.on('end', () => callback(null, fields, files));
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
      const file = {
        name: info.filename
          .slice(info.filename.lastIndexOf(String.fromCharCode(92)) + 1)
          .replace(/%22/g, '"')
          .replace(/&#([\d]{4});/g, (all, code) => String.fromCharCode(code)),
        type: info.mimeType,
        path: path.join(this.uploadDir, `upload_${crypto.randomBytes(16).toString('hex')}`),
        size: 0,
      };
      const out = fs.createWriteStream(file.path);
      stream.on('data', (chunk) => {
        file.size += chunk.length;
      });
      stream.pipe(out);
      out.on('finish', () => {
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

module.exports = { IncomingForm };
