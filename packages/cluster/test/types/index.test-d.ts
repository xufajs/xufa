import { expectTypeOf } from '@xufa/test';
import { start, bus, createPool, usePool, PoolStats, Lease, PoolError, ormSlots, PoolClient, Bus } from '../..';
import { Database } from '@xufa/orm';

start({
  workers: 2,
  primary: async ({ bus: primaryBus }) => {
    primaryBus.on('add', ({ a, b }) => a + b);
  },
  worker: async ({ id, onShutdown }) => {
    expectTypeOf(id).toEqualTypeOf<number>();
    expectTypeOf(await bus.request<number>('add', { a: 1, b: 2 })).toEqualTypeOf<number>();
    onShutdown(() => {});
  },
});

interface Converter {
  id: string;
  meta: { url: string };
}

const pool = createPool<Converter>('converters', {
  nodes: [{ id: 'a', meta: { url: 'http://a' } }],
  slots: () => 2,
  leaseTimeout: '5m',
  autoscale: { perNode: 2, max: 8, scale: (count) => count },
});
pool.on('demand', (stats) => expectTypeOf(stats.waiting).toEqualTypeOf<number>());
expectTypeOf(pool.stats()).toEqualTypeOf<PoolStats>();
expectTypeOf(pool.stats().waitingByKind).toEqualTypeOf<Record<string, number>>();
if (pool.autoscaler) {
  pool.autoscaler.min = 2;
  pool.autoscaler.active = false;
  expectTypeOf(pool.autoscaler.wanted({ waiting: 3, running: 1 })).toEqualTypeOf<number>();
}

const converters = usePool<Converter>('converters');
expectTypeOf(converters.use((node, { signal, attempt }) => node.meta.url, { retries: 2 })).toEqualTypeOf<Promise<string>>();
expectTypeOf(converters.acquire({ priority: 1 })).toEqualTypeOf<Promise<Lease<Converter>>>();
converters.use((node) => node.id, { kind: 'convert' });
new Bus().requestThen<number>('double', 2, {}, (err, reply) => expectTypeOf(reply).toEqualTypeOf<number | undefined>());
// @ts-expect-error
createPool('x', { slots: 'two' });
expectTypeOf(new PoolError().statusCode).toEqualTypeOf<number>();

const slots = ormSlots(new Database({ backend: 'memory' }), { ttl: '30s' });
createPool('shared', { nodes: ['a'], shared: slots, pollEvery: '200ms', busyFor: '2s' }).on('busy', ({ node }) =>
  expectTypeOf(node.id).toEqualTypeOf<string | number>()
);
expectTypeOf(slots.held('shared')).toEqualTypeOf<Promise<Record<string, number>>>();
createPool('told', { nodes: ['a'], shared: slots, notify: { publish: () => {}, subscribe: () => () => {} } });
usePool('shared', { busy: (err) => err instanceof Error }).use(() => 1, { maxBusy: 5 });
declare const netcache: import('@xufa/netcache').NetCache;
declare const discovery: import('@xufa/discovery').Discovery;
createPool('by-netcache', { nodes: ['a'], shared: slots, notify: netcache });
createPool('by-discovery', { nodes: ['a'], shared: slots, notify: discovery });
expectTypeOf(pool.health({ minNodes: 2, maxWaiting: 10 }).critical).toEqualTypeOf<boolean>();
converters
  .health()
  .check()
  .then((result) => expectTypeOf(result.waiting).toEqualTypeOf<number | undefined>());

// use() with a fallback: a load balancer after two attempts, or when no node is free in 10 s.
{
  const lbClient = new PoolClient('converters', { bus: new Bus() });
  lbClient.use((node, { fallback, attempt }) => (fallback ? `lb ${attempt}` : node.id), {
    retries: 3,
    fallback: { after: 2, node: { id: 'lb', url: 'http://lb' } },
  });
  lbClient.use(() => 1, { fallback: { wait: '10s', node: (attempt) => ({ id: `lb${attempt}` }) } });
  // @ts-expect-error
  lbClient.use(() => 1, { fallback: { node: { id: 'lb' } } });
}
