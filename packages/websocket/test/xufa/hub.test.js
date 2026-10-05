// The hub: rooms in one process, between machines (two NetCaches here), and between the workers of a cluster.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { WebSocket, WebSocketServer } = require('../..');
const { Hub } = require('../../lib/hub');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const closers = [];
afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close();
});

// A server whose sockets join the hub with the rooms of ?rooms=a,b; a socket that sends { to, except, data } sends
// data to those rooms (or to everyone), itself left out with except. Its port.
async function serverOf(hub) {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise((resolve) => wss.once('listening', resolve));
  wss.on('connection', (socket, request) => {
    const rooms = new URL(request.url, 'http://x').searchParams.get('rooms');
    hub.add(socket, { rooms: rooms ? rooms.split(',') : [] });
    socket.on('message', (text) => {
      const { to, except, data } = JSON.parse(text);
      const target = hub.to(...(to ? [to] : []));
      if (except) target.except(socket);
      if (to) target.send(data);
      else hub.send(data);
    });
  });
  closers.push(() => new Promise((resolve) => wss.close(resolve)));
  return wss.address().port;
}

// A client that keeps what it gets (JSON).
async function clientOf(port, rooms = []) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/?rooms=${rooms.join(',')}`);
  ws.got = [];
  ws.on('message', (data) => ws.got.push(JSON.parse(String(data))));
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  closers.push(() => ws.terminate());
  return ws;
}
const until = async (check, ms = 3000) => {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await sleep(10);
};

describe('a hub in one process', () => {
  it('rooms, except, everyone, and sockets that close leave', async () => {
    const hub = new Hub();
    const port = await serverOf(hub);
    const a = await clientOf(port, ['lobby']);
    const b = await clientOf(port, ['lobby', 'admins']);
    const c = await clientOf(port, []);
    await until(() => hub.sockets.size === 3);
    a.send(JSON.stringify({ to: 'lobby', except: true, data: { text: 'hi' } }));
    await until(() => b.got.length === 1);
    hub.to('admins').send({ alert: 1 });
    hub.send({ all: true });
    await until(() => c.got.length === 1 && b.got.length === 3 && a.got.length === 1);
    expect(a.got).toEqual([{ all: true }]);
    expect(b.got).toEqual([{ text: 'hi' }, { alert: 1 }, { all: true }]);
    expect(c.got).toEqual([{ all: true }]);
    expect(hub.local('lobby')).toHaveLength(2);
    b.close();
    await until(() => hub.local('lobby').length === 1);
    expect(hub.local('lobby')).toHaveLength(1);
    expect(hub.local('admins')).toEqual([]);
  });

  it('bytes are sent as binary, as they are', async () => {
    const hub = new Hub();
    const port = await serverOf(hub);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?rooms=r`);
    const got = new Promise((resolve) => ws.once('message', (data, isBinary) => resolve([Buffer.from(data), isBinary])));
    await new Promise((resolve) => ws.once('open', resolve));
    closers.push(() => ws.terminate());
    await until(() => hub.local('r').length === 1);
    hub.to('r').send(Buffer.from([1, 2, 3]));
    expect(await got).toEqual([Buffer.from([1, 2, 3]), true]);
  });
});

describe('a hub between machines (through @xufa/netcache)', () => {
  it('what one machine sends to a room reaches the sockets of that room on the others', async () => {
    const { NetCache } = require('@xufa/netcache');
    const cacheOf = async (seed) => {
      const cache = await new NetCache({
        secret: 'a secret of sixteen bytes or more',
        host: '127.0.0.1',
        settle: 100,
        discovery: {
          transport: 'unicast',
          port: 0,
          address: '127.0.0.1',
          interval: 50,
          seeds: seed ? [`127.0.0.1:${seed.discovery.port}`] : [],
        },
      }).start();
      closers.push(() => cache.stop());
      return cache;
    };
    const cacheA = await cacheOf();
    const cacheB = await cacheOf(cacheA);
    await until(() => cacheA.connected.length === 1 && cacheB.connected.length === 1);
    const hubA = new Hub({ cache: cacheA });
    const hubB = new Hub({ cache: cacheB });
    const onA = await clientOf(await serverOf(hubA), ['room']);
    const onB = await clientOf(await serverOf(hubB), ['room']);
    const elsewhere = await clientOf(await serverOf(hubB), ['other']);
    await until(() => hubA.local('room').length === 1 && hubB.local('room').length === 1);
    onA.send(JSON.stringify({ to: 'room', data: { from: 'A' } }));
    hubB.to('room').except(hubB.local('room')[0]).send({ from: 'B, not to its own' });
    await until(() => onB.got.length === 1 && onA.got.length === 2);
    expect(onA.got).toEqual([{ from: 'A' }, { from: 'B, not to its own' }]);
    expect(onB.got).toEqual([{ from: 'A' }]);
    expect(elsewhere.got).toEqual([]);
  });
});

describe('a hub in a cluster (through @xufa/cluster)', () => {
  it('what a worker sends to a room reaches the sockets of that room in the other workers', () => {
    const result = spawnSync(process.execPath, [path.join(__dirname, 'fixtures', 'hub-cluster.js')], {
      timeout: 30000,
    });
    const lines = result.stdout
      .toString()
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    expect(result.status).toBe(0);
    expect(lines.sort((x, y) => x.worker - y.worker)).toEqual([
      { worker: 1, got: [{ from: 1 }, { from: 2 }] },
      { worker: 2, got: [{ from: 1 }, { from: 2 }] },
    ]);
  });
});
