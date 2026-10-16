// Small files sent from memory (lib/send.js): only while the file is the one read (its device, inode,
// size and times); a file changed on disk, to the same size or not, or removed, is read again.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from '../index.js';

const listen = (app) =>
  new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
const close = (server) =>
  new Promise((resolve) => {
    server.close(resolve);
  });

describe('files sent from memory', () => {
  let folder;
  let server;
  let base;
  beforeAll(async () => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-express-files-'));
    fs.writeFileSync(path.join(folder, 'a.txt'), 'first');
    const app = express();
    app.use('/static', express.static(folder));
    app.get('/file', (req, res) => res.sendFile(path.join(folder, 'a.txt')));
    server = await listen(app);
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => {
    await close(server);
    fs.rmSync(folder, { recursive: true, force: true });
  });

  const get = async (url) => {
    const response = await fetch(base + url);
    return { status: response.status, body: await response.text() };
  };

  it('the same bytes again and again, and new ones once the file changes (to the same size too)', async () => {
    for (const url of ['/static/a.txt', '/file']) {
      fs.writeFileSync(path.join(folder, 'a.txt'), 'first');
      expect(await get(url)).toEqual({ status: 200, body: 'first' });
      expect(await get(url)).toEqual({ status: 200, body: 'first' });
      // The same size, other bytes: its times changed.
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
      fs.writeFileSync(path.join(folder, 'a.txt'), 'other');
      expect(await get(url)).toEqual({ status: 200, body: 'other' });
      fs.writeFileSync(path.join(folder, 'a.txt'), 'a longer text');
      expect(await get(url)).toEqual({ status: 200, body: 'a longer text' });
    }
  });

  it('a file removed is not found, and a range is read from the file', async () => {
    fs.writeFileSync(path.join(folder, 'b.txt'), '0123456789');
    expect(await get('/static/b.txt')).toEqual({ status: 200, body: '0123456789' });
    const range = await fetch(`${base}/static/b.txt`, { headers: { range: 'bytes=2-4' } });
    expect([range.status, await range.text()]).toEqual([206, '234']);
    fs.rmSync(path.join(folder, 'b.txt'));
    expect((await get('/static/b.txt')).status).toBe(404);
  });
});
