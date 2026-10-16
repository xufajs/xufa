// @xufa/express: the types of Express 5's API (as the code in lib/ implements it), with what @xufa/express adds:
// express({ server }), app.server(), app.register(). Apps augment Express.Request, Express.Response, Express.Locals
// and Express.Application (declare global { namespace Express { ... } }), as with Express.

import type * as http from 'node:http';
import type { EventEmitter } from 'node:events';
import type { Stats } from 'node:fs';
import type { XufaHttpOptions, XufaInstance, XufaPluginAsync, XufaPluginCallback, XufaPluginOptions } from '@xufa/http';

declare global {
  namespace Express {
    interface Request {}
    interface Response {}
    interface Locals {}
    interface Application {}
  }
}

declare function e(options?: e.ExpressOptions): e.Express;

declare namespace e {
  // --- Params of paths ----------------------------------------------------------------------------------------------

  interface ParamsDictionary {
    [key: string]: string;
  }
  type ParamsFlatDictionary = Record<string | number, string>;
  type Query = Record<string, unknown>;

  /** The name of a param: up to the next '/', '-' or '.'. */
  type Cut<S extends string, Tail extends string> = S extends `${infer Head}${Tail}` ? Head : S;
  type ParamName<S extends string> = Cut<Cut<Cut<S, `/${string}`>, `-${string}`>, `.${string}`>;

  type ParseParams<Path extends string> = string extends Path
    ? ParamsDictionary
    : Path extends `${string}:${infer Rest}`
      ? { [K in ParamName<Rest>]: string } & (Rest extends `${ParamName<Rest>}${infer Next}`
          ? RouteParameters<Next>
          : unknown)
      : Path extends `${string}*${infer Rest}`
        ? { [K in ParamName<Rest>]: string[] } & (Rest extends `${ParamName<Rest>}${infer Next}`
            ? RouteParameters<Next>
            : unknown)
        : {};

  /** The params of a path: ':id' a string, '*rest' an array of segments, those in '{...}' optional. */
  type RouteParameters<Path extends string | RegExp> = Path extends string
    ? Path extends `${infer Required}{${infer Optional}}${infer Next}`
      ? ParseParams<Required> & Partial<ParseParams<Optional>> & RouteParameters<Next>
      : ParseParams<Path>
    : ParamsFlatDictionary;

  // --- Requests and responses ---------------------------------------------------------------------------------------

  interface RangeOptions {
    /** Ranges that overlap or touch as one. */
    combine?: boolean;
  }

  interface Ranges extends Array<{ start: number; end: number }> {
    type: string;
  }

  interface Request<
    P = ParamsDictionary,
    ResBody = any,
    ReqBody = any,
    ReqQuery = Query,
    LocalsObj extends Record<string, any> = Record<string, any>,
  >
    extends http.IncomingMessage, Express.Request {
    /** A header (Referer and Referrer as one). */
    get(name: 'set-cookie'): string[] | undefined;
    get(name: string): string | undefined;
    header(name: 'set-cookie'): string[] | undefined;
    header(name: string): string | undefined;
    /** The type of those given the request prefers (false for none); all it accepts without types. */
    accepts(): string[];
    accepts(type: string): string | false;
    accepts(type: string[]): string | false;
    accepts(...type: string[]): string | false;
    acceptsCharsets(): string[];
    acceptsCharsets(charset: string): string | false;
    acceptsCharsets(charset: string[]): string | false;
    acceptsCharsets(...charset: string[]): string | false;
    acceptsEncodings(): string[];
    acceptsEncodings(encoding: string): string | false;
    acceptsEncodings(encoding: string[]): string | false;
    acceptsEncodings(...encoding: string[]): string | false;
    acceptsLanguages(): string[];
    acceptsLanguages(lang: string): string | false;
    acceptsLanguages(lang: string[]): string | false;
    acceptsLanguages(...lang: string[]): string | false;
    /** The ranges of the Range header for a size: -1 unsatisfiable, -2 not one. */
    range(size: number, options?: RangeOptions): Ranges | -1 | -2 | undefined;
    /** The type of the body among those given (false for none), null without a body. */
    is(type: string | string[]): string | false | null;
    is(...type: string[]): string | false | null;
    readonly protocol: string;
    readonly secure: boolean;
    readonly ip: string | undefined;
    readonly ips: string[];
    readonly subdomains: string[];
    readonly path: string;
    readonly host: string;
    readonly hostname: string;
    readonly fresh: boolean;
    readonly stale: boolean;
    readonly xhr: boolean;
    body: ReqBody;
    cookies: any;
    signedCookies: any;
    method: string;
    params: P;
    query: ReqQuery;
    route: any;
    secret?: string | undefined;
    originalUrl: string;
    url: string;
    baseUrl: string;
    app: Application;
    res?: Response<ResBody, LocalsObj> | undefined;
    next?: NextFunction | undefined;
  }

