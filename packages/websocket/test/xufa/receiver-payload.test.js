// Payloads over several socket chunks: masked frames cut at every offset and in random pieces arrive as sent, and so do
// fragmented and compressed messages, each kept as it arrived while the next ones are received.
const crypto = require('node:crypto');
const Receiver = require('../../lib/receiver');
const Sender = require('../../lib/sender');
const { WebSocket, WebSocketServer } = require('../..');

function frame(data, mask, fin = true, opcode = 2) {
  return Buffer.concat(Sender.frame(data, { fin, mask, opcode, readOnly: true }));
}

// The chunks are copied (a receiver unmasks in place, as the chunks of a socket are its own), and the messages are
// those emitted once the last chunk is written.
async function receive(chunks, options = {}) {
  const receiver = new Receiver({ isServer: true, ...options });
  const messages = [];
  receiver.on('message', (data, isBinary) => messages.push(isBinary ? data : data.toString()));
  for (const chunk of chunks.slice(0, -1)) receiver.write(Buffer.from(chunk));
  await new Promise((resolve, reject) =>
    receiver.write(Buffer.from(chunks[chunks.length - 1]), (err) => (err ? reject(err) : resolve()))
  );
  return messages;
}

// Pieces of random lengths from 1 to `max` bytes.
function cut(buffer, max) {
  const pieces = [];
  for (let i = 0; i < buffer.length;) {
    const length = 1 + crypto.randomInt(max);
    pieces.push(buffer.subarray(i, i + length));
    i += length;
  }
  return pieces;
}

describe('payloads over several chunks', () => {
  it('a masked frame cut at every offset', async () => {
    const data = crypto.randomBytes(1000);
    const bytes = frame(data, true);
    for (let at = 1; at < bytes.length; at += 1) {
      const [message] = await receive([bytes.subarray(0, at), bytes.subarray(at)]);
      expect(Buffer.compare(message, data)).toBe(0);
    }
  });

  it('masked and unmasked frames in random pieces', async () => {
    for (const size of [5, 126, 383, 384, 1000, 65536, 300 * 1024]) {
      for (const mask of [true, false]) {
        const data = crypto.randomBytes(size);
        // Pieces of a few bytes only for the small frames (each is a write).
        for (const max of size <= 1000 ? [3, 7, 1000] : [1000, 4096, 70000]) {
          const [message] = await receive(cut(frame(data, mask), max), { isServer: mask });
          expect(Buffer.compare(message, data)).toBe(0);
        }
      }
    }
  });

  it('a fragmented text message in random pieces', async () => {
    const text = 'añ€😀x'.repeat(5000);
    const bytes = Buffer.from(text);
    const parts = [bytes.subarray(0, 10001), bytes.subarray(10001, 30000), bytes.subarray(30000)];
    const frames = Buffer.concat(parts.map((part, i) => frame(part, true, i === parts.length - 1, i === 0 ? 1 : 0)));
    const [message] = await receive(cut(frames, 5000));
    expect(message).toBe(text);
  });

  describe('fragmented and compressed messages', () => {
    const fragmented = (data, sizes, opcode, mask = true) => {
      const frames = [];
      let at = 0;
      sizes.forEach((size, i) => {
        frames.push(frame(data.subarray(at, at + size), mask, i === sizes.length - 1, i === 0 ? opcode : 0));
        at += size;
      });
      return Buffer.concat(frames);
    };

    it('binary and text messages kept stay as they arrived', async () => {
      const sent = [];
      const frames = [];
      for (let i = 0; i < 20; i += 1) {
        const binary = i % 2 === 0;
        const data = binary ? crypto.randomBytes(50000) : Buffer.from('añ€😀x'.repeat(4545));
        sent.push(binary ? data : data.toString());
        frames.push(fragmented(data, [20000, 10000, data.length - 30000], binary ? 2 : 1));
      }
      const received = await receive(cut(Buffer.concat(frames), 9000));
      expect(received.length).toBe(sent.length);
      for (let i = 0; i < sent.length; i += 1) {
        if (typeof sent[i] === 'string') expect(received[i]).toBe(sent[i]);
        else expect(Buffer.compare(received[i], sent[i])).toBe(0);
      }
    });

    it('a fragment alone with data, then an empty one', async () => {
      const first = crypto.randomBytes(30000);
      const kept = Buffer.from(first);
      // 30000 bytes and an empty last fragment, then messages of fragments that use the pool.
      const frames = [frame(first, true, false, 2), frame(Buffer.alloc(0), true, true, 0)];
      for (let i = 0; i < 5; i += 1) frames.push(fragmented(crypto.randomBytes(40000), [20000, 20000], 2));
      const received = await receive(cut(Buffer.concat(frames), 9000));
      expect(received.length).toBe(6);
      expect(Buffer.compare(received[0], kept)).toBe(0);
    });

    it("binaryType 'fragments' keeps its fragments", async () => {
      const datas = [crypto.randomBytes(40000), crypto.randomBytes(40000)];
      const frames = datas.map((data) => fragmented(data, [20000, 20000], 2));
      const received = await receive(cut(Buffer.concat(frames), 9000), { binaryType: 'fragments' });
      expect(received.length).toBe(2);
      for (let i = 0; i < 2; i += 1) expect(Buffer.compare(Buffer.concat(received[i]), datas[i])).toBe(0);
    });

    it('compressed messages over several chunks', async () => {
      const wss = new WebSocketServer({ port: 0, host: '127.0.0.1', perMessageDeflate: { threshold: 0 } });
      await new Promise((resolve) => wss.once('listening', resolve));
      try {
        const ws = new WebSocket(`ws://127.0.0.1:${wss.address().port}`, { perMessageDeflate: { threshold: 0 } });
        const [server] = await Promise.all([
          new Promise((resolve) => wss.once('connection', resolve)),
          new Promise((resolve) => ws.once('open', resolve)),
        ]);
        // Random bytes do not compress: each frame stays over 64 KB, over several chunks.
        const sent = Array.from({ length: 10 }, () => crypto.randomBytes(100 * 1024));
        const received = [];
        const done = new Promise((resolve) =>
          server.on('message', (data) => {
            received.push(data);
            if (received.length === sent.length) resolve();
          })
        );
        for (const data of sent) ws.send(data);
        await done;
        for (let i = 0; i < sent.length; i += 1) expect(Buffer.compare(received[i], sent[i])).toBe(0);
        ws.terminate();
      } finally {
        await new Promise((resolve) => wss.close(resolve));
      }
    });
  });
});
