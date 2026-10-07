import { expectType, expectError } from 'tsd';
import { start, bus, createPool, usePool, PoolStats, Lease, PoolError, ormSlots } from '../..';
import { Database } from '@xufa/orm';

start({
  workers: 2,
  primary: async ({ bus: primaryBus }) => {
    primaryBus.on('add', ({ a, b }) => a + b);
  },
  worker: async ({ id, onShutdown }) => {
    expectType<number>(id);
    expectType<number>(await bus.request<number>('add', { a: 1, b: 2 }));
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
pool.on('demand', (stats) => expectType<number>(stats.waiting));
expectType<PoolStats>(pool.stats());

const converters = usePool<Converter>('converters');
expectType<Promise<string>>(converters.use((node, { signal, attempt }) => node.meta.url, { retries: 2 }));
expectType<Promise<Lease<Converter>>>(converters.acquire({ priority: 1 }));
expectError(createPool('x', { slots: 'two' }));
expectType<number>(new PoolError().statusCode);

const slots = ormSlots(new Database({ backend: 'memory' }), { ttl: '30s' });
createPool('shared', { nodes: ['a'], shared: slots, pollEvery: '200ms', busyFor: '2s' }).on('busy', ({ node }) =>
  expectType<string | number>(node.id)
);
expectType<Promise<Record<string, number>>>(slots.held('shared'));
createPool('told', { nodes: ['a'], shared: slots, notify: { publish: () => {}, subscribe: () => () => {} } });
usePool('shared', { busy: (err) => err instanceof Error }).use(() => 1, { maxBusy: 5 });
declare const netcache: import('@xufa/netcache').NetCache;
declare const discovery: import('@xufa/discovery').Discovery;
createPool('by-netcache', { nodes: ['a'], shared: slots, notify: netcache });
createPool('by-discovery', { nodes: ['a'], shared: slots, notify: discovery });
expectType<boolean>(pool.health({ minNodes: 2, maxWaiting: 10 }).critical);
converters.health().check().then((result) => expectType<number | undefined>(result.waiting));
