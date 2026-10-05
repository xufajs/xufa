// @xufa/client: a client of HTTP APIs on the fetch of Node.js, with no dependencies: base URLs, JSON, timeouts,
// retries with backoff, errors by status, hooks, logs, and the cancellation and id of the request of @xufa/http that
// makes the call (client.for(request)). retry() calls anything again until it gives what is wanted.
const { createClient, IDEMPOTENT, RETRY_STATUSES } = require('./lib/client');
const { retry, backoff } = require('./lib/retry');
const errors = require('./lib/errors');

module.exports = { createClient, retry, backoff, IDEMPOTENT, RETRY_STATUSES, ...errors };
