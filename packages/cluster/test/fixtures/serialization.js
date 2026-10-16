// A cluster of 1 worker with start({ serialization }) (the argument): the worker sends a Date through the bus and with
// process.send of its own; the primary prints what arrived (a JSON line).
import cluster from 'node:cluster';
import * as xufa from '../../index.js';

const serialization = process.argv[2];
const seen = {};

xufa.start({
  workers: 1,
  serialization,
  async primary({ bus }) {
    const done = async () => {
      if (!('bus' in seen) || !('own' in seen)) return;
      process.stdout.write(`${JSON.stringify(seen)}\n`);
      await xufa.stop();
      process.exit(0);
    };
    bus.on('date', (value) => {
      seen.bus = value instanceof Date ? 'Date' : typeof value;
      return done();
    });
    cluster.on('message', (worker, message) => {
      if (message && message.operation === 'date') {
        seen.own = message.at instanceof Date ? 'Date' : typeof message.at;
        done();
      }
    });
  },
  async worker({ bus }) {
    bus.send('date', new Date(0));
    process.send({ operation: 'date', at: new Date(0) });
  },
});
