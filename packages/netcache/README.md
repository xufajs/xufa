# @xufa/netcache

A cache shared by the machines of a service. Each node keeps a copy, so reads do not leave the machine, and every set,
delete and clear is sent to the other nodes over TCP; the nodes find each other with
[@xufa/discovery](../discovery). It has the methods of the caches of @xufa/orm (`get`, `set`, `delete`, `clear`), so
the models of a database, the lockouts of @xufa/auth, or anything else can be cached once for every machine.

```sh
npm install @xufa/netcache
```

```js
const { NetCache } = require('@xufa/netcache');
const { Database } = require('@xufa/orm');

const cache = await new NetCache({ secret: process.env.CACHE_SECRET, service: 'shop' }).start();
const db = new Database({ backend: 'postgres', url: process.env.DATABASE_URL, cache });
// Models with the option cache are read from the copy of this machine; what one machine saves, every copy forgets.

await cache.set('rates', { eur: 1.08 }, 60000); // every machine, for a minute
await cache.get('rates'); // a copy, from this machine
```

## How it stays right

- **Versions.** Every write carries a version of a hybrid clock (time of the machine, a counter, the node): two writes
  of a key on two machines end the same on every machine, the later one winning.
- **Deletes and clears are remembered** (`tombstoneTtl`, a minute): a write older than them that arrives late does not
  bring the value back.
- **Nothing is lost quietly.** Each node keeps the writes it sent to each peer until the peer acknowledges them
  (`queue`). A connection that breaks is opened again, the peer says the last write it applied, and the rest is sent.
  When that is not possible (more writes than `queue`, or a node wrote before it knew of a peer that was there), the
  peer empties its copy: an empty cache asks the database, a stale one would answer wrong.
- **Warm start.** A node that starts gets the entries of its first peer (`sync`). `start()` resolves once the nodes
  that are there are connected, so the writes of the node reach them.
- **Values** are kept serialized (v8): Dates, Buffers, BigInts, Maps and Sets come back as they were, and each read is
  a copy. Every node should run the same major version of Node.js.

It is a cache, not a database: the copies agree within the time a write takes to cross the network, and counters
updated on two machines at the same instant (a read, then a write) can lose one of the two.

## Options

| Option         | Default  | What it does                                                                                                  |
| -------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `secret`       |          | 16 bytes or more: required, unless `insecure: true`.                                                          |
| `service`      | `'xufa'` | Nodes of other services are not peers.                                                                        |
| `max`          | `10000`  | Keys kept in each copy, the least used dropped first.                                                         |
| `ttl`          | `0`      | Milliseconds values live by default (0: until dropped).                                                       |
| `port`, `host` | `0`, all | The TCP port and address this node listens on.                                                                |
| `advertise`    |          | The address the others connect to, when it is not the one they see (NAT, containers).                         |
| `queue`        | `10000`  | Writes kept for each peer until it acknowledges them.                                                         |
| `sync`         | `true`   | A node that starts gets the entries of its first peer.                                                        |
| `settle`       | `300`    | Milliseconds `start()` waits for the nodes there to answer.                                                   |
| `tombstoneTtl` | `60000`  | Milliseconds deletes and clears are remembered.                                                               |
| `maxFrame`     | 16 MiB   | The largest frame accepted.                                                                                   |
| `marshal`      |          | `true` or a Registry of @xufa/marshal: values keep their classes (nodes with and without it read each other). |
| `discovery`    | `{}`     | The options of @xufa/discovery (transport, seeds...), or a `Discovery` of the app.                            |

In clouds, where there is no multicast: `discovery: { transport: 'unicast', seeds: ['cache-seed:29050'] }`.

## API

`start()`, `stop()`; `get(key)`, `set(key, value, ttl)`, `delete(keys)`, `clear(prefix)`; `size`, `connected` (the ids
of the peers connected), `stats` (`sent`, `applied`, `ignored`, `resent`, `resets`, `snapshots`). Events: `peer` (id,
`'connected'` or `'disconnected'`), `change` (a write of another node applied), `reset`, `synced`, `error`. `health({ minPeers })` is a check of `xufa.health` of [@xufa/http](../http): down when
not started, degraded when peers it knows are not connected (or fewer than `minPeers`); not critical by default.

## Security

Connections are authenticated with the secret: each side proves it knows it, and the key of each connection is
derived from the secret and random values of both sides. Every frame is sealed with AES-256-GCM under a counter, so it
cannot be read, changed, dropped, reordered or replayed. The discovery of the nodes is sealed with the same secret.
Without a secret (`insecure: true`), any machine of the network can read and write the cache.

## With @xufa/cluster

One NetCache by machine, in the primary, and the workers reach it through the bus with the SharedCache of @xufa/orm:

```js
const { start, bus } = require('@xufa/cluster');
const { SharedCache, Database } = require('@xufa/orm');
const { NetCache } = require('@xufa/netcache');

start({
  primary: async ({ onShutdown }) => {
    const store = await new NetCache({ secret, service: 'shop' }).start();
    new SharedCache({ bus, store }); // the copy of this machine, for its workers
    onShutdown(() => store.stop());
  },
  worker: async () => {
    const db = new Database({ backend: 'postgres', url, cache: new SharedCache({ bus }) });
  },
});
```

## With @xufa/auth

`new Lockout({ store: cache })`: failed logins are counted on every machine, so an attacker gains nothing by spreading
attempts among them.

## Faults (tests of resilience)

`cache.faults` (of [@xufa/faults](../faults)) makes `get`, `set`, `delete` and `clear` fail, wait or hang
(`read` and `write` as groups; `keys` by prefix or regular expression):

```js
cache.faults.down(); // until cache.faults.up()
cache.faults.fail({ operations: 'read', keys: 'session:', rate: 0.1 });
```

As the store of [@xufa/orm](../orm), reads and writes that fail are misses (the database answers, and
`onCacheError` is told); deletes that fail are errors.

## License

MIT
