// A cluster of 3 workers sharing a pool of 2 nodes of 1 slot: worker 1 takes a lease and dies with it, the others run
// 6 works each. The primary counts the works running at once and reports (JSON lines).
import cluster from 'node:cluster';
import * as xufa from '../../index.js';

const report = (data) => process.stdout.write(`${JSON.stringify(data)}\n`);
const sleep = (wait) => new Promise((resolve) => setTimeout(resolve, wait));

xufa.start({
  workers: 3,
  restart: false,
  async primary({ bus }) {
    const pool = xufa.createPool('converters', { nodes: ['a', 'b'] });
    let running = 0;
    let maxRunning = 0;
    let done = 0;
    let crashed = false;
    let freedAfterCrash = false;
    bus.on('begin', () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
    });
    bus.on('finish', () => {
      running -= 1;
      done += 1;
      if (done === 12) {
        const check = setInterval(async () => {
          if (!crashed) return;
          clearInterval(check);
          report({ summary: true, maxRunning, done, freedAfterCrash, final: pool.stats() });
          await xufa.stop();
          process.exit(0);
        }, 20);
      }
    });
    bus.on('holding', () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
    });
    cluster.on('exit', (worker) => {
      if (worker.id !== 1) return;
      crashed = true;
      running -= 1;
      // The pool's own listener ran first: no lease of worker 1 is left.
      freedAfterCrash = [...pool.leases.values()].every((lease) => lease.worker !== 1);
    });
  },
  async worker({ bus, id }) {
    const pool = xufa.usePool('converters');
    if (id === 1) {
      await pool.acquire();
      bus.send('holding');
      await sleep(150);
      process.exit(1);
    }
    await sleep(50);
    await Promise.all(
      Array.from({ length: 6 }, () =>
        pool.use(async () => {
          bus.send('begin');
          await sleep(20);
          bus.send('finish');
        })
      )
    );
  },
});
