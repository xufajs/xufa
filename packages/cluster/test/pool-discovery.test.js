// End to end: a pool fed by a real Discovery of @xufa/discovery (UDP, unicast on 127.0.0.1), its nodes other processes
// that do work over HTTP. The nodes are found as they start (with their slots from their meta), each never gets more
// work at once than its slots, a node that leaves (goodbye) or dies (killed: no goodbye, gone after the timeout) takes
// no more work and its leases are taken back, a node that comes up is used, and with every node gone the fallback (a
// load balancer) takes the work.
import path from 'node:path';
import http from 'node:http';
import { fork } from 'node:child_process';
import { Discovery } from '@xufa/discovery';
import { Bus, Pool, PoolClient } from '../index.js';

const NODE = path.join(import.meta.dirname, 'fixtures', 'discovery-node.js');
const sleep = (wait) => new Promise((resolve) => setTimeout(resolve, wait));

const get = (url, signal) =>
  new Promise((resolve, reject) => {
    const request = http.get(url, { signal }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => (body += chunk));
      response.on('end', () => resolve(JSON.parse(body)));
    });
    request.on('error', reject);
  });

describe('a pool fed by a Discovery (other processes, UDP and HTTP)', () => {
  let discovery;
  let pool;
  let client;
  const children = [];

  // A node in another process: its name, slots, and how long its work takes.
  const start = (name, slots, workMs = 80) =>
    new Promise((resolve, reject) => {
      const child = fork(NODE, [String(discovery.port), name, String(slots), String(workMs)], { stdio: 'inherit' });
      children.push(child);
      child.once('message', () => resolve(child));
      child.once('error', reject);
    });
  // The meta of a node of the pool: that of its peer (the stats of the pool have the ids).
  const metaOf = (id) => (discovery.peers.find((peer) => peer.id === id) || { meta: {} }).meta;
  const nodeNames = () =>
    pool
      .stats()
      .byNode.map((node) => metaOf(node.id).name)
      .sort();
  const until = async (check, timeout = 5000) => {
    const end = Date.now() + timeout;
    while (!check()) {
      if (Date.now() > end) throw new Error('timed out waiting');
      await sleep(20);
    }
  };

  beforeAll(async () => {
    discovery = new Discovery({
      service: 'pool-e2e',
      transport: 'unicast',
      port: 0,
      address: '127.0.0.1',
      interval: 50,
      timeout: 400,
    });
    await discovery.start();
    const bus = new Bus();
    pool = new Pool('workers', { bus, nodes: discovery, slots: (peer) => peer.meta.slots });
    client = new PoolClient('workers', { bus });
  });

  afterAll(async () => {
    for (const child of children) if (child.exitCode === null) child.kill('SIGKILL');
    if (pool) pool.close();
    if (discovery) await discovery.stop();
  });

  it('finds the nodes, and gives each no more work at once than its slots', async () => {
    await Promise.all([start('a', 1), start('b', 2), start('c', 3)]);
    await until(() => pool.stats().nodes === 3);
    expect(nodeNames()).toEqual(['a', 'b', 'c']);
    expect(pool.stats().slots).toBe(6);
    const works = Array.from({ length: 24 }, () =>
      client.use((node, { signal }) => get(`${node.meta.url}/work`, signal))
    );
    const done = await Promise.all(works);
    const by = {};
    for (const { name } of done) by[name] = (by[name] || 0) + 1;
    expect(Object.values(by).reduce((sum, n) => sum + n, 0)).toBe(24);
    for (const node of pool.stats().byNode) {
      const stats = await get(`${metaOf(node.id).url}/stats`);
      expect(stats.most).toBeLessThanOrEqual(metaOf(node.id).slots);
    }
    // The node with more slots does more of the work.
    expect(by.c).toBeGreaterThan(by.a);
  }, 30000);

  it('a node that leaves is dropped at once; one killed is dropped after the timeout; one that comes is used', async () => {
    const [a] = children;
    a.send('leave');
    await until(() => !nodeNames().includes('a'), 2000);
    // Killed: no goodbye. Its work in hand fails (and is tried on another node); it is gone after the timeout.
    const b = children[1];
    b.kill('SIGKILL');
    await new Promise((resolve) => b.once('exit', resolve));
    // While it is still a node (until the timeout), the work sent to it fails and goes to another.
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        client.use((node, { signal }) => get(`${node.meta.url}/work`, signal), { retries: 3 })
      )
    );
    expect(results.every((result) => result.name === 'c')).toBe(true);
    await until(() => !nodeNames().includes('b'), 3000);
    expect(nodeNames()).toEqual(['c']);
    await start('d', 2);
    await until(() => nodeNames().includes('d'));
    const names = new Set();
    await Promise.all(
      Array.from({ length: 10 }, () =>
        client.use((node, { signal }) => get(`${node.meta.url}/work`, signal)).then((r) => names.add(r.name))
      )
    );
    expect([...names].sort()).toEqual(['c', 'd']);
  }, 30000);

  it('every node gone: the fallback (a load balancer) takes the work', async () => {
    for (const child of children) if (child.exitCode === null) child.send('leave');
    await until(() => pool.stats().nodes === 0, 3000);
    const result = await client.use((node, { fallback }) => ({ on: node.id, fallback }), {
      fallback: { wait: 200, node: { id: 'balancer' } },
    });
    expect(result).toEqual({ on: 'balancer', fallback: true });
  }, 30000);
});