  interface CookieOptions {
    /** Milliseconds (Max-Age and Expires from now). */
    maxAge?: number | undefined;
    /** Signed with req.secret (cookie-parser's). */
    signed?: boolean | undefined;
    expires?: Date | undefined;
    httpOnly?: boolean | undefined;
    path?: string | undefined;
    domain?: string | undefined;
    secure?: boolean | undefined;
    encode?: ((value: string) => string) | undefined;
    sameSite?: boolean | 'lax' | 'strict' | 'none' | undefined;
    priority?: 'low' | 'medium' | 'high';
    partitioned?: boolean | undefined;
  }

  interface SendFileOptions extends SendOptions {
    headers?: Record<string, unknown>;
  }

  interface DownloadOptions extends SendOptions {
    headers?: Record<string, unknown>;
  }

  type Errback = (err?: Error) => void;

  type Send<ResBody = any, T = Response<ResBody>> = (body?: ResBody) => T;

  interface Response<
    ResBody = any,
    LocalsObj extends Record<string, any> = Record<string, any>,
    StatusCode extends number = number,
  >
    extends http.ServerResponse, Express.Response {
    status(code: StatusCode): this;
    sendStatus(code: StatusCode): this;
    links(links: Record<string, string | string[]>): this;
    send: Send<ResBody, this>;
    json: Send<ResBody, this>;
    jsonp: Send<ResBody, this>;
    sendFile(path: string, fn?: Errback): void;
    sendFile(path: string, options: SendFileOptions, fn?: Errback): void;
    download(path: string, fn?: Errback): void;
    download(path: string, filename: string, fn?: Errback): void;
    download(path: string, filename: string, options: DownloadOptions, fn?: Errback): void;
    contentType(type: string): this;
    type(type: string): this;
    format(handlers: Record<string, (req: Request, res: Response, next: NextFunction) => void>): this;
    attachment(filename?: string): this;
    set(field: Record<string, string | string[]>): this;
    set(field: string, value?: string | string[]): this;
    header(field: Record<string, string | string[]>): this;
    header(field: string, value?: string | string[]): this;
    headersSent: boolean;
    get(field: string): string | undefined;
    clearCookie(name: string, options?: CookieOptions): this;
    cookie(name: string, value: any, options?: CookieOptions): this;
    location(url: string): this;
    redirect(url: string): void;
    redirect(status: number, url: string): void;
    render(view: string, options?: object, callback?: (err: Error, html: string) => void): void;
    render(view: string, callback?: (err: Error, html: string) => void): void;
    locals: LocalsObj & Locals;
    charset: string;
    vary(field: string): this;
    app: Application;
    append(field: string, value?: string[] | string): this;
    req: Request;
  }

  interface Locals extends Express.Locals {}

  // --- Handlers -----------------------------------------------------------------------------------------------------

  interface NextFunction {
    (err?: any): void;
    /** Leaves the route ('route') or the router ('router'). */
    (deferToNext: 'route'): void;
    (deferToNext: 'router'): void;
  }

  interface RequestHandler<
    P = ParamsDictionary,
    ResBody = any,
    ReqBody = any,
    ReqQuery = Query,
    LocalsObj extends Record<string, any> = Record<string, any>,
  > {
    (
      req: Request<P, ResBody, ReqBody, ReqQuery, LocalsObj>,
      res: Response<ResBody, LocalsObj>,
      next: NextFunction
    ): unknown;
  }

  type ErrorRequestHandler<
    P = ParamsDictionary,
    ResBody = any,
    ReqBody = any,
    ReqQuery = Query,
    LocalsObj extends Record<string, any> = Record<string, any>,
  > = (
    err: any,
    req: Request<P, ResBody, ReqBody, ReqQuery, LocalsObj>,
    res: Response<ResBody, LocalsObj>,
    next: NextFunction
  ) => unknown;

