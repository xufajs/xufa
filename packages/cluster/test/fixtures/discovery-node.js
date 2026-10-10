// A node of the end-to-end test of a pool fed by a Discovery: an HTTP server that does "work" (it waits, and counts
// how many it has at once), said to the others by a Discovery of @xufa/discovery (unicast, seeded by the primary's),
// with its URL and slots in its meta. It prints its port when it is ready.
//
//   node discovery-node.js <seed port> <name> <slots> <work ms>
import http from 'node:http';
import { Discovery } from '@xufa/discovery';

const [seedPort, name, slots, workMs] = process.argv.slice(2);
let now = 0;
let most = 0;
let done = 0;

const server = http.createServer((request, response) => {
  if (request.url === '/stats') {
    response.end(JSON.stringify({ name, most, done }));
    return;
  }
  now += 1;
  most = Math.max(most, now);
  setTimeout(() => {
    now -= 1;
    done += 1;
    response.end(JSON.stringify({ name }));
  }, Number(workMs));
});

server.listen(0, '127.0.0.1', async () => {
  const discovery = new Discovery({
    service: 'pool-e2e',
    transport: 'unicast',
    port: 0,
    address: '127.0.0.1',
    interval: 50,
    timeout: 400,
    seeds: [`127.0.0.1:${seedPort}`],
    meta: { url: `http://127.0.0.1:${server.address().port}`, slots: Number(slots), name },
  });
  await discovery.start();
  process.on('message', async (message) => {
    // A goodbye: the others drop it at once.
    if (message === 'leave') {
      await discovery.stop();
      server.close();
      process.exit(0);
    }
  });
  process.send({ ready: true, port: server.address().port });
});
