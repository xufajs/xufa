// @xufa/http/multer against multer 2.1.1: uploads over the loopback to a server of the same process (memoryStorage,
// .single(), 8 at a time, the body sent in chunks of 64 KiB), and the parsers alone (busboy 1.6.0, multer's, against
// @xufa/http's): a body of multipart/form-data with a field and a file, in MB a second.
// node bench/micro/multer.js [rounds]
const http = require('node:http');
const { Readable } = require('node:stream');
const { versus, rate } = require('../lib/versus.js');

const BOUNDARY = 'bench-boundary-1234';

function bodyOf(bytes) {
  const head = Buffer.from(
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="title"\r\n\r\nDune\r\n` +
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="book.pdf"\r\n` +
      'Content-Type: application/octet-stream\r\n\r\n'
  );
  const data = Buffer.alloc(bytes);
  for (let i = 0; i < bytes; i += 1) data[i] = (i * 131 + (i >> 8)) & 255;
  return { body: Buffer.concat([head, data, Buffer.from(`\r\n--${BOUNDARY}--\r\n`)]), bytes };
}

const SIZES = { '1 KB': 1024, '100 KB': 100 * 1024, '5 MB': 5 * 1024 * 1024 };

async function upload(library, size) {
  const multer = library === 'theirs' ? require('multer') : require('@xufa/http/multer');
  const { body, bytes } = bodyOf(size);
  const handle = multer({ storage: multer.memoryStorage() }).single('file');
  const server = http.createServer((req, res) =>
    handle(req, res, (err) => {
      res.statusCode = err || !req.file || req.file.size !== bytes ? 500 : 200;
      res.end();
    })
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const agent = new http.Agent({ keepAlive: true, maxSockets: 8 });
  const one = () =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          port: server.address().port,
          host: '127.0.0.1',
          method: 'POST',
          agent,
          headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}`, 'content-length': body.length },
        },
        (res) => {
          res.resume();
          res.on('end', () => (res.statusCode === 200 ? resolve() : reject(new Error(`status ${res.statusCode}`))));
        }
      );
      req.on('error', reject);
      for (let i = 0; i < body.length; i += 65536) req.write(body.subarray(i, i + 65536));
      req.end();
    });
  const eight = () => Promise.all([one(), one(), one(), one(), one(), one(), one(), one()]);
  const perSecond = await rate(eight, { ms: size > 1e6 ? 2000 : 1000, warm: 5 });
  server.close();
  agent.destroy();
  return perSecond * 8;
}

// The parser alone: a Readable of the body in chunks of 64 KiB, the file read to its end.
async function parse(library) {
  const { body } = bodyOf(5 * 1024 * 1024);
  const headers = { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` };
  const chunks = [];
  for (let i = 0; i < body.length; i += 65536) chunks.push(body.subarray(i, i + 65536));
  const make =
    library === 'theirs'
      ? () => require('busboy')({ headers })
      : () => {
          const { MultipartParser } = require('@xufa/http/lib/multipart');
          return new MultipartParser({ headers });
        };
  const one = () =>
    new Promise((resolve, reject) => {
      const parser = make();
      parser.on('file', (name, stream) => stream.resume());
      parser.on('error', reject);
      parser.on('close', resolve);
      Readable.from(chunks).pipe(parser);
    });
  return ((await rate(one, { ms: 2000, warm: 10 })) * body.length) / (1024 * 1024);
}

versus({
  file: __filename,
  theirs: 'multer 2.1.1',
  ours: '@xufa/http/multer',
  unit: 'uploads/s',
  cases: {
    'upload 1 KB': {},
    'upload 100 KB': {},
    'upload 5 MB': {},
    'parse a body of 5 MB, the parser alone': { unit: 'MB/s' },
  },
  measure: (library, caseName) =>
    caseName.startsWith('parse') ? parse(library) : upload(library, SIZES[caseName.replace('upload ', '')]),
});
