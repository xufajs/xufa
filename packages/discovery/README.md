# @xufa/discovery

The nodes of a service find each other on the network by UDP: each one says it is there every second, with its meta
(its URL, its role...), and the others hold it as a peer until it says goodbye or is not heard for a while. A node that
starts is seen at once. Multicast on a local network, broadcast where multicast is filtered, and seeds where there is
neither (most clouds). With a secret, packets are encrypted and authenticated. No dependencies.

```sh
npm install @xufa/discovery
```

```js
const { Discovery } = require('@xufa/discovery');

const discovery = new Discovery({
  service: 'shop-api',
  meta: { url: `http://${process.env.HOST}:3000`, role: 'api' },
  secret: process.env.DISCOVERY_SECRET, // 16 bytes or more
});
discovery.on('up', (peer) => console.log('up', peer.meta.url));
discovery.on('down', (peer, reason) => console.log('down', peer.id, reason)); // 'bye' or 'timeout'
await discovery.start();

discovery.peers; // [{ id, service, address, port, meta, since, lastSeen }]
await discovery.waitFor((peers) => peers.length >= 2); // three nodes, this one included
```

## Options

| Option             | Default             | What it does                                                                 |
| ------------------ | ------------------- | ---------------------------------------------------------------------------- |
| `service`          | `'xufa'`            | Nodes of other services are not peers (they can share the port).             |
| `transport`        | `'multicast'`       | `'multicast'`, `'broadcast'` or `'unicast'`.                                 |
| `port`             | `29050`             | Shared by the nodes of a machine with multicast and broadcast; `0` for any.  |
| `address`          | `'0.0.0.0'`         | The address bound.                                                           |
| `group`            | `'239.255.29.5'`    | The multicast group (organization-local).                                    |
| `ttl`              | `1`                 | Hops multicast goes through: 1 is the local network, 0 this machine.         |
| `interface`        |                     | The IPv4 address of the interface multicast is sent on (the default one).    |
| `broadcastAddress` | `'255.255.255.255'` | Or the one of a subnet, such as `'10.0.0.255'`.                              |
| `seeds`            | `[]`                | `'host:port'` or `[host, port]`: told too, with any transport.               |
| `interval`         | `1000`              | Milliseconds between announcements (±10%, so nodes do not all send at once). |
| `timeout`          | `3.5 × interval`    | Milliseconds a peer is kept without being heard.                             |
| `secret`           |                     | 16 bytes or more: packets are sealed, and only nodes that know it are peers. |
| `maxSkew`          | `30000`             | With a secret, packets older or newer than this are refused.                 |
| `meta`             | `{}`                | What this node tells the others (JSON, in a packet of 1400 bytes at most).   |
| `id`               | a random UUID       | The id of this node.                                                         |

## API

- `start()` binds the socket, says hello (the others answer at once) and starts announcing; `stop()` says goodbye
  and closes it.
- `peers` (copies), `get(id)`, `port` (the one bound), `stats` (`sent`, `received`, `dropped`, `sendErrors`).
- `setMeta(meta)`: the others see the change at once (`update`).
- `send(event, data, { to })`: a message to every peer, or to one; `message` (`event`, `data`, `peer`) where it
  arrives. Datagrams can be lost: what must arrive needs an answer and a retry, or another channel (HTTP to the
  `meta.url` of the peer).
- `waitFor(predicate, { timeout })`: the peers once `predicate(peers)` holds.
- Events: `up` (peer), `down` (peer, `'bye'` or `'timeout'`), `update` (peer, previous meta), `message`, and `error`
  (errors of the socket, only when there is a listener).

## Transports

- **Multicast** (the default): the nodes join a group on every IPv4 interface, so nodes of one machine and of the
  local network find each other. Routers do not pass it on unless `ttl` is raised and they route multicast.
- **Broadcast**: the whole subnet, where switches filter multicast. It does not cross routers.
- **Unicast**: the node says it is there to its `seeds` and to every peer it knows, and passes on the addresses it
  knows, so a node that knows one seed finds every node that seed knows. For clouds (AWS, GCP and Azure carry neither
  multicast nor broadcast), containers on different hosts, and VPNs. Each node binds a port of its own.

## Security

Without a secret, any machine of the network can be a peer, read the meta, and forge packets: the meta is not the
place for secrets, and a peer is not trusted. With a `secret`, packets are sealed with AES-256-GCM (a key derived
from the secret and the service), so they cannot be read or changed by those without it, and packets older than
`maxSkew` or seen already (a sequence per node) are refused. Hellos are answered at most once every 20 ms, so forged
ones do not make a node flood the network.

## With @xufa/cluster

One discovery by machine, in the primary; the workers ask it through the bus:

```js
const { start, bus } = require('@xufa/cluster');
const { Discovery } = require('@xufa/discovery');

start({
  primary: async ({ onShutdown }) => {
    const discovery = await new Discovery({ service: 'shop-api', meta: { url: myUrl } }).start();
    bus.on('peers', () => discovery.peers.map((peer) => peer.meta.url));
    onShutdown(() => discovery.stop());
  },
  worker: async () => {
    const urls = await bus.request('peers');
  },
});
```

## TypeScript

Declarations included, with the type of the meta: `new Discovery<{ url: string }>(...)` types `peer.meta`.

## License

MIT
