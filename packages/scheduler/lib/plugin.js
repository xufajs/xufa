// The plugin of @xufa/http (and fastify): app.scheduler, started when the app is ready (start: false leaves that to
// you) and stopped when it closes, its runs waited for. Its options are those of a Scheduler (the logger of the app
// by default), and jobs: the jobs to add; or scheduler: one made before.
//
//   app.register(schedulerPlugin, { jobs: [{ name: 'cleanup', every: '10m', run: () => Session.purge() }] });
//
// In a cluster, register it in one process only (the primary of @xufa/cluster, or a worker of your choice), or every
// worker runs the jobs; across machines, give it a lock (ormLock).
import { Scheduler } from './scheduler.js';

function schedulerPlugin(app, options, done) {
  const { jobs = [], start = true, scheduler: given, stopTimeout, ...settings } = options || {};
  const scheduler = given || new Scheduler({ logger: app.log, ...settings });
  for (const job of jobs) scheduler.add(job);
  app.decorate('scheduler', scheduler);
  if (start) {
    app.addHook('onReady', async () => {
      scheduler.start();
    });
  }
  app.addHook('onClose', async () => {
    await scheduler.stop(stopTimeout === undefined ? undefined : { timeout: stopTimeout });
  });
  done();
}

schedulerPlugin[Symbol.for('skip-override')] = true;
schedulerPlugin[Symbol.for('fastify.display-name')] = '@xufa/scheduler';
schedulerPlugin[Symbol.for('plugin-meta')] = { name: '@xufa/scheduler' };

export { schedulerPlugin };
