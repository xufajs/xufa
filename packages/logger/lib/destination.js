// A destination writing to a file descriptor or a file, synchronously or buffered (what sonic-boom does for pino).
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const MAX_WRITE = 16 * 1024;
const RETRY_CODES = new Set(['EAGAIN', 'EBUSY']);

class Destination extends EventEmitter {
  constructor(options = {}) {
    super();
    const opts = typeof options === 'object' && options !== null ? options : { dest: options };
    const dest = opts.dest !== undefined ? opts.dest : opts.fd !== undefined ? opts.fd : 1;
    this.sync = opts.sync !== false;
    this.minLength = opts.minLength || 0;
    this.maxLength = opts.maxLength || 0;
    this.append = opts.append !== false;
    this.mkdir = opts.mkdir === true;
    this.fsync = opts.fsync === true;
    this.buf = '';
    this.writing = false;
    this.ending = false;
    this.destroyed = false;
    this.flushCallbacks = [];
    this.fd = -1;
    this.file = null;
    if (typeof dest === 'number') {
      this.fd = dest;
      process.nextTick(() => this.emit('ready'));
    } else {
      this.file = String(dest);
      this.open();
    }
    if (!this.sync) {
      this.onExit = () => this.flushSync();
      process.once('exit', this.onExit);
    }
  }

  open() {
    if (this.mkdir) fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.fd = fs.openSync(this.file, this.append ? 'a' : 'w');
    process.nextTick(() => this.emit('ready'));
  }

  write(data) {
    if (this.destroyed) throw new Error('Destination destroyed');
    if (this.sync) {
      this.writeAllSync(data);
      return true;
    }
    if (this.maxLength && this.buf.length + data.length > this.maxLength) {
      this.emit('drop', data);
      return this.buf.length < MAX_WRITE;
    }
    this.buf += data;
    if (!this.writing && this.buf.length >= this.minLength) this.actualWrite();
    return this.buf.length < MAX_WRITE;
  }

  writeAllSync(data) {
    let buffer = Buffer.from(data);
    while (buffer.length > 0) {
      try {
        const written = fs.writeSync(this.fd, buffer);
        buffer = buffer.subarray(written);
      } catch (err) {
        if (!RETRY_CODES.has(err.code)) throw err;
      }
    }
    if (this.fsync) fs.fsyncSync(this.fd);
  }

  actualWrite() {
    this.writing = true;
    const chunk = Buffer.from(this.buf);
    this.buf = '';
    const done = (err, written) => {
      if (err) {
        if (RETRY_CODES.has(err.code)) {
          setTimeout(() => fs.write(this.fd, chunk, done), 10);
          return;
        }
        this.writing = false;
        this.emit('error', err);
        return;
      }
      if (written < chunk.length) {
        this.buf = chunk.subarray(written).toString() + this.buf;
      }
      this.writing = false;
      if (this.buf.length > 0 && (this.buf.length >= this.minLength || this.flushCallbacks.length || this.ending)) {
        this.actualWrite();
        return;
      }
      this.emit('drain');
      this.afterFlush();
    };
    fs.write(this.fd, chunk, 0, chunk.length, null, done);
  }

  afterFlush() {
    if (this.writing || this.buf.length > 0) return;
    const callbacks = this.flushCallbacks;
    this.flushCallbacks = [];
    for (const cb of callbacks) cb();
    if (this.ending) this.close();
  }

  flush(cb) {
    if (this.sync || (!this.writing && this.buf.length === 0)) {
      if (cb) process.nextTick(cb);
      return;
    }
    if (cb) this.flushCallbacks.push(cb);
    if (!this.writing) this.actualWrite();
  }

  flushSync() {
    if (this.destroyed || this.buf.length === 0) return;
    if (this.writing) {
      // The pending asynchronous write finishes on its own; write what came after it.
      const rest = this.buf;
      this.buf = '';
      this.writeAllSync(rest);
      return;
    }
    const data = this.buf;
    this.buf = '';
    this.writeAllSync(data);
  }

  reopen(file) {
    if (this.file === null) return;
    this.flushSync();
    if (file) this.file = file;
    const old = this.fd;
    this.open();
    if (old > 2) fs.closeSync(old);
  }

  end() {
    if (this.destroyed || this.ending) return;
    this.ending = true;
    if (this.sync || (!this.writing && this.buf.length === 0)) {
      this.close();
      return;
    }
    if (!this.writing) this.actualWrite();
  }

  close() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.onExit) process.removeListener('exit', this.onExit);
    const finish = () => {
      this.emit('finish');
      this.emit('close');
    };
    if (this.fd > 2) {
      fs.close(this.fd, finish);
    } else {
      process.nextTick(finish);
    }
  }

  destroy() {
    this.buf = '';
    this.close();
  }
}

module.exports = { Destination };
