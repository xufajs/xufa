// Tests of xufa (not ported from fastify): staticFiles, the files of folders under a prefix.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import xufa from '../../index.js';

let first;
let second;
beforeAll(() => {
  first = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-static-'));
  second = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-static-'));
  fs.mkdirSync(path.join(first, 'css'));
  fs.writeFileSync(path.join(first, 'css', 'site.css'), 'body { color: red }');
  fs.writeFileSync(path.join(first, 'app.js'), 'console.log("app")');
  fs.writeFileSync(path.join(first, 'app.js.br'), zlib.brotliCompressSync('console.log("app")'));
  fs.writeFileSync(path.join(first, '.env'), 'SECRET=1');
  fs.writeFileSync(path.join(first, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  fs.writeFileSync(path.join(second, 'extra.txt'), 'from the second folder');
  fs.writeFileSync(path.join(second, 'app.js'), 'not this one');
  fs.writeFileSync(path.join(os.tmpdir(), 'outside-xufa-static.txt'), 'outside');
});
afterAll(() => {
  fs.rmSync(first, { recursive: true, force: true });
  fs.rmSync(second, { recursive: true, force: true });
});

function makeApp(options = {}) {
  const app = xufa();
  app.register(xufa.staticFiles, { root: [first, second], ...options });
  return app;
}

describe('staticFiles', () => {
  it('a file with its type, ETag and Last-Modified; 304 when the browser has it', async () => {
    const app = makeApp();
    const res = await app.inject('/static/css/site.css');
    expect([res.statusCode, res.headers['content-type'], res.body]).toEqual([200, 'text/css; charset=utf-8', 'body { color: red }']);
    expect(res.headers.etag).toMatch(/^"[0-9a-f]{12}"$/);
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['last-modified']).toBeTruthy();
    const again = await app.inject({ url: '/static/css/site.css', headers: { 'if-none-match': res.headers.etag } });
    expect([again.statusCode, again.body]).toEqual([304, '']);
    const since = await app.inject({ url: '/static/css/site.css', headers: { 'if-modified-since': res.headers['last-modified'] } });
    expect(since.statusCode).toBe(304);
    expect((await app.inject('/static/logo.png')).headers['content-type']).toBe('image/png');
  });

  it('staticUrl(): the address with the version of the file, cached for a year; the first folder wins', async () => {
    const app = makeApp({ maxAge: 60 });
    await app.ready();
    const address = app.staticUrl('css/site.css');
    expect(address).toMatch(/^\/static\/css\/site\.css\?v=[0-9a-f]{12}$/);
    const res = await app.inject(address);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    // An old version, or none: the cache of maxAge.
    expect((await app.inject('/static/css/site.css?v=old')).headers['cache-control']).toBe('public, max-age=60');
    expect(app.staticUrl('nope.css')).toBe('/static/nope.css');
    expect((await app.inject('/static/extra.txt')).body).toBe('from the second folder');
    expect((await app.inject({ url: '/static/app.js', headers: { 'accept-encoding': 'identity' } })).body).toBe('console.log("app")');
  });

  it('staticUrl(): a file that changed gets its new version, the file looked at once a second at most', async () => {
    fs.writeFileSync(path.join(first, 'changing.css'), 'a { color: red }');
    const app = makeApp();
    await app.ready();
    const before = app.staticUrl('changing.css');
    fs.writeFileSync(path.join(first, 'changing.css'), 'a { color: blue; }');
    // Within the second: the version known (no stat of the disk at each render).
    expect(app.staticUrl('changing.css')).toBe(before);
    const { now } = Date;
    try {
      const later = now() + 1500;
      Date.now = () => later;
      const after = app.staticUrl('changing.css');
      expect(after).toMatch(/^\/static\/changing\.css\?v=[0-9a-f]{12}$/);
      expect(after).not.toBe(before);
    } finally {
      Date.now = now;
    }
  });

  it('the .br file when the browser takes it; HEAD has no body', async () => {
    const app = makeApp();
    const res = await app.inject({ url: '/static/app.js', headers: { 'accept-encoding': 'gzip, br' } });
    expect([res.headers['content-encoding'], res.headers.vary]).toEqual(['br', 'accept-encoding']);
    expect(zlib.brotliDecompressSync(res.rawPayload).toString()).toBe('console.log("app")');
    const head = await app.inject({ method: 'HEAD', url: '/static/css/site.css' });
    expect([head.statusCode, head.body, head.headers['content-length']]).toEqual([200, '', '19']);
  });

  it('404: paths out of the folders, dotfiles, folders, files that are not there', async () => {
    const app = makeApp();
    for (const url of ['/static/../outside-xufa-static.txt', '/static/%2e%2e/outside-xufa-static.txt', '/static/.env', '/static/css', '/static/nope.css']) {
      expect([url, (await app.inject(url)).statusCode]).toEqual([url, 404]);
    }
    // A path that is not well encoded: the router answers 400 first.
    expect((await app.inject('/static/%E0%A4%A')).statusCode).toBe(400);
  });

  it('options: root is needed, the prefix starts and ends with /', async () => {
    await expect(xufa().register(xufa.staticFiles, {}).ready()).rejects.toThrow('staticFiles needs root');
    await expect(xufa().register(xufa.staticFiles, { root: first, prefix: 'static' }).ready()).rejects.toThrow('starts and ends with /');
  });
});
