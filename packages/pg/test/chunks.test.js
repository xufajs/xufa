// The messages of the server cut anywhere: random results (rows of numbers, texts of every size, nulls, json) of
// pipelined queries are written as the server writes them, cut into chunks at random points (inside the headers of
// messages too) and read by a connection, which must give the same rows as without the cuts. The seed is random
// (XUFA_FUZZ_SEED replays one), and printed when a round fails.
const { Connection } = require('../lib/connection');

// A small PRNG of a seed (mulberry32), so that a round can be replayed.
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const message = (type, body) => {
  const header = Buffer.alloc(5);
  header[0] = type;
  header.writeInt32BE(body.length + 4, 1);
  return Buffer.concat([header, body]);
};
const cstring = (text) => Buffer.concat([Buffer.from(text), Buffer.from([0])]);
const int16 = (value) => {
  const buffer = Buffer.alloc(2);
  buffer.writeInt16BE(value);
  return buffer;
};
const int32 = (value) => {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(value);
  return buffer;
};

const COLUMNS = [
  { oid: 23, make: (rand) => Math.floor(rand() * 2 ** 31) * (rand() < 0.5 ? -1 : 1) },
  {
    oid: 25,
    make: (rand) => {
      const pick = rand();
      if (pick < 0.1) return '';
      if (pick < 0.2) return 'é😀中'.repeat(1 + Math.floor(rand() * 5));
      // Values of up to hundreds of kilobytes: messages larger than the chunks of a socket.
      if (pick < 0.27) return 'x'.repeat(Math.floor(rand() * 300000));
      return Math.floor(rand() * 1e9).toString(36).repeat(1 + Math.floor(rand() * 4));
    },
  },
  { oid: 114, make: (rand) => ({ n: Math.floor(rand() * 100), list: [rand() < 0.5, 'a'] }) },
];
const textOf = (oid, value) => (oid === 114 ? JSON.stringify(value) : String(value));

// The response to a simple query of random rows: its bytes and the rows it gives.
function response(rand) {
  const columns = Array.from({ length: 1 + Math.floor(rand() * 4) }, (_, i) => ({
    name: `c${i}`,
    ...COLUMNS[Math.floor(rand() * COLUMNS.length)],
  }));
  const parts = [];
  const description = [int16(columns.length)];
  for (const column of columns) {
    description.push(cstring(column.name), int32(0), int16(0), int32(column.oid), int16(-1), int32(-1), int16(0));
  }
  parts.push(message(0x54, Buffer.concat(description)));
  const rows = [];
  const count = Math.floor(rand() * 20);
  for (let r = 0; r < count; r += 1) {
    const row = {};
    const fields = [int16(columns.length)];
    for (const column of columns) {
      if (rand() < 0.1) {
        row[column.name] = null;
        fields.push(int32(-1));
      } else {
        const value = column.make(rand);
        row[column.name] = value;
        const bytes = Buffer.from(textOf(column.oid, value));
        fields.push(int32(bytes.length), bytes);
      }
    }
    rows.push(row);
    parts.push(message(0x44, Buffer.concat(fields)));
  }
  parts.push(message(0x43, cstring(`SELECT ${count}`)));
  parts.push(message(0x5a, Buffer.from('I')));
  return { bytes: Buffer.concat(parts), rows };
}

// A connection reading from nothing: its queries are written nowhere, and the server's bytes are given to onData.
function connection() {
  const conn = new Connection({ host: '127.0.0.1', user: 'u' });
  conn.socket = { write() {}, cork() {}, uncork() {}, destroy() {} };
  return conn;
}

// The bytes cut into chunks: mostly small (headers cut in two), some large.
function cut(bytes, rand) {
  const chunks = [];
  let offset = 0;
  while (offset < bytes.length) {
    const pick = rand();
    let size;
    if (pick < 0.4) size = 1 + Math.floor(rand() * 8);
    else if (pick < 0.8) size = 1 + Math.floor(rand() * 200);
    else size = 1 + Math.floor(rand() * 70000);
    chunks.push(bytes.subarray(offset, offset + size));
    offset += size;
  }
  return chunks;
}

describe('messages cut into chunks', () => {
  it('give the same rows wherever they are cut', async () => {
    const base = process.env.XUFA_FUZZ_SEED ? Number(process.env.XUFA_FUZZ_SEED) : Math.floor(Math.random() * 2 ** 31);
    const rounds = process.env.XUFA_FUZZ_SEED ? 1 : 150;
    for (let round = 0; round < rounds; round += 1) {
      const seed = base + round;
      const rand = random(seed);
      const conn = connection();
      // Two pipelined queries: their responses follow each other in the same chunks.
      const first = response(rand);
      const second = response(rand);
      const results = [conn.send('SELECT 1').promise, conn.send('SELECT 2').promise];
      let settled = 0;
      results.forEach((result) =>
        result.then(
          () => {
            settled += 1;
          },
          () => {
            settled += 1;
          }
        )
      );
      for (const chunk of cut(Buffer.concat([first.bytes, second.bytes]), rand)) conn.onData(chunk);
      // Every byte was given: both queries have ended (a parser that lost its place would leave them waiting).
      await new Promise((resolve) => {
        setImmediate(resolve);
      });
      if (settled !== 2) throw new Error(`XUFA_FUZZ_SEED=${seed}: the responses were not all read`);
      const [a, b] = await Promise.all(results);
      try {
        expect(a.rows).toEqual(first.rows);
        expect(b.rows).toEqual(second.rows);
        expect(conn.queue).toHaveLength(0);
        expect(conn.partial).toBe(null);
        expect(conn.pending).toBe(null);
      } catch (err) {
        err.message = `XUFA_FUZZ_SEED=${seed}: ${err.message}`;
        throw err;
      }
    }
  });
});
