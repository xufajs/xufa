// A cluster of 1 worker with start({ marshal: { registry, unknown: 'json', functions: 'skip' } }): Dates arrive as
// Dates, an instance of a class not registered as JSON writes it (its toJSON()), and functions are left out (as JSON
// does), where marshal's defaults would refuse them. The worker reports what came back (a JSON line).
import { Registry } from '@xufa/marshal';
import * as xufa from '../../index.js';

class Id {
  constructor(hex) {
    this.hex = hex;
  }

  toJSON() {
    return `id:${this.hex}`;
  }
}

xufa.start({
  workers: 1,
  marshal: { registry: new Registry(), unknown: 'json', functions: 'skip' },
  primary({ bus }) {
    bus.on('echo', (data) => data);
    bus.on('done', async (report) => {
      process.stdout.write(`${JSON.stringify(report)}\n`);
      await xufa.stop();
      process.exit(0);
    });
  },
  async worker({ bus }) {
    const back = await bus.request('echo', { when: new Date(0), id: new Id('ab'), fn() {}, list: [1, () => 2] });
    bus.send('done', {
      dateIsDate: back.when instanceof Date,
      time: back.when.getTime(),
      id: back.id,
      hasFn: 'fn' in back,
      list: back.list,
    });
  },
});
