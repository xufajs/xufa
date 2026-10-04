// A TCP proxy that makes a local server look remote: it adds a one-way latency and a bandwidth to the bytes of
// every connection, both ways, in order. For the benchmarks of database drivers.
//
// node netem.js [--listen 27019] [--target 127.0.0.1:27017] [--latency 1] [--mbps 1000]
const net = require('node:net');

function parseArgs(argv) {
  const args = { listen: 27019, target: '127.0.0.1:27017', latency: 1, mbps: 1000 };
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i].replace(/^--/, '');
    if (!(name in args)) throw new Error(`Unknown option --${name}`);
    args[name] = name === 'target' ? argv[i + 1] : Number(argv[i + 1]);
  }
  return args;
}

// Sends the chunks of `from` to `to` as a link of that latency (ms) and bandwidth (bytes per ms) would deliver them.
// The chunks wait in a queue with the time they arrive, and one timer at a time delivers them, so they keep their
// order (timers of different delays do not always fire in the order they were set).
function link(from, to, latency, bytesPerMs) {
  let free = 0;
  const queue = [];
  let timer = null;
  const deliver = () => {
    timer = null;
    const now = performance.now();
    while (queue.length && queue[0].at <= now) {
      const { chunk } = queue.shift();
      if (chunk === null) to.destroy();
      else if (!to.destroyed) to.write(chunk);
    }
    if (queue.length) timer = setTimeout(deliver, Math.max(0, queue[0].at - now));
  };
  const push = (chunk, at) => {
    queue.push({ chunk, at });
    if (!timer) timer = setTimeout(deliver, Math.max(0, queue[0].at - performance.now()));
  };
  from.on('data', (chunk) => {
    // The chunk leaves when the link is free, takes its size over the bandwidth to go, and arrives after the latency.
    const start = Math.max(performance.now(), free);
    free = start + chunk.length / bytesPerMs;
    push(chunk, free + latency);
  });
  from.on('close', () => push(null, Math.max(performance.now(), free) + latency));
  from.on('error', () => to.destroy());
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const [host, port] = args.target.split(':');
  const bytesPerMs = (args.mbps * 1e6) / 8 / 1000;
  const server = net.createServer((client) => {
    client.setNoDelay(true);
    const upstream = net.connect(Number(port), host);
    upstream.setNoDelay(true);
    link(client, upstream, args.latency, bytesPerMs);
    link(upstream, client, args.latency, bytesPerMs);
  });
  server.listen(args.listen, () => {
    console.log(`netem: ${args.listen} -> ${args.target}, ${args.latency} ms each way, ${args.mbps} Mbit/s`);
  });
}

main();