  type RequestHandlerParams<
    P = ParamsDictionary,
    ResBody = any,
    ReqBody = any,
    ReqQuery = Query,
    LocalsObj extends Record<string, any> = Record<string, any>,
  > =
    | RequestHandler<P, ResBody, ReqBody, ReqQuery, LocalsObj>
    | ErrorRequestHandler<P, ResBody, ReqBody, ReqQuery, LocalsObj>
    | Array<RequestHandler<P> | ErrorRequestHandler<P>>;

  type Handler = RequestHandler;

  type RequestParamHandler = (req: Request, res: Response, next: NextFunction, value: any, name: string) => any;

  type PathParams = string | RegExp | Array<string | RegExp>;

  // --- Routers ------------------------------------------------------------------------------------------------------

  interface RouterMatcher<T> {
    <
      Path extends string | RegExp,
      P = RouteParameters<Path>,
      ResBody = any,
      ReqBody = any,
      ReqQuery = Query,
      LocalsObj extends Record<string, any> = Record<string, any>,
    >(
      path: Path,
      ...handlers: Array<RequestHandler<P, ResBody, ReqBody, ReqQuery, LocalsObj>>
    ): T;
    <
      Path extends string | RegExp,
      P = RouteParameters<Path>,
      ResBody = any,
      ReqBody = any,
      ReqQuery = Query,
      LocalsObj extends Record<string, any> = Record<string, any>,
    >(
      path: Path,
      ...handlers: Array<RequestHandlerParams<P, ResBody, ReqBody, ReqQuery, LocalsObj>>
    ): T;
    <
      P = ParamsDictionary,
      ResBody = any,
      ReqBody = any,
      ReqQuery = Query,
      LocalsObj extends Record<string, any> = Record<string, any>,
    >(
      path: PathParams,
      ...handlers: Array<RequestHandlerParams<P, ResBody, ReqBody, ReqQuery, LocalsObj>>
    ): T;
  }

  interface RouterHandler<T, Path extends string = string> {
    (...handlers: Array<RequestHandler<RouteParameters<Path>>>): T;
    (...handlers: Array<RequestHandlerParams<RouteParameters<Path>>>): T;
  }

  interface Use<T> {
    (...handlers: Array<RequestHandler | ErrorRequestHandler | RequestHandlerParams>): T;
    <Path extends string | RegExp, P = RouteParameters<Path>>(
      path: Path,
      ...handlers: Array<RequestHandlerParams<P>>
    ): T;
    (path: PathParams, ...handlers: Array<RequestHandlerParams>): T;
  }

  interface IRoute<Path extends string = string> {
    path: string;
    stack: any;
    all: RouterHandler<this, Path>;
    get: RouterHandler<this, Path>;
    post: RouterHandler<this, Path>;
    put: RouterHandler<this, Path>;
    delete: RouterHandler<this, Path>;
    patch: RouterHandler<this, Path>;
    options: RouterHandler<this, Path>;
    head: RouterHandler<this, Path>;
    query: RouterHandler<this, Path>;
  }

  interface IRouter extends RequestHandler {
    param(name: string, handler: RequestParamHandler): this;
    all: RouterMatcher<this>;
    get: RouterMatcher<this>;
    post: RouterMatcher<this>;
    put: RouterMatcher<this>;
    delete: RouterMatcher<this>;
    patch: RouterMatcher<this>;
    options: RouterMatcher<this>;
    head: RouterMatcher<this>;
    query: RouterMatcher<this>;
    use: Use<this>;
    route<Path extends string>(path: Path): IRoute<Path>;
    route(path: PathParams): IRoute;
    stack: any[];
  }

  interface Router extends IRouter {}

  interface RouterOptions {
    caseSensitive?: boolean | undefined;
    mergeParams?: boolean | undefined;
    strict?: boolean | undefined;
  }

  // --- Applications -------------------------------------------------------------------------------------------------

