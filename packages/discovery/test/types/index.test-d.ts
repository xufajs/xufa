import { expectTypeOf } from '@xufa/test';
import { Discovery, DiscoveryError, createDiscovery, type Peer } from '../..';

type Meta = { url: string; role: 'api' | 'worker' };
const discovery = createDiscovery<Meta>({ service: 'shop', meta: { url: 'http://10.0.0.5:3000', role: 'api' } });
expectTypeOf(discovery).toEqualTypeOf<Discovery<Meta>>();
expectTypeOf(discovery.start()).toEqualTypeOf<Promise<Discovery<Meta>>>();
expectTypeOf(discovery.peers).toEqualTypeOf<Peer<Meta>[]>();
expectTypeOf(discovery.get('id')).toEqualTypeOf<Peer<Meta> | undefined>();

discovery.on('up', (peer) => expectTypeOf(peer.meta.url).toEqualTypeOf<string>());
discovery.on('down', (peer, reason) => expectTypeOf(reason).toEqualTypeOf<'bye' | 'timeout'>());
discovery.on('update', (peer, previous) => expectTypeOf(previous).toEqualTypeOf<Meta>());
discovery.on('message', (event, data, peer) => expectTypeOf(event).toEqualTypeOf<string>());

expectTypeOf(discovery.waitFor((peers) => peers.length >= 2, { timeout: 5000 })).toEqualTypeOf<Promise<Peer<Meta>[]>>();
expectTypeOf(discovery.send('hi', { n: 1 }, { to: 'id' })).toEqualTypeOf<Promise<void>>();
new Discovery({ transport: 'unicast', seeds: ['10.0.0.2:29050', ['10.0.0.3', 29050]], secret: Buffer.alloc(32) });

// @ts-expect-error
new Discovery({ transport: 'tcp' });
// @ts-expect-error
discovery.send(1);
const err = new DiscoveryError();
expectTypeOf(err.code).toEqualTypeOf<DiscoveryError["code"]>();
