# @xufa/cluster

Runs an app in a cluster of processes, one by CPU: the primary forks the workers, forks again those that die, and
stops them all gracefully. A bus carries events and requests between the processes, and the same code runs in one
process in development and tests. No dependencies.

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
