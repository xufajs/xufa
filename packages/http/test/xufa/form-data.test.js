// Tests of xufa (not ported) of @xufa/http/form-data, beyond form-data's own (test/form-data): its boundary is of crypto,
// a form goes through @xufa/http's multer as sent (UTF-8 names of files), listeners before pipe() miss nothing, the
// length of a range of a file without a start, how clients tell it (axios), and its types of files.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import FormData from '../../form-data.js';
import multer from '../../multer.js';

const require = createRequire(import.meta.url);

// The body a form writes, piped.
function bodyOf(form) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const sink = new PassThrough();
    sink.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    sink.on('end', () => resolve(Buffer.concat(chunks)));
    form.on('error', reject);
    form.pipe(sink);
  });
}

describe('@xufa/http/form-data', () => {
  it('is the same class by import and by require, and says it is a FormData (not a spec one: no iterator)', () => {
    expect(require('../../form-data.js')).toBe(FormData);
    const form = new FormData();
    expect(Object.prototype.toString.call(form)).toBe('[object FormData]');
    expect(String(form)).toBe('[object FormData]');
    // (axios sends a spec FormData itself, and pipes this one with its getHeaders().)
    expect(form[Symbol.iterator]).toBeUndefined();
    expect(typeof form.pipe).toBe('function');
  });

  it('takes its boundaries from crypto, not Math.random', () => {
    const random = Math.random;
    Math.random = () => 0.5;
    try {
      const boundaries = new Set(Array.from({ length: 20 }, () => new FormData().getBoundary()));
      expect(boundaries.size).toBe(20);
      for (const boundary of boundaries) expect(boundary).toMatch(/^-{26}[0-9a-f]{24}$/);
    } finally {
      Math.random = random;
    }
  });

  it('is read by multer as it was sent: fields, a Buffer with its name (UTF-8) and type, a stream of a file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-form-data-'));
    const file = path.join(dir, 'notes.txt');
    fs.writeFileSync(file, 'line 1\nline 2');
    const form = new FormData();
    form.append('title', 'Dune');
    form.append('count', 3);
    form.append('cover', Buffer.from([1, 2, 3, 255]), 'portada é.png');
    form.append('notes', fs.createReadStream(file));
    // (Its length is asked before it is sent, as clients do.)
    const length = await new Promise((resolve, reject) => form.getLength((err, n) => (err ? reject(err) : resolve(n))));
    const body = await bodyOf(form);
    expect(body.length).toBe(length);
    const req = Readable.from([body]);
    req.headers = { ...form.getHeaders(), 'content-length': String(body.length) };
    const err = await new Promise((resolve) =>
      multer({ storage: multer.memoryStorage(), defParamCharset: 'utf8' }).any()(req, null, resolve)
    );
    expect(err).toBeUndefined();
    expect(req.body).toEqual({ title: 'Dune', count: '3' });
    expect(req.files.map((f) => [f.fieldname, f.originalname, f.mimetype, [...f.buffer].length])).toEqual([
      ['cover', 'portada é.png', 'image/png', 4],
      ['notes', 'notes.txt', 'text/plain', 13],
    ]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("does not start for a 'data' listener: what listens before pipe() gets all of it", async () => {
    const form = new FormData();
    form.append('a', 'x'.repeat(1000));
    form.append('b', Readable.from([Buffer.from('streamed')]), { filename: 'b.bin' });
    let heard = 0;
    form.on('data', (chunk) => {
      heard += chunk.length;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(heard).toBe(0);
    const body = await bodyOf(form);
    expect(heard).toBe(body.length);
    expect(body.toString()).toContain('streamed');
  });

  it('counts the range of a file a stream reads: an end without a start, past the end of the file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-form-data-'));
    const file = path.join(dir, 'data.txt');
    fs.writeFileSync(file, '0123456789');
    const lengthOf = (options) =>
      new Promise((resolve, reject) => {
        const form = new FormData();
        form.append('f', fs.createReadStream(file, options));
        form.getLength((err, length) => (err ? reject(err) : resolve(length - form._overheadLength - form._lastBoundary().length)));
      });
    expect(await lengthOf({ end: 3 })).toBe(4);
    expect(await lengthOf({ start: 2, end: 5 })).toBe(4);
    expect(await lengthOf({ start: 7 })).toBe(3);
    expect(await lengthOf({ start: 5, end: 100 })).toBe(5);
    expect(await lengthOf({})).toBe(10);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('types files by the table of @xufa/http (mime-db 1.54): images, texts, and .js as text/javascript', () => {
    const form = new FormData();
    const header = (name) => form._multiPartHeader('f', Buffer.alloc(1), { filename: name });
    expect(header('a.png')).toContain('Content-Type: image/png');
    expect(header('a.JPG')).toContain('Content-Type: image/jpeg');
    expect(header('a.js')).toContain('Content-Type: text/javascript');
    expect(header('a.unknownext')).toContain('Content-Type: application/octet-stream');
    expect(form._multiPartHeader('f', 'text', {})).not.toContain('Content-Type');
  });
});
