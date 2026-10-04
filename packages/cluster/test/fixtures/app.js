// A cluster of 2 workers for the tests: each asks the primary, broadcasts, and the primary reports (JSON lines).
const xufa = require('../..');

const report = (data) => process.stdout.write(`${JSON.stringify(data)}\n`);

xufa.start({
  workers: Number(process.env.WORKERS ?? 2),
  async primary({ bus }) {
    let ready = 0;
    let crashed = false;
    let greetings = 0;
    bus.on('add', ({ a, b }) => a + b);
    bus.on('fail', () => {
      throw Object.assign(new Error('nope'), { code: 'E_NOPE' });
    });
    bus.on('types', (data) => ({ ok: data.when instanceof Date && data.map instanceof Map && data.big === 2n ** 70n }));
    bus.on('greeting', () => {
      greetings += 1;
    });
    bus.on('ready', async (data, worker) => {
      ready += 1;
      report({ ready: worker ? worker.id : 0, sum: data.sum, error: data.error, types: data.types });
      if (!crashed && ready === Number(process.env.WORKERS ?? 2) && worker) {
        crashed = true;
        // A worker dies: it is forked again.
        bus.sendTo(worker.id, 'crash');
      } else if (ready > Number(process.env.WORKERS ?? 2) || !worker) {
        bus.broadcast('hello', { from: 'primary' });
        setTimeout(async () => {
          report({ greetings });
          await xufa.stop();
          report({ stopped: true });
          process.exit(0);
        }, 500);
      }
    });
  },
  async worker({ bus, id, onShutdown }) {
    bus.on('crash', () => process.exit(1));
    bus.on('hello', () => bus.send('greeting'));
    onShutdown(() => {});
    const sum = await bus.request('add', { a: id, b: 40 });
    const error = await bus.request('fail').catch((err) => `${err.code}:${err.message}`);
    const types = (await bus.request('types', { when: new Date(), map: new Map([[1, 2]]), big: 2n ** 70n })).ok;
    bus.send('ready', { sum, error, types });
  },
});
