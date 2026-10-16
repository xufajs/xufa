// @xufa/http/form-data against form-data 4.0.5: a form of 10 text fields and a file of 64 KB from a Buffer (as an app
// sends one with an upload), and the same with a file of 1 MB read from the disk, built, its length counted and
// streamed to its end, in forms a second.
// node bench/micro/form-data.js [rounds]
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Writable } = require('node:stream');
const { versus, rate } = require('../lib/versus.js');

const FILE = path.join(os.tmpdir(), 'xufa-bench-form-data.bin');
const IMAGE = Buffer.alloc(64 * 1024, 7);

function send(FormData, withFile) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (let i = 0; i < 10; i += 1) form.append(`field${i}`, `value of the field ${i}`);
    form.append('cover', IMAGE, 'cover.png');
    if (withFile) form.append('book', fs.createReadStream(FILE));
    form.getHeaders();
    form.getLength((err) => {
      if (err) return reject(err);
      const sink = new Writable({
        write(chunk, encoding, next) {
          next();
        },
      });
      sink.on('finish', resolve);
      form.on('error', reject);
      form.pipe(sink);
      return undefined;
    });
  });
}

versus({
  file: __filename,
  theirs: 'form-data 4.0.5',
  ours: '@xufa/http/form-data',
  unit: 'forms/s',
  cases: { '10 fields and a Buffer of 64 KB': {}, 'and a file of 1 MB from the disk': {} },
  measure(library, caseName) {
    const FormData = library === 'theirs' ? require('form-data') : require('@xufa/http/form-data');
    const withFile = caseName.includes('disk');
    if (withFile && !fs.existsSync(FILE)) fs.writeFileSync(FILE, Buffer.alloc(1024 * 1024, 3));
    return rate(() => send(FormData, withFile), { ms: 1500, warm: 50 });
  },
});
