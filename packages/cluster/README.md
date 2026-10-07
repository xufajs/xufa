# @xufa/cluster

Runs an app in a cluster of processes, one by CPU: the primary forks the workers, forks again those that die, and
stops them all gracefully. A bus carries events and requests between the processes, pools share other servers
among the workers, and the same code runs in one process in development and tests. No dependencies.

```js
const { start, bus } = require('@xufa/cluster');
const config = require('./config'); // loadConfig() of @xufa/config: read in every process

start({
  workers: config.cluster.workers, // os.availableParallelism() when undefined; 0 runs everything in one process
  primary: async ({ bus }) => {
    const counts = new Map();
    bus.on('hit', (path) => counts.set(path, (counts.get(path) || 0) + 1));
    bus.on('hits', () => Object.fromEntries(counts)); // a request: its result is the reply
  },
  worker: async ({ id, onShutdown }) => {
    const app = makeApp();
    app.addHook('onRequest', async (request) => bus.send('hit', request.url));
    app.get('/stats', () => bus.request('hits'));
    await app.listen({ port: config.server.port, host: '0.0.0.0' });
    onShutdown(() => app.close());
  },
});
```

## start(options)

| Option               | Default                     | What it does                                                                                                               |
| -------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `workers`            | `os.availableParallelism()` | How many workers; `0` (or `false`): one process, running both                                                              |
| `primary(context)`   |                             | Runs in the primary, before the workers are forked                                                                         |
| `worker(context)`    |                             | Runs in each worker                                                                                                        |
| `shutdownTimeout`    | `10000`                     | Milliseconds a worker has to stop before it is killed                                                                      |
| `restart`            | `true`                      | Workers that die are forked again                                                                                          |
| `onWorkerExit(info)` |                             | `{ id, code, signal, delay }` when a worker dies                                                                           |
| `signals`            | `true`                      | `SIGINT` and `SIGTERM` stop the cluster                                                                                    |
| `env`, `exec`        |                             | Variables of the workers; another file for them                                                                            |
| `marshal`            |                             | `true` or a Registry of @xufa/marshal: the data of the bus keeps its classes, and errors of handlers arrive as their class |

The context is `{ bus, id, isPrimary, isWorker, onShutdown }` (`id` 0 in the primary). `stop()`, `SIGINT` or `SIGTERM`
stop the cluster: every worker runs its `onShutdown` functions (in reverse order of registration) and exits, those that
do not in `shutdownTimeout` are killed, and then the primary runs its own. A worker that dies soon after it started (in
less than 5 s) is forked again after a delay that doubles each time (from 0.5 s up to 30 s).

## The bus

- `bus.on(event, handler)` / `off`: `handler(data, sender)`, the sender being the worker (in the primary) or `null`.
  Its result (or the promise of it) is the reply of requests.
- `bus.send(event, data)`: an event to the primary. `bus.request(event, data, { timeout })`: the reply of the primary's
  handler (30 s by default); an error of the handler rejects with a `BusError` (its message, name and code).
- `bus.sendTo(workerId, event, data)`: to a worker, from the primary. `bus.broadcast(event, data, { except, others })`:
  to every worker, from the primary or from a worker (through the primary; `others` leaves the sender out).

Messages use the IPC of `node:cluster` with the advanced serialization: Dates, Maps, Sets, BigInts, typed arrays and
shared references arrive as they were sent. With one process (`workers: 0`, or no `start()`, as in tests), the same
calls deliver to the handlers of that process.

[@xufa/orm](../orm)'s `SharedCache({ bus })` and `LocalCache({ bus })`, and the lockout of [@xufa/auth](../auth) with
a `SharedCache`, share their state through the bus.

## Pools of nodes

Work that goes to other servers taking a few tasks at once each (document converters, renderers) shares them through
a pool: the primary keeps the nodes, their slots and a queue of tickets, and gives each free slot to the next ticket,
whichever worker sent it. The work (the function, the request it answers) stays in the worker; only the ticket and the
node go through the bus.

```js
const { createPool, usePool } = require('@xufa/cluster');

// primary: the nodes (a list, or a Discovery of @xufa/discovery: peers, 'up', 'down')
createPool('converters', {
  nodes: discovery,
  slots: (peer) => peer.meta.slots || 1, // tasks a node takes at once
  leaseTimeout: '5m', // a lease longer is taken back: its work's signal aborted
  autoscale: { perNode: 2, max: 64, downAfter: '10m', scale: (count) => kubernetes.scale(count) },
});

// workers (and the primary; with workers: 0, the one process)
const converters = usePool('converters');
const result = await converters.use((node, { signal }) => post(`${node.meta.url}/convert`, body, { signal }), {
  retries: 2, // on other nodes
});
```

- A free slot goes to the next ticket (higher `priority` first), on the node with most free slots (between equals,
  the one given work longest ago). Tickets wait while there are no nodes.
- A slot comes back when the work ends, when its worker dies, when its node goes (`XUFA_POOL_NODE_DOWN`) and when
  its lease passes `leaseTimeout` (`XUFA_POOL_LEASE_TIMEOUT`): the last two abort the work's signal.
- `acquire({ priority, exclude, signal })` gives a lease to `release()` by hand; `stats()` the nodes, slots, free
  slots, leases running and tickets waiting. `waitTimeout` and `maxWaiting` reject tickets (503).
- `autoscale` wants `ceil((waiting + running) / perNode)` nodes, between `min` and `max`: up at once (then every
  `upEvery`), down only after the demand was lower for `downAfter`, so nodes running work are not taken away.
- Across machines: `shared: ormSlots(db, { ttl: '30s' })` keeps the slots in a database of [@xufa/orm](../orm)
  (any backend; table `xufa_pool_slots`), taken with an update only one machine can make, so a node never gets more
  works than its slots among every machine; those of a machine that died come back after `ttl`. With `notify` (a
  NetCache, a Discovery, or `{ publish, subscribe }`), a slot given back is told to the other machines, whose tickets
  waiting are served at once instead of at their next look (`pollEvery`). And a node that
  answers 429 (or what `busy(err)` says) is left aside for its Retry-After (or `busyFor`): `use()` runs the work
  elsewhere without counting an attempt (`maxBusy`).
- `pool.health({ minNodes, maxWaiting })` (or `usePool(name).health()` in a worker): a check of `xufa.health` of
  [@xufa/http](../http): down with fewer nodes than `minNodes` (1), degraded with more tickets waiting than
  `maxWaiting`; not critical by default.
- With [@xufa/queue](../queue), `define(name, handler, { pool })` makes its jobs wait for a node before they are
  claimed, and run with `job.node`.

## Faults (tests of resilience)

`bus.faults` (of [@xufa/faults](../faults)) loses, delays or holds the messages that a process sends, to see what an
app does when its workers miss events or requests get no reply:

```js
bus.faults.drop({ events: 'cache:invalidate', rate: 0.1 }); // 1 in 10 lost
bus.faults.delay({ operations: 'broadcast', ms: 500 });
bus.faults.fail({ operations: 'request', events: 'lock' }); // a BusError (code XUFA_FAULT)
bus.faults.drop({ operations: 'request' }); // no reply: the timeout of the request
```

- Operations: `send`, `sendTo`, `broadcast` (the group `events`) and `request`; the filter `events` (names or
  regular expressions).
- Events: `fail`, `down` and `drop` lose them; `delay` delivers them late; `hang` when released.
- Requests: `fail` and `down` reject with a `BusError`; `drop` rejects after the timeout of the request, as a lost
  message would; `delay` and `hang` wait before sending.
- The faults are those of the process that sends: in tests with one process, of every message.

## License

MIT.
