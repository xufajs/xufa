import { expectType, expectError, expectAssignable } from 'tsd';
import { NetCache, NetCacheError } from '../..';
import { Cache, Database, SharedCache, CacheBus } from '@xufa/orm';

const cache = new NetCache({ secret: 'a secret of sixteen bytes', service: 'shop', ttl: 60000, discovery: { transport: 'unicast', seeds: ['10.0.0.2:29050'] } });
expectType<Promise<NetCache>>(cache.start());
expectType<Promise<{ n: number } | undefined>>(cache.get<{ n: number }>('k'));
expectType<Promise<void>>(cache.set('k', { n: 1 }, 1000));
expectType<Promise<void>>(cache.delete(['a', 'b']));
expectType<Promise<void>>(cache.clear('book:'));
expectType<string[]>(cache.connected);
cache.on('peer', (id, state) => expectType<'connected' | 'disconnected'>(state));
cache.on('change', (change) => expectType<string>(change.key));
new NetCache({ insecure: true });
expectError(new NetCache({ secret: 1 }));
expectType<'XUFA_NETCACHE_ERR_OPTIONS'>(new NetCacheError().code);

// A cache of @xufa/orm: of a Database, and the store of a SharedCache.
expectAssignable<Cache>(cache);
declare const bus: CacheBus;
expectType<Database>(new Database({ backend: 'memory', cache }));
expectAssignable<Cache>(new SharedCache({ bus, store: cache }));

// Faults.
cache.faults.down();
cache.faults.fail({ operations: ['get'], keys: [/^session:/] });
expectError(cache.faults.fail({ operations: 'send' }));
