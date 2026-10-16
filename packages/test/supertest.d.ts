// The types of @xufa/test/supertest: supertest 7's API (on superagent 10) for apps of Express, servers of node:http,
// instances of fastify and @xufa/http, and URLs.
import type { Agent as HttpAgent, IncomingHttpHeaders, IncomingMessage, RequestListener, Server } from 'node:http';

/** What requests are sent to: an app (a request handler, as Express's), a server, an instance of fastify or
 * @xufa/http (made ready, its server served), or a URL. */
type App = RequestListener | Server | { server: Server; ready(): PromiseLike<unknown> | unknown } | string;

interface Response {
  status: number;
  statusCode: number;
  statusType: number;
  info: boolean;
  ok: boolean;
  redirect: boolean;
  clientError: boolean;
  serverError: boolean;
  /** For statuses 4xx and 5xx: `cannot GET /path (404)`, with status, text, method and path. */
  error: false | (Error & { status: number; text?: string; method: string; path: string });
  created: boolean;
  accepted: boolean;
  noContent: boolean;
  badRequest: boolean;
  unauthorized: boolean;
  notAcceptable: boolean;
  forbidden: boolean;
  notFound: boolean;
  unprocessableEntity: boolean;
  headers: IncomingHttpHeaders;
  header: IncomingHttpHeaders;
  /** Content-Type without its parameters (each of them a property too: charset...). */
  type: string;
  charset?: string;
  links: Record<string, string>;
  /** The body as text (none for binary types and responseType()). */
  text: string;
  /** JSON parsed, a form parsed, a Buffer for binary types; {} for other bodies. */
  body: any;
  files: Record<string, unknown>;
  redirects: string[];
  res: IncomingMessage;
  get(field: string): string | string[] | undefined;
  [parameter: string]: any;
}

/** legacyPaths: paths sent as supertest 6 sent them (dot segments kept; superagent 10 resolves them). */
interface Options {
  http2?: false;
  legacyPaths?: boolean;
}

type CallbackHandler = (err: Error | null, res: Response) => void;

interface Test extends PromiseLike<Response> {
  /** The server started for this request (and closed after it), when one was. */
  _server?: Server;
  set(field: string, value: string | number | readonly string[]): this;
  set(fields: Record<string, string | number | readonly string[]>): this;
  unset(field: string): this;
  get(field: string): string | undefined;
  type(type: string): this;
  accept(type: string): this;
  auth(user: string, password?: string): this;
  query(value: string | Record<string, unknown>): this;
  send(data?: string | object | Buffer): this;
  write(chunk: string | Buffer, encoding?: BufferEncoding): boolean;
  field(name: string, value: string | number | boolean | Buffer | readonly (string | number | boolean)[]): this;
  field(fields: Record<string, string | number | boolean | Buffer | readonly (string | number | boolean)[]>): this;
  attach(field: string, file: string | Buffer, options?: string | { filename?: string; contentType?: string }): this;
  agent(agent: HttpAgent): this;
  redirects(count: number): this;
  timeout(ms: number | { deadline?: number; response?: number }): this;
  responseType(type: string): this;
  parse(parser: (res: NodeJS.ReadableStream, callback: (err: Error | null, body?: unknown) => void) => void): this;
  buffer(value?: boolean): this;
  expect(status: number, callback?: CallbackHandler): this;
  expect(status: number, body: unknown, callback?: CallbackHandler): this;
  expect(statuses: number[], callback?: CallbackHandler): this;
  expect(field: string, value: string | number | RegExp, callback?: CallbackHandler): this;
  expect(body: string | RegExp | object, callback?: CallbackHandler): this;
  expect(checker: (res: Response) => unknown, callback?: CallbackHandler): this;
  end(callback?: CallbackHandler): this;
  catch<T = never>(reject?: ((reason: any) => T | PromiseLike<T>) | null): Promise<Response | T>;
  finally(fn?: (() => void) | null): Promise<Response>;
}

type Methods<T> = {
  get(path: string): T;
  post(path: string): T;
  put(path: string): T;
  patch(path: string): T;
  delete(path: string): T;
  del(path: string): T;
  head(path: string): T;
  options(path: string): T;
};

interface TestAgent extends Methods<Test> {
  set(field: string, value: string | number | readonly string[]): this;
  set(fields: Record<string, string | number | readonly string[]>): this;
  unset(field: string): this;
  type(type: string): this;
  accept(type: string): this;
  auth(user: string, password?: string): this;
  query(value: string | Record<string, unknown>): this;
  agent(agent: HttpAgent): this;
  redirects(count: number): this;
  timeout(ms: number): this;
}

/** Every method of node:http, in lower case (and del). */
declare function request(app: App, options?: Options): Methods<Test> & { [method: string]: (path: string) => Test };

declare namespace request {
  export type { App, Options, Response, CallbackHandler, Test, TestAgent };
  const Test: new (app: App, method: string, path: string) => Test;
  function agent(app: App, options?: Options): TestAgent;
}

// (A module of CommonJS: require('@xufa/test/supertest'), or its default import.)
export = request;
