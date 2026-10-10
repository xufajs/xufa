// The errors of @xufa/client: a code, and what the request was.

class ClientError extends Error {
  constructor(message, details = {}) {
    super(message, details.cause ? { cause: details.cause } : undefined);
    this.name = this.constructor.name;
    this.method = details.method;
    this.url = details.url;
  }
}

/** An answer of an error status (4xx, 5xx): its status, headers and body (parsed as the response would be). */
class HTTPError extends ClientError {
  constructor(details) {
    super(
      `${details.method} ${details.url} answered ${details.status}${details.statusText ? ` ${details.statusText}` : ''}`,
      details
    );
    this.code = 'XUFA_CLIENT_HTTP_ERROR';
    this.status = details.status;
    this.statusCode = details.status;
    this.headers = details.headers;
    this.body = details.body;
  }
}

/** No answer within the timeout. */
class TimeoutError extends ClientError {
  constructor(details) {
    super(`${details.method} ${details.url} took more than ${details.timeout} ms`, details);
    this.code = 'XUFA_CLIENT_TIMEOUT';
    this.timeout = details.timeout;
  }
}

/** The request could not be made (connection refused, reset, DNS...): `cause` says why. */
class RequestError extends ClientError {
  constructor(details) {
    super(`${details.method} ${details.url} failed: ${details.cause && details.cause.message}`, details);
    this.code = 'XUFA_CLIENT_REQUEST_ERROR';
  }
}

/** A value retry() did not accept after every attempt: `result` is the last one. */
class RetryError extends Error {
  constructor(attempts, result) {
    super(`The condition was not met in ${attempts} attempts`);
    this.name = 'RetryError';
    this.code = 'XUFA_CLIENT_RETRY_EXHAUSTED';
    this.attempts = attempts;
    this.result = result;
  }
}

export { ClientError, HTTPError, TimeoutError, RequestError, RetryError };
