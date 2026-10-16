// Tests of xufa (not ported): the parser of multipart bodies read as they come (lib/multipart.js) and the multer of
// @xufa/http (multer.js) beyond multer's own tests: any split of the body in chunks, names of files in UTF-8,
// backpressure, limits and errors.
import { PassThrough, Writable } from 'node:stream';
import { MultipartParser } from '../../lib/multipart.js';
import multer from '../../multer.js';

const BOUNDARY = 'xufa-boundary';
const HEADERS = { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` };

// A body of parts: [name, value] fields and [name, { filename, type, data }] files (filename raw bytes as given).
function bodyOf(parts) {
  const chunks = [];
  for (const [name, value] of parts) {
    chunks.push(Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"`));
    if (typeof value === 'string') chunks.push(Buffer.from(`\r\n\r\n${value}\r\n`));
    else {
      chunks.push(Buffer.from('; filename="'), Buffer.from(value.filename), Buffer.from('"\r\n'));
      if (value.type) chunks.push(Buffer.from(`Content-Type: ${value.type}\r\n`));
      chunks.push(Buffer.from('\r\n'), value.data, Buffer.from('\r\n'));
    }
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Buffer.concat(chunks);
}

// What a parser tells of a body written in chunks of a size: [kind, name, value or bytes, info].
function parse(body, size, options = {}) {
  return new Promise((resolve, reject) => {
    const parser = new MultipartParser({ headers: HEADERS, ...options });
    const seen = [];
    parser.on('field', (name, value, info) => seen.push(['field', name, value, info.valueTruncated]));
    parser.on('file', (name, stream, info) => {
      const entry = ['file', name, null, info.filename, info.mimeType];
      seen.push(entry);
      const bytes = [];
      stream.on('data', (chunk) => bytes.push(chunk));
      stream.on('end', () => {
        entry[2] = Buffer.concat(bytes).toString('hex');
      });
    });
    for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit']) parser.on(event, () => seen.push([event]));
    parser.on('error', reject);
    parser.on('close', () => resolve(seen));
    for (let at = 0; at < body.length; at += size) parser.write(body.subarray(at, at + size));
    parser.end();
  });
}

const binary = Buffer.from(Array.from({ length: 600 }, (_, i) => (i * 37) % 256));
// (Bytes that begin a boundary inside a file: not one.)
const tricky = Buffer.concat([Buffer.from(`\r\n--${BOUNDARY.slice(0, 6)}`), binary.subarray(0, 40), Buffer.from('\r\n-')]);
const PARTS = [
  ['title', 'Dune'],
  ['photo', { filename: 'a.bin', type: 'application/octet-stream', data: binary }],
  ['empty', ''],
  ['tricky', { filename: 't.bin', type: 'image/png', data: tricky }],
  ['notes', 'line 1\r\nline 2'],
];

