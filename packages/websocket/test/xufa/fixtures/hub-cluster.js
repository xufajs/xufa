// Two workers, each with a WebSocket server of its own port and a client of it in the room 'room'. Each worker sends
// { from: id } to the room; each client must get both messages. The workers report to the primary (JSON lines).
const http = require('node:http');
const { start, stop, bus } = require('@xufa/cluster');
const { WebSocket, WebSocketServer } = require('../../..');
const { Hub } = require('../../../lib/hub');

const WORKERS = 2;
const report = (data) => process.stdout.write(`${JSON.stringify(data)}\n`);

start({
  workers: WORKERS,
  async primary() {
    new Hub({ bus }); // eslint-disable-line no-new
    let ready = 0;
    let reports = 0;
    bus.on('ready', () => {
      ready += 1;
      if (ready === WORKERS) bus.broadcast('send');
    });
    bus.on('report', async (data) => {
      report(data);
      reports += 1;
      if (reports === WORKERS) {
        await stop();
        process.exit(0);
      }
    });
  },
  async worker({ id }) {
    const hub = new Hub({ bus });
    // A port of its own (exclusive): in a cluster, workers listening to port 0 share one port of the primary, and the
    // client could reach the server of the other worker.
    const server = http.createServer();
    await new Promise((resolve) => server.listen({ port: 0, host: '127.0.0.1', exclusive: true }, resolve));
    const wss = new WebSocketServer({ server });
    wss.on('connection', (socket) => hub.add(socket, { rooms: ['room'] }));
    const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`);
    const got = [];
    client.on('message', (data) => {
      got.push(JSON.parse(String(data)));
      if (got.length === WORKERS) {
        got.sort((a, b) => a.from - b.from);
        bus.send('report', { worker: id, got });
      }
    });
    await new Promise((resolve) => client.once('open', resolve));
    while (hub.local('room').length === 0) await new Promise((resolve) => setTimeout(resolve, 5));
    bus.on('send', () => hub.to('room').send({ from: id }));
    bus.send('ready');
  },
});
