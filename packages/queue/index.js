// @xufa/queue: jobs in the background, kept in a database of @xufa/orm (lib/queue.js), with workers on any machine
// that has the database, retries with backoff, timeouts, priorities, delays, unique keys and the plugin of @xufa/http;
// and pipelines (lib/pipelines.js): graphs of steps run as its jobs, each run and step kept in the database.
import { Queue, Worker, backoffDelay } from './lib/queue.js';
import { QueueError } from './lib/errors.js';
import { queuePlugin } from './lib/plugin.js';
import { Pipelines, PipelineError, WAIT } from './lib/pipelines.js';

export { Queue, Worker, QueueError, queuePlugin, queuePlugin as plugin, backoffDelay, Pipelines, PipelineError, WAIT };
