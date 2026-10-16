// @xufa/http/compression: the default export and require() are the middleware (compression's tests, ported in
// test/compression, check what it does), and @xufa/express runs it as Express runs compression.
import { createRequire } from 'node:module';
import zlib from 'node:zlib';
import express from '../../../express/index.js';
import compression, { compression as named } from '../../compression.js';

const require = createRequire(import.meta.url);

describe('@xufa/http/compression', () => {
  it('is the middleware, for import and require, with its filter', () => {
    expect(named).toBe(compression);
    expect(require('@xufa/http/compression')).toBe(compression);
    expect(typeof compression.filter).toBe('function');
  });

  it('compresses the answers of an Express app as the request accepts', async () => {
    const app = express();
    app.use(compression({ threshold: 100 }));
    app.get('/big', (req, res) => res.json({ items: Array.from({ length: 50 }, (_, i) => `item ${i}`) }));
    app.get('/small', (req, res) => res.json({ ok: true }));
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const br = await fetch(`${base}/big`, { headers: { 'accept-encoding': 'gzip, deflate, br' } });
      expect(br.headers.get('content-encoding')).toBe('br');
      expect(br.headers.get('vary')).toBe('Accept-Encoding');
      expect((await br.json()).items).toHaveLength(50);
      const gzip = await new Promise((resolve, reject) => {
        require('node:http').get(`${base}/big`, { headers: { 'accept-encoding': 'gzip' } }, (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }));
        }).on('error', reject);
      });
      expect(gzip.headers['content-encoding']).toBe('gzip');
      expect(JSON.parse(zlib.gunzipSync(gzip.body)).items[49]).toBe('item 49');
      const small = await fetch(`${base}/small`, { headers: { 'accept-encoding': 'gzip' } });
      expect(small.headers.get('content-encoding')).toBeNull();
    } finally {
      server.close();
    }
  });
});
