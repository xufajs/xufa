import { assertType, expectTypeOf } from '@xufa/test';
import { NetCache, NetCacheError } from '../..';
import { Cache, Database, SharedCache, CacheBus } from '@xufa/orm';

const cache = new NetCache({ secret: 'a secret of sixteen bytes', service: 'shop', ttl: 60000, discovery: { transport: 'unicast', seeds: ['10.0.0.2:29050'] } });
expectTypeOf(cache.start()).toEqualTypeOf<Promise<NetCache>>();
expectTypeOf(cache.get<{ n: number }>('k')).toEqualTypeOf<Promise<{ n: number } | undefined>>();
expectTypeOf(cache.set('k', { n: 1 }, 1000)).toEqualTypeOf<Promise<void>>();
expectTypeOf(cache.delete(['a', 'b'])).toEqualTypeOf<Promise<void>>();
expectTypeOf(cache.clear('book:')).toEqualTypeOf<Promise<void>>();
expectTypeOf(cache.connected).toEqualTypeOf<string[]>();
cache.on('peer', (id, state) => expectTypeOf(state).toEqualTypeOf<'connected' | 'disconnected'>());
cache.on('change', (change) => expectTypeOf(change.key).toEqualTypeOf<string>());
new NetCache({ insecure: true });
// @ts-expect-error
new NetCache({ secret: 1 });
expectTypeOf(new NetCacheError().code).toEqualTypeOf<'XUFA_NETCACHE_ERR_OPTIONS'>();

// A cache of @xufa/orm: of a Database, and the store of a SharedCache.
assertType<Cache>(cache);
declare const bus: CacheBus;
expectTypeOf(new Database({ backend: 'memory', cache })).toEqualTypeOf<Database>();
assertType<Cache>(new SharedCache({ bus, store: cache }));

// Faults.
cache.faults.down();
cache.faults.fail({ operations: ['get'], keys: [/^session:/] });
// @ts-expect-error
cache.faults.fail({ operations: 'send' });