describe('MultipartParser', () => {
  it('reads the same fields and files from any split of the body in chunks (1 byte to all of it)', async () => {
    const body = bodyOf(PARTS);
    const whole = await parse(body, body.length);
    expect(whole).toEqual([
      ['field', 'title', 'Dune', false],
      ['file', 'photo', binary.toString('hex'), 'a.bin', 'application/octet-stream'],
      ['field', 'empty', '', false],
      ['file', 'tricky', tricky.toString('hex'), 't.bin', 'image/png'],
      ['field', 'notes', 'line 1\r\nline 2', false],
    ]);
    for (const size of [1, 2, 3, 5, 7, 13, 16, 17, 31, 64, 100, 257, 1000]) {
      expect({ size, seen: await parse(body, size) }).toEqual({ size, seen: whole });
    }
  });

  it('reads the same from large chunks, with boundaries and their tails on either side of where chunks are cut', async () => {
    // (Large chunks are read in place: what is pending is joined to their head only.)
    const big = Buffer.alloc(9000, 13);
    const parts = [
      ['a', { filename: 'a.bin', data: big }],
      ['b', 'x'.repeat(1100)],
      ['c', { filename: 'c.bin', data: Buffer.concat([big.subarray(0, 3000), Buffer.from(`\r\n--${BOUNDARY}`.slice(0, 9))]) }],
      ['d', { filename: 'd.bin', data: Buffer.alloc(5000, 45) }],
    ];
    const body = bodyOf(parts);
    const whole = await parse(body, body.length);
    expect(whole).toEqual([
      ['file', 'a', big.toString('hex'), 'a.bin', 'text/plain'],
      ['field', 'b', 'x'.repeat(1100), false],
      ['file', 'c', parts[2][1].data.toString('hex'), 'c.bin', 'text/plain'],
      ['file', 'd', parts[3][1].data.toString('hex'), 'd.bin', 'text/plain'],
    ]);
    for (let size = 2000; size < 12000; size += 487) {
      expect({ size, seen: await parse(body, size) }).toEqual({ size, seen: whole });
    }
  });

  it('decodes names of files as latin1 by default, as UTF-8 with defParamCharset, and by filename* always', async () => {
    const name = Buffer.from('résumé.txt', 'utf8');
    const body = bodyOf([['f', { filename: name, type: 'text/plain', data: Buffer.from('x') }]]);
    expect((await parse(body, 64))[0][3]).toBe(name.toString('latin1'));
    expect((await parse(body, 64, { defParamCharset: 'utf8' }))[0][3]).toBe('résumé.txt');
    const star = Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="f"; filename="x"; filename*=UTF-8''%C3%A9t%C3%A9.txt\r\n\r\nx\r\n--${BOUNDARY}--\r\n`
    );
    expect((await parse(star, 64))[0][3]).toBe('été.txt');
    // (A folder in the name is left out, unless preservePath.)
    const folder = bodyOf([['f', { filename: Buffer.from('a/b\\c.txt'), data: Buffer.from('x') }]]);
    expect([(await parse(folder, 64))[0][3], (await parse(folder, 64, { preservePath: true }))[0][3]]).toEqual([
      'c.txt',
      'a/b\\c.txt',
    ]);
  });

  it('limits: a field and a file cut at their size, and the parts past the counts told once and left', async () => {
    const body = bodyOf([
      ['a', '123456'],
      ['f', { filename: 'f.bin', data: Buffer.from('abcdefgh') }],
      ['b', '2'],
      ['c', '3'],
    ]);
    const seen = await parse(body, 5, { limits: { fieldSize: 4, fileSize: 3, fields: 2 } });
    expect(seen).toEqual([
      ['field', 'a', '1234', true],
      ['file', 'f', Buffer.from('abc').toString('hex'), 'f.bin', 'text/plain'],
      ['field', 'b', '2', false],
      ['fieldsLimit'],
    ]);
    const files = await parse(bodyOf([['f', { filename: '1', data: Buffer.from('1') }], ['g', { filename: '2', data: Buffer.from('2') }]]), 64, {
      limits: { files: 1 },
    });
    expect(files.map(([kind, name]) => [kind, name])).toEqual([['file', 'f'], ['filesLimit', undefined]]);
  });

  it('errors: no boundary, a form that does not end, a malformed header', async () => {
    expect(() => new MultipartParser({ headers: { 'content-type': 'multipart/form-data' } })).toThrow('Boundary not found');
    expect(() => new MultipartParser({ headers: { 'content-type': 'text/plain' } })).toThrow('Unsupported content type');
    await expect(parse(Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="a"\r\n\r\nno end`), 8)).rejects.toThrow(
      'Unexpected end of form'
    );
    await expect(parse(Buffer.from(`--${BOUNDARY}\r\nNot a header\r\n\r\nx\r\n--${BOUNDARY}--`), 8)).rejects.toThrow(
      'Malformed part header'
    );
  });

  it('holds the writes while a file is not read (backpressure), and goes on when it is', async () => {
    const parser = new MultipartParser({ headers: HEADERS });
    const big = Buffer.alloc(1024 * 1024, 7);
    const body = bodyOf([['f', { filename: 'big.bin', data: big }]]);
    let stream;
    parser.on('file', (name, file) => {
      stream = file;
    });
    const source = new PassThrough({ highWaterMark: 16 * 1024 });
    source.pipe(parser);
    // (In chunks, as a request comes.)
    for (let at = 0; at < body.length; at += 16 * 1024) source.write(body.subarray(at, at + 16 * 1024));
    source.end();
    await new Promise((resolve) => setTimeout(resolve, 50));
    // (Not read: most of the body still waits outside the parser.)
    expect(stream.readableLength).toBeLessThan(big.length);
    let received = 0;
    await new Promise((resolve) => {
      stream.pipe(
        new Writable({
          write(chunk, encoding, next) {
            received += chunk.length;
            next();
          },
          final(next) {
            next();
            resolve();
          },
        })
      );
    });
    expect(received).toBe(big.length);
  });
});

describe('multer of @xufa/http', () => {
  const submit = (middleware, body, headers = HEADERS) =>
    new Promise((resolve) => {
      const req = new PassThrough();
      req.headers = { ...headers, 'content-length': String(body.length) };
      req.end(body);
      middleware(req, null, (err) => resolve({ err, req }));
    });

  it('gives req.file and req.body; with defParamCharset utf8, names of files as browsers send them', async () => {
    const body = bodyOf([
      ['name', 'Ann'],
      ['photo', { filename: Buffer.from('crème.jpg', 'utf8'), type: 'image/jpeg', data: binary }],
    ]);
    const { err, req } = await submit(multer({ storage: multer.memoryStorage(), defParamCharset: 'utf8' }).single('photo'), body);
    expect(err).toBeUndefined();
    expect(req.body.name).toBe('Ann');
    expect(req.file).toMatchObject({ fieldname: 'photo', originalname: 'crème.jpg', mimetype: 'image/jpeg', size: 600, encoding: '7bit' });
    expect(req.file.buffer.equals(binary)).toBe(true);
    // (multer's default: latin1, as it always was.)
    const latin1 = await submit(multer().single('photo'), body);
    expect(latin1.req.file.originalname).toBe(Buffer.from('crème.jpg', 'utf8').toString('latin1'));
  });

  it('leaves a request that is not multipart as it is', async () => {
    const { err, req } = await submit(multer().single('photo'), Buffer.from('{}'), { 'content-type': 'application/json' });
    expect(err).toBeUndefined();
    expect(req.file).toBeUndefined();
    expect(req.body).toBeUndefined();
  });
});
