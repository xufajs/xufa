// start(): runs an app in a cluster: the primary forks the workers (one by CPU by default), forks again those that
// die (waiting longer each time one dies soon after it started), and stops them all gracefully (stop(), SIGINT or
// SIGTERM: every worker runs its shutdown functions, and those that do not exit in shutdownTimeout are killed).
//
//   start({
//     workers: 4,
//     primary: async ({ bus }) => { bus.on('count', () => counter++); },
//     worker: async ({ bus, onShutdown }) => { const app = makeApp(); await app.listen({ port: 3000 }); onShutdown(() => app.close()); },
//   });
//
// With workers: 0 there is one process, which runs both functions.
import cluster from 'node:cluster';
import os from 'node:os';

const SHUTDOWN = '__xufaShutdown';

// The young generation of V8 in the workers (MB of each half): under load V8 makes it grow to 64 MB a half, 128 MB
// a worker that holds no data (its live heap is some MB); 32 keeps a worker about 50 MB smaller with the same speed.
// semiSpace: false leaves V8's; a size of the app's own (execArgv, NODE_OPTIONS) is kept.
function workerArgv(semiSpace) {
  const given = [...process.execArgv, process.env.NODE_OPTIONS || ''].join(' ');
  if (semiSpace === false || /--max-semi-space-size/.test(given)) return process.execArgv;
  return [...process.execArgv, `--max-semi-space-size=${semiSpace ?? 32}`];
}
// A worker that dies in less than this was failing: the next is forked after a delay (doubled up to MAX_DELAY).
const QUICK_EXIT = 5000;
const MAX_DELAY = 30000;

function createContext(bus, id, isPrimary) {
  const shutdowns = [];
  return {
    bus,
    id,
    isPrimary,
    isWorker: !isPrimary || id === 0,
    shutdowns,
    // A function run when the cluster stops (in reverse order of registration).
    onShutdown(fn) {
      shutdowns.push(fn);
    },
  };
}

async function runShutdowns(context) {
  const fns = [...context.shutdowns].reverse();
  for (let i = 0; i < fns.length; i += 1) {
    try {
      await fns[i]();
    } catch (err) {
      process.emitWarning(err);
    }
  }
}

function createStarter(bus) {
  const state = { stopping: false, context: null, stop: null };

  async function startSingle(options) {
    const context = createContext(bus, 0, true);
    state.context = context;
    state.stop = async () => {
      if (state.stopping) return;
      state.stopping = true;
      await runShutdowns(context);
    };
    if (options.primary) await options.primary(context);
    if (options.worker) await options.worker(context);
    return context;
  }

  async function startPrimary(options) {
    const count = options.workers ?? os.availableParallelism();
    const { shutdownTimeout = 10000, restart = true } = options;
    cluster.setupPrimary({
      serialization: 'advanced',
      execArgv: workerArgv(options.semiSpace),
      ...(options.exec ? { exec: options.exec } : {}),
    });
    bus.listen();
    const context = createContext(bus, 0, true);
    state.context = context;
    let delay = 0;
    const startedAt = new Map();
    const fork = () => {
      const worker = cluster.fork(options.env);
      startedAt.set(worker.id, Date.now());
      return worker;
    };
    cluster.on('exit', (worker, code, signal) => {
      const lived = Date.now() - (startedAt.get(worker.id) || 0);
      startedAt.delete(worker.id);
      if (state.stopping || !restart) return;
      delay = lived < QUICK_EXIT ? Math.min(MAX_DELAY, delay ? delay * 2 : 500) : 0;
      if (options.onWorkerExit) options.onWorkerExit({ id: worker.id, code, signal, delay });
      setTimeout(fork, delay);
    });
    state.stop = async () => {
      if (state.stopping) return;
      state.stopping = true;
      const workers = Object.values(cluster.workers || {}).filter(Boolean);
      const exits = workers.map(
        (worker) =>
          new Promise((resolve) => {
            if (worker.isDead()) {
              resolve();
              return;
            }
            const timer = setTimeout(() => worker.kill(), shutdownTimeout);
            worker.once('exit', () => {
              clearTimeout(timer);
              resolve();
            });
            if (worker.isConnected()) worker.send({ [SHUTDOWN]: true });
          })
      );
      await Promise.all(exits);
      await runShutdowns(context);
    };
    if (options.primary) await options.primary(context);
    for (let i = 0; i < count; i += 1) fork();
    return context;
  }

  async function startWorker(options) {
    bus.listen();
    const context = createContext(bus, cluster.worker.id, false);
    state.context = context;
    state.stop = async () => {
      if (state.stopping) return;
      state.stopping = true;
      await runShutdowns(context);
      process.exit(0);
    };
    process.on('message', (message) => {
      if (message && message[SHUTDOWN]) state.stop();
    });
    if (options.worker) await options.worker(context);
    return context;
  }

  function onSignal() {
    if (state.stop) state.stop().then(() => process.exit(0));
  }

  async function start(options = {}) {
    // Data written by @xufa/marshal (true: its default registry; or a Registry): classes arrive as themselves.
    if (options.marshal) bus.useMarshal(options.marshal === true ? undefined : options.marshal);
    if (options.signals !== false && cluster.isPrimary) {
      process.once('SIGINT', onSignal);
      process.once('SIGTERM', onSignal);
    }
    if (options.workers === 0 || options.workers === false) return startSingle(options);
    return cluster.isPrimary ? startPrimary(options) : startWorker(options);
  }

  // Stops the cluster (in the primary: every worker, then the primary's shutdown functions).
  async function stop() {
    if (state.stop) await state.stop();
  }

  return { start, stop, state };
}

export { createStarter, SHUTDOWN };
