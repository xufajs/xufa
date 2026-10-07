'use strict';

// The plugin of @xufa/http (and fastify): app.queue, its workers started when the app is ready (work: false, or
// leave out the option, to only enqueue: web processes that hand the work to others) and stopped when it closes.
//
//   app.register(queuePlugin, { queue, work: { concurrency: 4 } });
//   app.post('/signup', async (request) => { ...; await app.queue.enqueue('welcome', { userId }); });
const { QueueError } = require('./errors');

function queuePlugin(app, options, done) {
  const { queue, work = false, stopTimeout } = options || {};
  if (!queue || typeof queue.enqueue !== 'function') {
    done(new QueueError('The plugin of @xufa/queue takes { queue }: a Queue'));
    return;
  }
  if (!queue.logger) queue.logger = app.log;
  app.decorate('queue', queue);
  if (work) {
    app.addHook('onReady', async () => {
      queue.work(work === true ? {} : work);
    });
  }
  app.addHook('onClose', async () => {
    await queue.stop(stopTimeout === undefined ? undefined : { timeout: stopTimeout });
  });
  done();
}

queuePlugin[Symbol.for('skip-override')] = true;
queuePlugin[Symbol.for('fastify.display-name')] = '@xufa/queue';
queuePlugin[Symbol.for('plugin-meta')] = { name: '@xufa/queue' };

module.exports = { queuePlugin };
