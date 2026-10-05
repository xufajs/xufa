// @xufa/websocket against ws (8.22.0), over the loopback: a client sends messages to a server that echoes them back,
// 64 in flight, and the round trips a second are counted. Both ends are of the library measured. Each library is
// measured twice: with bufferutil installed (the native masking both load when they find it), and without it
// (WS_NO_BUFFER_UTIL); on Node.js 22 ws validates UTF-8 with buffer.isUtf8, so utf-8-validate is never loaded. Each
// library and case runs in a process of its own; best of the rounds. Every echo of the warm-up is checked against what
// was sent (outside the measure, the same for all): a library that corrupts the payload is reported, not timed.
// node bench/micro/websocket.js [rounds] [ms per measure]
const { execFileSync } = require('node:child_process');
const path = require('node:path');

// native: whether xufa must have loaded bufferutil (checked, so that a column is not the other one by mistake).
const LIBRARIES = {
  'xufa (JS)': { module: '@xufa/websocket', env: { WS_NO_BUFFER_UTIL: '1' }, native: false },
  'xufa + bufferutil': { module: '@xufa/websocket', env: {}, native: true },
  'ws (JS)': { module: 'ws', env: { WS_NO_BUFFER_UTIL: '1' } },
  'ws + bufferutil': { module: 'ws', env: {} },
};

const CASES = {
  'text 64 B': { size: 64, binary: false },
  'text 16 KB': { size: 16 * 1024, binary: false },
  'binary 16 KB': { size: 16 * 1024, binary: true },
  'binary 1 MB': { size: 1024 * 1024, binary: true },
  'text 16 KB, deflate': { size: 16 * 1024, binary: false, deflate: true },
  // Sent in 16 fragments of 64 KB (echoed whole); and bytes that do not compress, each frame over several chunks.
  'binary 1 MB, fragments': { size: 1024 * 1024, binary: true, fragments: 16 },
  'binary 256 KB, deflate': { size: 256 * 1024, binary: true, deflate: true },
};
const IN_FLIGHT = 64;

async function child(name, caseName, ms) {
  const { WebSocket, WebSocketServer } = require(LIBRARIES[name].module);
  if (LIBRARIES[name].native !== undefined) {
    // Its lib is not exported: by its path.
    const dir = path.dirname(require.resolve(`${LIBRARIES[name].module}/package.json`));
    if (require(path.join(dir, 'lib/buffer-util.js')).native !== LIBRARIES[name].native) {
      process.stderr.write(`${name}: bufferutil ${LIBRARIES[name].native ? 'not found' : 'loaded'}\n`);
      process.exit(2);
    }
  }
  const { size, binary, deflate, fragments } = CASES[caseName];
  // Text that compresses as JSON does (repeated keys), and bytes that do not.
  const payload = binary
    ? require('node:crypto').randomBytes(size)
    : JSON.stringify(Array.from({ length: size }, (_, i) => ({ id: i, name: 'item' }))).slice(0, size);
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1', perMessageDeflate: Boolean(deflate) });
  await new Promise((resolve) => wss.once('listening', resolve));
  wss.on('connection', (socket) => socket.on('message', (data, isBinary) => socket.send(data, { binary: isBinary })));
  const ws = new WebSocket(`ws://127.0.0.1:${wss.address().port}`, { perMessageDeflate: Boolean(deflate) });
  await new Promise((resolve) => ws.once('open', resolve));

  const expected = Buffer.from(payload);
  const parts = [];
  for (let at = 0; fragments && at < size; at += size / fragments)
    parts.push(expected.subarray(at, at + size / fragments));
  const send = fragments
    ? () => parts.forEach((part, i) => ws.send(part, { binary, fin: i === parts.length - 1 }))
    : () => ws.send(payload, { binary });
  let checking = true;
  let checked = 0;
  let received = 0;
  let measuring = false;
  let counted = 0;
  let stop = false;
  ws.on('message', (data, isBinary) => {
    received += 1;
    if (checking) {
      if (isBinary !== binary || !Buffer.isBuffer(data) || !data.equals(expected)) {
        process.stderr.write(`${name}, ${caseName}: echo ${received} differs from the payload sent\n`);
        process.exit(2);
      }
      checked += 1;
    }
    if (measuring) counted += 1;
    if (!stop) send();
  });
  for (let i = 0; i < IN_FLIGHT; i += 1) send();
  // Warm-up, then the measure.
  await new Promise((resolve) => setTimeout(resolve, Math.min(1000, ms / 2)));
  checking = false;
  if (checked === 0) {
    process.stderr.write(`${name}, ${caseName}: no echo in the warm-up\n`);
    process.exit(2);
  }
  measuring = true;
  const start = process.hrtime.bigint();
  await new Promise((resolve) => setTimeout(resolve, ms));
  const seconds = Number(process.hrtime.bigint() - start) / 1e9;
  measuring = false;
  stop = true;
  process.stdout.write(String(counted / seconds));
  ws.terminate();
  wss.close();
  process.exit(0);
}

function main() {
  const rounds = Number(process.argv[2]) || 3;
  const ms = Number(process.argv[3]) || 2000;
  const names = Object.keys(LIBRARIES);
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  process.stdout.write(
    `| Case | ${names.map((n) => `${n} msg/s`).join(' | ')} | JS: xufa / ws | bufferutil: xufa / ws |\n` +
      `| --- |${names.map(() => ' ---: |').join('')} ---: | ---: |\n`
  );
  let failed = false;
  for (const caseName of Object.keys(CASES)) {
    const ops = {};
    for (let round = 0; round < rounds; round += 1) {
      for (const name of names) {
        if (ops[name] === null) continue;
        try {
          const out = execFileSync(process.execPath, [__filename, '--child', name, caseName, String(ms)], {
            cwd: __dirname,
            env: { ...process.env, ...LIBRARIES[name].env },
            stdio: ['ignore', 'pipe', 'inherit'],
          });
          ops[name] = Math.max(ops[name] || 0, Number(out));
        } catch {
          // The child said why on stderr: an echo that differs from the payload, or an error of the library.
          ops[name] = null;
          failed = true;
        }
      }
    }
    const cell = (n) => (ops[n] === null ? 'FAILED' : fmt(ops[n]));
    const ratio = (a, b) => (ops[a] === null || ops[b] === null ? '-' : `${(ops[a] / ops[b]).toFixed(2)}x`);
    process.stdout.write(
      `| ${caseName} | ${names.map(cell).join(' | ')} | ${ratio('xufa (JS)', 'ws (JS)')} | ${ratio('xufa + bufferutil', 'ws + bufferutil')} |\n`
    );
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[2] === '--child') child(process.argv[3], process.argv[4], Number(process.argv[5]));
else main();
