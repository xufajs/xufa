// Two workers on one SQLite file: with a SharedCache, an object read by worker 1 is answered from the cache to worker
// 2 (no query); with a LocalCache, the save of worker 2 invalidates the copy of worker 1.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as xufa from '@xufa/cluster';
import { Database, Model, fields, SharedCache, LocalCache } from '../../index.js';

const file = process.env.XUFA_CACHE_DB || path.join(os.tmpdir(), `xufa-cache-${process.pid}.db`);
const report = (data) => process.stdout.write(`${JSON.stringify(data)}\n`);

class User extends Model {
  static fields = { name: fields.string() };

  static options = { cache: true };
}

async function open(cache) {
  const db = new Database({ backend: 'sqlite', filename: file, name: 'main', cache }).register(User);
  await db.connect();
  return db;
}

xufa.start({
  workers: 2,
  env: { XUFA_CACHE_DB: file },
  async primary({ bus }) {
    // The primary holds the shared cache, and runs the steps of the workers in order.
    new SharedCache({ bus, name: 'shared' });
    const db = await open();
    await db.sync();
    const ada = await User.objects.create({ name: 'Ada' });
    await db.close();
    const workers = [];
    bus.on('ready', (data, worker) => {
      workers.push(worker.id);
      if (workers.length < 2) return;
      (async () => {
        const [first, second] = workers.sort();
        const ask = (id, step) =>
          new Promise((resolve) => {
            bus.on(`done:${step}`, (result) => resolve(result));
            bus.sendTo(id, 'step', { step, pk: ada.pk });
          });
        await ask(first, 'shared-read');
        report(await ask(second, 'shared-second'));
        await ask(first, 'local-read');
        await ask(second, 'local-save');
        report(await ask(first, 'local-again'));
        await xufa.stop();
        fs.rmSync(file, { force: true });
        process.exit(0);
      })();
    });
  },
  async worker({ bus }) {
    User.meta.db = undefined;
    const shared = await open(new SharedCache({ bus, name: 'shared' }));
    const local = new LocalCache({ bus, name: 'local' });
    let selects = 0;
    // Reads of the database: rows and objects.
    const { select, selectObjects } = shared.backend;
    shared.backend.select = (...args) => {
      selects += 1;
      return select.apply(shared.backend, args);
    };
    shared.backend.selectObjects = (...args) => {
      selects += 1;
      return selectObjects.apply(shared.backend, args);
    };
    bus.on('step', async ({ step, pk }) => {
      let result = {};
      if (step === 'shared-read') await User.objects.get({ pk });
      if (step === 'shared-second') {
        const user = await User.objects.get({ pk });
        result = { shared: user.name, fromCacheOfOtherWorker: selects === 0 };
      }
      if (step === 'local-read') {
        shared.cache = local;
        await User.objects.get({ pk });
      }
      if (step === 'local-save') {
        shared.cache = local;
        const user = await User.objects.get({ pk });
        user.name = 'Ada L.';
        await user.save();
      }
      if (step === 'local-again') {
        const before = selects;
        const user = await User.objects.get({ pk });
        result = { local: user.name, invalidated: selects === before + 1 };
      }
      bus.send(`done:${step}`, result);
    });
    bus.send('ready');
  },
});
