// The buffers of masked frames used again (lib/frame-pool.js): over a real socket, with many frames in flight, each
// message arrives as sent (a buffer given back too soon would be overwritten by the next frame while still being
// written); text is encoded into the frame itself; and nothing is pooled on a socket that is not a net.Socket.
const crypto = require('node:crypto');
const { Duplex } = require('node:stream');
const { WebSocket, WebSocketServer } = require('../..');
const Sender = require('../../lib/sender');
const framePool = require('../../lib/frame-pool');

// Sizes around the limits of the pool, and text with characters of 2, 3 and 4 bytes.
const SIZES = [100, 4000, 4096, 5000, 16 * 1024, 65535, 65536, 300 * 1024, 1024 * 1024, 4 * 1024 * 1024 + 1];
// Whole units of 11 bytes (a slice could cut the pair of surrogates of the emoji).
const text = (bytes) => 'añ€😀x'.repeat(Math.max(1, Math.round(bytes / 11)));

function echoPair() {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' }, () => {
      const ws = new WebSocket(`ws://127.0.0.1:${wss.address().port}`);
      wss.once('connection', (server) => ws.once('open', () => resolve({ wss, ws, server })));
    });
  });
}

function close({ wss, ws }) {
  return new Promise((resolve) => {
    ws.terminate();
    wss.close(resolve);
  });
}

describe('frame pool', () => {
  it('messages arrive as sent with many in flight', async () => {
    const pair = await echoPair();
    try {
      const sent = [];
      for (let round = 0; round < 3; round += 1) {
        for (const size of SIZES) {
          sent.push(crypto.randomBytes(size));
          sent.push(text(size));
        }
      }
      const received = [];
      const done = new Promise((resolve) => {
        pair.server.on('message', (data, isBinary) => {
          received.push(isBinary ? data : data.toString());
          if (received.length === sent.length) resolve();
        });
      });
      // All at once: the socket holds most of them while later ones are framed.
      for (const message of sent) pair.ws.send(message);
      await done;
      for (let i = 0; i < sent.length; i += 1) {
        if (typeof sent[i] === 'string') expect(received[i]).toBe(sent[i]);
        else expect(Buffer.compare(received[i], sent[i])).toBe(0);
      }
      // And the buffers were used again.
      expect(framePool.free.length).toBeGreaterThan(0);
    } finally {
      await close(pair);
    }
  });

  it('the buffer given to send() is not changed', async () => {
    const pair = await echoPair();
    try {
      const data = crypto.randomBytes(64 * 1024);
      const copy = Buffer.from(data);
      const arrived = new Promise((resolve) => pair.server.once('message', resolve));
      await new Promise((resolve, reject) => pair.ws.send(data, (err) => (err ? reject(err) : resolve())));
      expect(Buffer.compare(await arrived, copy)).toBe(0);
      expect(Buffer.compare(data, copy)).toBe(0);
    } finally {
      await close(pair);
    }
  });

  it('the callback of send() is called once written', async () => {
    const pair = await echoPair();
    try {
      const calls = await Promise.all(
        [16 * 1024, 1024 * 1024].map(
          (size) => new Promise((resolve) => pair.ws.send(crypto.randomBytes(size), (...args) => resolve(args)))
        )
      );
      for (const args of calls) expect(args[0] == null).toBe(true);
    } finally {
      await close(pair);
    }
  });

  it('a socket that is not a net.Socket is not pooled', () => {
    const written = [];
    const socket = new Duplex({
      read() {},
      write(chunk, encoding, cb) {
        written.push(chunk);
        cb();
      },
    });
    const sender = new Sender(socket);
    expect(sender._pooled).toBe(false);
    const before = framePool.free.length;
    sender.send(crypto.randomBytes(16 * 1024), { binary: true, fin: true, mask: true });
    expect(framePool.free.length).toBe(before);
    // One buffer of the header and the data, masked: not a slice of a larger buffer of the pool.
    expect(written[0].buffer.byteLength).toBe(written[0].length);
  });

  it('take() gives a buffer of its own, of at least the size, and release() keeps a few', () => {
    const taken = [];
    for (let i = 0; i < 20; i += 1) taken.push(framePool.take(10000));
    for (const buffer of taken) {
      expect(buffer.length).toBeGreaterThanOrEqual(10000);
      expect(buffer.byteOffset).toBe(0);
    }
    for (const buffer of taken) framePool.release(buffer);
    expect(framePool.free.length).toBeLessThanOrEqual(8);
    framePool.release(Buffer.allocUnsafeSlow(framePool.MAX + 4096));
    expect(framePool.free.every((buffer) => buffer.length <= framePool.MAX)).toBe(true);
    // A buffer much larger than asked is not given for a small frame.
    const small = framePool.take(4096);
    expect(small.length).toBeLessThanOrEqual(8192);
  });
});
