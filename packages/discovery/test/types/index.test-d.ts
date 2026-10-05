import { expectType, expectError } from 'tsd';
import { Discovery, DiscoveryError, createDiscovery, type Peer } from '../..';

type Meta = { url: string; role: 'api' | 'worker' };
const discovery = createDiscovery<Meta>({ service: 'shop', meta: { url: 'http://10.0.0.5:3000', role: 'api' } });
expectType<Discovery<Meta>>(discovery);
expectType<Promise<Discovery<Meta>>>(discovery.start());
expectType<Peer<Meta>[]>(discovery.peers);
expectType<Peer<Meta> | undefined>(discovery.get('id'));

discovery.on('up', (peer) => expectType<string>(peer.meta.url));
discovery.on('down', (peer, reason) => expectType<'bye' | 'timeout'>(reason));
discovery.on('update', (peer, previous) => expectType<Meta>(previous));
discovery.on('message', (event, data, peer) => expectType<string>(event));

expectType<Promise<Peer<Meta>[]>>(discovery.waitFor((peers) => peers.length >= 2, { timeout: 5000 }));
expectType<Promise<void>>(discovery.send('hi', { n: 1 }, { to: 'id' }));
new Discovery({ transport: 'unicast', seeds: ['10.0.0.2:29050', ['10.0.0.3', 29050]], secret: Buffer.alloc(32) });

expectError(new Discovery({ transport: 'tcp' }));
expectError(discovery.send(1));
const err = new DiscoveryError();
expectType<DiscoveryError["code"]>(err.code);
