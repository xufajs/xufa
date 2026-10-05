// Calling again what failed: retry(fn, options) calls fn(attempt) until it gives a result `until` accepts, or it fails
// with an error `retryOn` does not retry, or the attempts are spent; between attempts it waits `delay` ms, multiplied
// by `factor` each time (up to `maxDelay`), with jitter. A signal stops the waits:
//
//   const status = await retry(() => job.status(), { until: (value) => value === 'done', attempts: 10, delay: 500 });
const { RetryError } = require('./errors');

// A wait that the signal stops (rejected with its reason).
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * The ms to wait before the attempt after `attempt` (1, 2...): delay * factor^(attempt - 1), up to maxDelay, with
 * jitter (a random part of it, so that clients that failed together do not come back together).
 */
function backoff(attempt, { delay = 100, factor = 2, maxDelay = 10000, jitter = true } = {}) {
  const ms = Math.min(maxDelay, delay * factor ** (attempt - 1));
  return jitter ? Math.round(ms / 2 + Math.random() * (ms / 2)) : ms;
}

async function retry(fn, options = {}) {
  const {
    attempts = 3,
    retryOn = () => true,
    until = () => true,
    signal,
    onRetry,
    wait = (attempt) => backoff(attempt, options),
  } = options;
  if (!Number.isInteger(attempts) || attempts < 1) throw new TypeError('attempts is an integer of 1 or more');
  for (let attempt = 1; ; attempt += 1) {
    if (signal && signal.aborted) throw signal.reason;
    let result;
    try {
      result = await fn(attempt);
    } catch (err) {
      if (attempt >= attempts || !(await retryOn(err, attempt))) throw err;
      if (onRetry) await onRetry({ attempt, error: err });
      await sleep(await wait(attempt, err), signal);
      continue;
    }
    if (await until(result, attempt)) return result;
    if (attempt >= attempts) throw new RetryError(attempts, result);
    if (onRetry) await onRetry({ attempt, result });
    await sleep(await wait(attempt, null, result), signal);
  }
}

module.exports = { retry, backoff, sleep };
