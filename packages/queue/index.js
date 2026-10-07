'use strict';

// @xufa/queue: jobs in the background, kept in a database of @xufa/orm (lib/queue.js), with workers on any machine
// that has the database, retries with backoff, timeouts, priorities, delays, unique keys and the plugin of @xufa/http;
// and pipelines (lib/pipelines.js): graphs of steps run as its jobs, each run and step kept in the database.
const { Queue, Worker, backoffDelay } = require('./lib/queue');
const { QueueError } = require('./lib/errors');
const { queuePlugin } = require('./lib/plugin');
const { Pipelines, PipelineError, WAIT } = require('./lib/pipelines');

module.exports = {
  Queue,
  Worker,
  QueueError,
  queuePlugin,
  plugin: queuePlugin,
  backoffDelay,
  Pipelines,
  PipelineError,
  WAIT,
};
