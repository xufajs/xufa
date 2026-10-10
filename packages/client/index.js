// @xufa/client: a client of HTTP APIs on the fetch of Node.js, with no dependencies: base URLs, JSON, timeouts,
// retries with backoff, errors by status, hooks, logs, and the cancellation and id of the request of @xufa/http that
// makes the call (client.for(request)). retry() calls anything again until it gives what is wanted.
import { createClient, IDEMPOTENT, RETRY_STATUSES } from './lib/client.js';
import { retry, backoff } from './lib/retry.js';

export * from './lib/errors.js';

export { createClient, retry, backoff, IDEMPOTENT, RETRY_STATUSES };
