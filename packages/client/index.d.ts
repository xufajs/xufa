// @xufa/client: a client of HTTP APIs on the fetch of Node.js.

export interface RetryOptions {
  /** Attempts in all (3); 1 or false: none again. */
  attempts?: number;
  /** The methods retried (the idempotent ones: GET, HEAD, OPTIONS, PUT, DELETE, TRACE). */
  methods?: string[];
  /** The statuses retried (408, 413, 429, 500, 502, 503, 504, 521, 522, 524). */
  statuses?: number[];
  /** ms before the second attempt (100), multiplied by factor (2) each time, up to maxDelay (10000), with jitter. */
  delay?: number;
  factor?: number;
  maxDelay?: number;
  jitter?: boolean;
  /** The most of Retry-After waited (60000 ms). */
  maxRetryAfter?: number;
}

export interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  attempt: number;
}

export interface Logger {
  debug(object: object, message: string): void;
}

/** The request of @xufa/http (or fastify) a client is bound to. */
export interface BoundRequest {
  id?: string | number;
  signal?: AbortSignal;
  log?: Logger;
}

export interface ClientOptions {
  /** The URL paths are joined to (its path kept: '/v1' + '/books'). */
  baseUrl?: string;
  headers?: Record<string, string | number | undefined | null>;
  /** Query string: arrays repeat the key, dates are ISO, undefined and null are left out. */
  query?: Record<string, unknown> | URLSearchParams;
  /** ms for each attempt (30000; 0: none). */
  timeout?: number;
  /** Retries: the number of attempts, false, or the options. */
  retry?: RetryOptions | number | false;
  /** How the answer is read: auto (JSON by its type, text otherwise), json, text, buffer, stream, or the Response. */
  responseType?: 'auto' | 'json' | 'text' | 'buffer' | 'stream' | 'response';
  /** false: { status, headers, body, url } instead of the body. */
  resolveBodyOnly?: boolean;
  /** false: error statuses are answers, not HTTPErrors. */
  throwHttpErrors?: boolean;
  /** The header of the id of the request a client is bound to (x-request-id); null: not sent. */
  requestIdHeader?: string | null;
  hooks?: {
    beforeRequest?: ((call: Call) => void | Promise<void>) | Array<(call: Call) => void | Promise<void>>;
    afterResponse?:
      | ((response: Response, call: Call) => void | Promise<void>)
      | Array<(response: Response, call: Call) => void | Promise<void>>;
  };
  /** Where requests, answers and retries are logged (debug); the log of the bound request by default. */
  log?: Logger | null;
  /** The request it is bound to: its signal, log and id. */
  request?: BoundRequest | null;
  signal?: AbortSignal | null;
  /** A dispatcher of undici (proxies, pools): given to fetch. */
  dispatcher?: unknown;
  redirect?: 'follow' | 'error' | 'manual';
}

export interface CallOptions extends ClientOptions {
  /** A JSON body (content-type: application/json). */
  json?: unknown;
  /** A body as fetch takes it. */
  body?: unknown;
}

export interface FullResponse<T = any> {
  status: number;
  headers: Record<string, string>;
  body: T;
  url: string;
}

export interface Client {
  request<T = any>(method: string, path: string, options?: CallOptions): Promise<T>;
  get<T = any>(path: string, options?: CallOptions): Promise<T>;
  head(path: string, options?: CallOptions): Promise<undefined>;
  options<T = any>(path: string, options?: CallOptions): Promise<T>;
  post<T = any>(path: string, options?: CallOptions): Promise<T>;
  put<T = any>(path: string, options?: CallOptions): Promise<T>;
  patch<T = any>(path: string, options?: CallOptions): Promise<T>;
  delete<T = any>(path: string, options?: CallOptions): Promise<T>;
  /** A client with more options (headers, retry and hooks merged). */
  extend(options: ClientOptions): Client;
  /** The client of a request: cancelled with it, logging with request.log, sending its id. */
  for(request: BoundRequest): Client;
  readonly defaults: ClientOptions;
}

export function createClient(options?: ClientOptions): Client;

export interface RetryCallOptions<T> {
  /** Attempts in all (3). */
  attempts?: number;
  /** Whether an error is retried (all are). */
  retryOn?(error: unknown, attempt: number): boolean | Promise<boolean>;
  /** Whether a result is the one wanted (any is); otherwise it is tried again, and RetryError after the last. */
  until?(result: T, attempt: number): boolean | Promise<boolean>;
  /** ms before the second attempt (100), multiplied by factor (2), up to maxDelay (10000), with jitter. */
  delay?: number;
  factor?: number;
  maxDelay?: number;
  jitter?: boolean;
  /** The ms to wait after an attempt, instead of the backoff. */
  wait?(attempt: number, error: unknown, result?: T): number | Promise<number>;
  signal?: AbortSignal;
  onRetry?(info: { attempt: number; error?: unknown; result?: T }): void | Promise<void>;
}

/** Calls fn again until it gives a result `until` accepts (RetryError otherwise), or fails with what is not retried. */
export function retry<T>(fn: (attempt: number) => T | Promise<T>, options?: RetryCallOptions<T>): Promise<T>;
export function backoff(
  attempt: number,
  options?: { delay?: number; factor?: number; maxDelay?: number; jitter?: boolean }
): number;

export const IDEMPOTENT: string[];
export const RETRY_STATUSES: number[];

export class ClientError extends Error {
  method: string;
  url: string;
}
export class HTTPError<T = any> extends ClientError {
  code: 'XUFA_CLIENT_HTTP_ERROR';
  status: number;
  statusCode: number;
  headers: Record<string, string>;
  body: T;
}
export class TimeoutError extends ClientError {
  code: 'XUFA_CLIENT_TIMEOUT';
  timeout: number;
}
export class RequestError extends ClientError {
  code: 'XUFA_CLIENT_REQUEST_ERROR';
}
export class RetryError<T = unknown> extends Error {
  code: 'XUFA_CLIENT_RETRY_EXHAUSTED';
  attempts: number;
  result: T;
}
