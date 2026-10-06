// The plugin on @xufa/http and on fastify: app.scheduler with the jobs given, started when the app is ready (or not,
// with start: false), stopped when it closes (its runs waited for); the logger of the app by default.
const xufa = require('@xufa/http');
const fastify = require('fastify');
const { Scheduler, schedulerPlugin } = require('..');

for (const [name, make] of [
  ['@xufa/http', () => xufa({ logger: false })],
  ['fastify', () => fastify({ logger: false })],
]) {
  describe(`plugin on ${name}`, () => {
    it('app.scheduler, started when ready, stopped when closed', async () => {
      const app = make();
      let runs = 0;
      let ended = false;
      await app.register(schedulerPlugin, {
        jobs: [
          { name: 'tick', every: '20ms', run: () => { runs += 1; } },
          { name: 'long', in: '1ms', run: () => new Promise((resolve) => setTimeout(() => { ended = true; resolve(); }, 80)) },
        ],
      });
      expect(app.scheduler).toBeInstanceOf(Scheduler);
      expect(app.scheduler.started).toBe(false);
      await app.ready();
      expect(app.scheduler.started).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 70));
      expect(runs).toBeGreaterThan(0);
      await app.close();
      expect(ended).toBe(true); // close waited for the run
      expect(app.scheduler.started).toBe(false);
      const after = runs;
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(runs).toBe(after);
    });

    it('start: false, and a scheduler made before', async () => {
      const app = make();
      const scheduler = new Scheduler();
      await app.register(schedulerPlugin, { scheduler, start: false, jobs: [{ name: 'x', every: '1h', run: () => {} }] });
      await app.ready();
      expect(app.scheduler).toBe(scheduler);
      expect(scheduler.started).toBe(false);
      expect(scheduler.has('x')).toBe(true);
      await app.close();
    });
  });
}