  interface Application<LocalsObj extends Record<string, any> = Record<string, any>>
    extends EventEmitter, IRouter, Express.Application {
    (req: http.IncomingMessage | Request, res: http.ServerResponse | Response): any;
    (req: Request, res: Response, next: NextFunction): void;
    init(): void;
    defaultConfiguration(): void;
    engine(
      ext: string,
      fn: (path: string, options: object, callback: (e: any, rendered?: string) => void) => void
    ): this;
    set(setting: string, value: any): this;
    get: ((name: string) => any) & RouterMatcher<this>;
    param(name: string | string[], handler: RequestParamHandler): this;
    path(): string;
    enabled(setting: string): boolean;
    disabled(setting: string): boolean;
    enable(setting: string): this;
    disable(setting: string): this;
    render(name: string, options?: object, callback?: (err: Error, html: string) => void): void;
    render(name: string, callback: (err: Error, html: string) => void): void;
    listen(port: number, hostname: string, backlog: number, callback?: (error?: Error) => void): http.Server;
    listen(port: number, hostname: string, callback?: (error?: Error) => void): http.Server;
    listen(port: number, callback?: (error?: Error) => void): http.Server;
    listen(callback?: (error?: Error) => void): http.Server;
    listen(path: string, callback?: (error?: Error) => void): http.Server;
    listen(handle: any, listeningListener?: (error?: Error) => void): http.Server;
    router: Router;
    settings: any;
    resource: any;
    map: any;
    locals: LocalsObj & Locals;
    routes: any;
    _router: any;
    use: Use<this>;
    on: (event: string, callback: (parent: Application) => void) => this;
    mountpath: string | string[];
    parent?: Application;
    request: Request;
    response: Response;
    /** The instance of @xufa/http that routes the app's requests, not listening (ready(), inject()). */
    server(options?: XufaHttpOptions<any>): XufaInstance;
    /** A plugin of @xufa/http with routes of its own, registered before the app's routes. */
    register<Options extends XufaPluginOptions>(plugin: XufaPluginAsync<Options>, options?: Options): this;
    register<Options extends XufaPluginOptions>(plugin: XufaPluginCallback<Options>, options?: Options): this;
  }

  interface Express extends Application {
    request: Request;
    response: Response;
  }

  interface ExpressOptions {
    /** Options of @xufa/http for the app's instance (app.register, app.server). */
    server?: XufaHttpOptions<any>;
  }

  // --- Middlewares of Express ---------------------------------------------------------------------------------------

  interface ParserOptions {
    /** Inflate gzip, deflate and br bodies (true). */
    inflate?: boolean | undefined;
    /** The largest body: bytes or '100kb' (100kb). */
    limit?: number | string | undefined;
    /** The types to parse: a type, a list, or a function of the request. */
    type?: string | string[] | ((req: http.IncomingMessage) => any) | undefined;
    /** May throw to refuse a body (403). */
    verify?(req: http.IncomingMessage, res: http.ServerResponse, buf: Buffer, encoding: string): void;
  }

  interface JsonOptions extends ParserOptions {
    reviver?(key: string, value: any): any;
    /** Only objects and arrays (true). */
    strict?: boolean | undefined;
  }

  interface TextOptions extends ParserOptions {
    defaultCharset?: string | undefined;
  }

  interface UrlencodedOptions extends ParserOptions {
    /** Nested keys (a[b]=1), as qs (false). */
    extended?: boolean | undefined;
    parameterLimit?: number | undefined;
    depth?: number | undefined;
    defaultCharset?: string | undefined;
    charsetSentinel?: boolean | undefined;
    interpretNumericEntities?: boolean | undefined;
  }

  interface SendOptions {
    acceptRanges?: boolean | undefined;
    cacheControl?: boolean | undefined;
    dotfiles?: 'allow' | 'deny' | 'ignore' | undefined;
    end?: number | undefined;
    etag?: boolean | undefined;
    extensions?: string[] | string | boolean | undefined;
    immutable?: boolean | undefined;
    index?: string[] | string | boolean | undefined;
    lastModified?: boolean | undefined;
    maxAge?: string | number | undefined;
    root?: string | undefined;
    start?: number | undefined;
  }

  interface ServeStaticOptions<R extends http.ServerResponse = http.ServerResponse> extends SendOptions {
    fallthrough?: boolean | undefined;
    redirect?: boolean | undefined;
    setHeaders?: ((res: R, path: string, stat: Stats) => any) | undefined;
  }

  function json(options?: JsonOptions): RequestHandler;
  function raw(options?: ParserOptions): RequestHandler;
  function text(options?: TextOptions): RequestHandler;
  function urlencoded(options?: UrlencodedOptions): RequestHandler;
  function Router(options?: RouterOptions): Router;

  const application: Application;
  const request: Request;
  const response: Response;
  const Route: new (path: string) => IRoute;
  /** The files of a folder (express.static). */
  // eslint-disable-next-line no-var -- 'static' is a word of its own: a var of the namespace, as Express's types
  var static: (root: string, options?: ServeStaticOptions) => RequestHandler;
}

export = e;
