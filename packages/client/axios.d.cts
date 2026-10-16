// @xufa/client/axios: the types of axios's API (1.14) as lib/axios implements it, under axios's names (AxiosResponse,
// AxiosError, AxiosRequestConfig, AxiosInstance...): code typed for axios compiles with it.

/// <reference types="node" />
import type { Agent as HttpAgent } from 'node:http';
import type { Agent as HttpsAgent } from 'node:https';
import type { LookupAddress as DnsLookupAddress } from 'node:dns';

/** Headers found in any case, as own properties; getX/setX/hasX for the common ones. */
declare class AxiosHeadersClass {
  constructor(headers?: axios.RawAxiosHeaders | AxiosHeadersClass | string);

  [key: string]: any;

  /** A header set (false keeps one set to false unless rewrite is true; rewrite false sets only those not set). */
  set(
    headerName?: string,
    value?: axios.AxiosHeaderValue,
    rewrite?: boolean | axios.AxiosHeaderMatcher
  ): AxiosHeadersClass;
  set(headers?: axios.RawAxiosHeaders | AxiosHeadersClass | string, rewrite?: boolean): AxiosHeadersClass;
  get(headerName: string, parser: RegExp): RegExpExecArray | null;
  get(headerName: string, matcher?: true | axios.AxiosHeaderParser): axios.AxiosHeaderValue;
  has(header: string, matcher?: axios.AxiosHeaderMatcher): boolean;
  delete(header: string | string[], matcher?: axios.AxiosHeaderMatcher): boolean;
  clear(matcher?: axios.AxiosHeaderMatcher): boolean;
  /** One key a header; Formatted-Like-This names with `format`. */
  normalize(format: boolean): AxiosHeadersClass;
  concat(...targets: Array<AxiosHeadersClass | axios.RawAxiosHeaders | string | undefined | null>): AxiosHeadersClass;
  toJSON(asStrings?: boolean): axios.RawAxiosHeaders;
  getSetCookie(): string[];
  [Symbol.iterator](): IterableIterator<[string, axios.AxiosHeaderValue]>;

  static from(thing?: AxiosHeadersClass | axios.RawAxiosHeaders | string): AxiosHeadersClass;
  static accessor(header: string | string[]): AxiosHeadersClass;
  static concat(
    ...targets: Array<AxiosHeadersClass | axios.RawAxiosHeaders | string | undefined | null>
  ): AxiosHeadersClass;

  setContentType(value: axios.ContentType, rewrite?: boolean | axios.AxiosHeaderMatcher): AxiosHeadersClass;
  getContentType(parser: RegExp): RegExpExecArray | null;
  getContentType(matcher?: axios.AxiosHeaderMatcher): axios.AxiosHeaderValue;
  hasContentType(matcher?: axios.AxiosHeaderMatcher): boolean;

  setContentLength(value: axios.AxiosHeaderValue, rewrite?: boolean | axios.AxiosHeaderMatcher): AxiosHeadersClass;
  getContentLength(parser: RegExp): RegExpExecArray | null;
  getContentLength(matcher?: axios.AxiosHeaderMatcher): axios.AxiosHeaderValue;
  hasContentLength(matcher?: axios.AxiosHeaderMatcher): boolean;

  setAccept(value: axios.AxiosHeaderValue, rewrite?: boolean | axios.AxiosHeaderMatcher): AxiosHeadersClass;
  getAccept(parser: RegExp): RegExpExecArray | null;
  getAccept(matcher?: axios.AxiosHeaderMatcher): axios.AxiosHeaderValue;
  hasAccept(matcher?: axios.AxiosHeaderMatcher): boolean;

  setAcceptEncoding(value: axios.AxiosHeaderValue, rewrite?: boolean | axios.AxiosHeaderMatcher): AxiosHeadersClass;
  getAcceptEncoding(parser: RegExp): RegExpExecArray | null;
  getAcceptEncoding(matcher?: axios.AxiosHeaderMatcher): axios.AxiosHeaderValue;
  hasAcceptEncoding(matcher?: axios.AxiosHeaderMatcher): boolean;

  setUserAgent(value: axios.AxiosHeaderValue, rewrite?: boolean | axios.AxiosHeaderMatcher): AxiosHeadersClass;
  getUserAgent(parser: RegExp): RegExpExecArray | null;
  getUserAgent(matcher?: axios.AxiosHeaderMatcher): axios.AxiosHeaderValue;
  hasUserAgent(matcher?: axios.AxiosHeaderMatcher): boolean;

  setAuthorization(value: axios.AxiosHeaderValue, rewrite?: boolean | axios.AxiosHeaderMatcher): AxiosHeadersClass;
  getAuthorization(parser: RegExp): RegExpExecArray | null;
  getAuthorization(matcher?: axios.AxiosHeaderMatcher): axios.AxiosHeaderValue;
  hasAuthorization(matcher?: axios.AxiosHeaderMatcher): boolean;
}

declare class AxiosErrorClass<T = unknown, D = any> extends Error {
  constructor(
    message?: string,
    code?: string,
    config?: axios.InternalAxiosRequestConfig<D>,
    request?: any,
    response?: axios.AxiosResponse<T, D>
  );

  config?: axios.InternalAxiosRequestConfig<D>;
  code?: string;
  request?: any;
  response?: axios.AxiosResponse<T, D>;
  isAxiosError: boolean;
  status?: number;
  cause?: unknown;
  /** What can be logged: no request and no response. */
  toJSON: () => object;

  /** An error as an AxiosError, the error as its cause. */
  static from<T = unknown, D = any>(
    error: Error | unknown,
    code?: string,
    config?: axios.InternalAxiosRequestConfig<D>,
    request?: any,
    response?: axios.AxiosResponse<T, D>,
    customProps?: object
  ): AxiosErrorClass<T, D>;

  static readonly ERR_FR_TOO_MANY_REDIRECTS = 'ERR_FR_TOO_MANY_REDIRECTS';
  static readonly ERR_BAD_OPTION_VALUE = 'ERR_BAD_OPTION_VALUE';
  static readonly ERR_BAD_OPTION = 'ERR_BAD_OPTION';
  static readonly ERR_NETWORK = 'ERR_NETWORK';
  static readonly ERR_DEPRECATED = 'ERR_DEPRECATED';
  static readonly ERR_BAD_RESPONSE = 'ERR_BAD_RESPONSE';
  static readonly ERR_BAD_REQUEST = 'ERR_BAD_REQUEST';
  static readonly ERR_NOT_SUPPORT = 'ERR_NOT_SUPPORT';
  static readonly ERR_INVALID_URL = 'ERR_INVALID_URL';
  static readonly ERR_CANCELED = 'ERR_CANCELED';
  static readonly ECONNABORTED = 'ECONNABORTED';
  static readonly ETIMEDOUT = 'ETIMEDOUT';
}

declare class CanceledErrorClass<T> extends AxiosErrorClass<T> {
  readonly name: 'CanceledError';
}

declare class AxiosClass {
  constructor(config?: axios.AxiosRequestConfig);

  defaults: axios.AxiosDefaults;
  interceptors: {
    request: axios.AxiosInterceptorManager<axios.InternalAxiosRequestConfig>;
    response: axios.AxiosInterceptorManager<axios.AxiosResponse>;
  };

  getUri(config?: axios.AxiosRequestConfig): string;
  request<T = any, R = axios.AxiosResponse<T>, D = any>(config: axios.AxiosRequestConfig<D>): Promise<R>;
  get<T = any, R = axios.AxiosResponse<T>, D = any>(url: string, config?: axios.AxiosRequestConfig<D>): Promise<R>;
  delete<T = any, R = axios.AxiosResponse<T>, D = any>(url: string, config?: axios.AxiosRequestConfig<D>): Promise<R>;
  head<T = any, R = axios.AxiosResponse<T>, D = any>(url: string, config?: axios.AxiosRequestConfig<D>): Promise<R>;
  options<T = any, R = axios.AxiosResponse<T>, D = any>(url: string, config?: axios.AxiosRequestConfig<D>): Promise<R>;
  post<T = any, R = axios.AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: axios.AxiosRequestConfig<D>
  ): Promise<R>;
  put<T = any, R = axios.AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: axios.AxiosRequestConfig<D>
  ): Promise<R>;
  patch<T = any, R = axios.AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: axios.AxiosRequestConfig<D>
  ): Promise<R>;
  /** As post(), the data sent as multipart/form-data. */
  postForm<T = any, R = axios.AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: axios.AxiosRequestConfig<D>
  ): Promise<R>;
  putForm<T = any, R = axios.AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: axios.AxiosRequestConfig<D>
  ): Promise<R>;
  patchForm<T = any, R = axios.AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: axios.AxiosRequestConfig<D>
  ): Promise<R>;
}

declare enum HttpStatusCodeEnum {
  Continue = 100,
  SwitchingProtocols = 101,
  Processing = 102,
  EarlyHints = 103,
  Ok = 200,
  Created = 201,
  Accepted = 202,
  NonAuthoritativeInformation = 203,
  NoContent = 204,
  ResetContent = 205,
  PartialContent = 206,
  MultiStatus = 207,
  AlreadyReported = 208,
  ImUsed = 226,
  MultipleChoices = 300,
  MovedPermanently = 301,
  Found = 302,
  SeeOther = 303,
  NotModified = 304,
  UseProxy = 305,
  Unused = 306,
  TemporaryRedirect = 307,
  PermanentRedirect = 308,
  BadRequest = 400,
  Unauthorized = 401,
  PaymentRequired = 402,
  Forbidden = 403,
  NotFound = 404,
  MethodNotAllowed = 405,
  NotAcceptable = 406,
  ProxyAuthenticationRequired = 407,
  RequestTimeout = 408,
  Conflict = 409,
  Gone = 410,
  LengthRequired = 411,
  PreconditionFailed = 412,
  PayloadTooLarge = 413,
  UriTooLong = 414,
  UnsupportedMediaType = 415,
  RangeNotSatisfiable = 416,
  ExpectationFailed = 417,
  ImATeapot = 418,
  MisdirectedRequest = 421,
  UnprocessableEntity = 422,
  Locked = 423,
  FailedDependency = 424,
  TooEarly = 425,
  UpgradeRequired = 426,
  PreconditionRequired = 428,
  TooManyRequests = 429,
  RequestHeaderFieldsTooLarge = 431,
  UnavailableForLegalReasons = 451,
  InternalServerError = 500,
  NotImplemented = 501,
  BadGateway = 502,
  ServiceUnavailable = 503,
  GatewayTimeout = 504,
  HttpVersionNotSupported = 505,
  VariantAlsoNegotiates = 506,
  InsufficientStorage = 507,
  LoopDetected = 508,
  NotExtended = 510,
  NetworkAuthenticationRequired = 511,
  WebServerIsDown = 521,
  ConnectionTimedOut = 522,
  OriginIsUnreachable = 523,
  TimeoutOccurred = 524,
  SslHandshakeFailed = 525,
  InvalidSslCertificate = 526,
}

declare namespace axios {
  // The classes (declared outside the namespace, as values of AxiosStatic) as types.
  type AxiosHeaders = AxiosHeadersClass;
  type AxiosError<T = unknown, D = any> = AxiosErrorClass<T, D>;
  type CanceledError<T> = CanceledErrorClass<T>;
  type Axios = AxiosClass;
  type HttpStatusCode = HttpStatusCodeEnum;

  // --- Headers -------------------------------------------------------------------------------------------------------

  type AxiosHeaderValue = AxiosHeaders | string | string[] | number | boolean | null;

  interface RawAxiosHeaders {
    [key: string]: AxiosHeaderValue;
  }

  type MethodsHeaders = Partial<{ [Key in Method as Lowercase<Key>]: AxiosHeaders } & { common: AxiosHeaders }>;

  /** A matcher of a header: a substring, a RegExp, or a function of its value and name. */
  type AxiosHeaderMatcher = string | RegExp | ((this: AxiosHeaders, value: string, name: string) => boolean);

  type AxiosHeaderParser = (this: AxiosHeaders, value: AxiosHeaderValue, header: string) => any;

  type CommonRequestHeadersList = 'Accept' | 'Content-Length' | 'User-Agent' | 'Content-Encoding' | 'Authorization';

  type ContentType =
    | AxiosHeaderValue
    | 'text/html'
    | 'text/plain'
    | 'multipart/form-data'
    | 'application/json'
    | 'application/x-www-form-urlencoded'
    | 'application/octet-stream';

  type RawAxiosRequestHeaders = Partial<
    RawAxiosHeaders & { [Key in CommonRequestHeadersList]: AxiosHeaderValue } & { 'Content-Type': ContentType }
  >;

  type AxiosRequestHeaders = RawAxiosRequestHeaders & AxiosHeaders;

  type CommonResponseHeadersList = 'Server' | 'Content-Type' | 'Content-Length' | 'Cache-Control' | 'Content-Encoding';

  type RawCommonResponseHeaders = { [Key in CommonResponseHeadersList]: AxiosHeaderValue } & {
    'set-cookie': string[];
  };

  type RawAxiosResponseHeaders = Partial<RawAxiosHeaders & RawCommonResponseHeaders>;

  type AxiosResponseHeaders = RawAxiosResponseHeaders & AxiosHeaders;

  // --- Config --------------------------------------------------------------------------------------------------------

  type Method =
    | 'get'
    | 'GET'
    | 'delete'
    | 'DELETE'
    | 'head'
    | 'HEAD'
    | 'options'
    | 'OPTIONS'
    | 'post'
    | 'POST'
    | 'put'
    | 'PUT'
    | 'patch'
    | 'PATCH'
    | 'purge'
    | 'PURGE'
    | 'link'
    | 'LINK'
    | 'unlink'
    | 'UNLINK';

  type ResponseType = 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream' | 'formdata';

  /** The encodings of Buffer (a response read as text). */
  type responseEncoding = BufferEncoding;

  interface AxiosRequestTransformer {
    (this: InternalAxiosRequestConfig, data: any, headers: AxiosRequestHeaders): any;
  }

  interface AxiosResponseTransformer {
    (this: InternalAxiosRequestConfig, data: any, headers: AxiosResponseHeaders, status?: number): any;
  }

  interface AxiosAdapter {
    (config: InternalAxiosRequestConfig): AxiosPromise;
  }

  type AxiosAdapterName = 'fetch' | 'xhr' | 'http' | (string & {});

  type AxiosAdapterConfig = AxiosAdapter | AxiosAdapterName;

  interface AxiosBasicCredentials {
    username: string;
    password: string;
  }

  interface AxiosProxyConfig {
    host: string;
    port: number;
    auth?: AxiosBasicCredentials;
    protocol?: string;
  }

  interface TransitionalOptions {
    /** An answer that is not JSON stays text (true, the default), or is an error (responseType 'json'). */
    silentJSONParsing?: boolean;
    /** Answers parsed as JSON when no responseType is given (true, the default). */
    forcedJSONParsing?: boolean;
    /** Timeouts with code ETIMEDOUT instead of ECONNABORTED. */
    clarifyTimeoutError?: boolean;
    /** Request interceptors run last added first (true, the default). */
    legacyInterceptorReqResOrdering?: boolean;
  }

  interface GenericAbortSignal {
    readonly aborted: boolean;
    onabort?: ((...args: any) => any) | null;
    addEventListener?: (...args: any) => any;
    removeEventListener?: (...args: any) => any;
  }

  interface FormDataVisitorHelpers {
    defaultVisitor: SerializerVisitor;
    convertValue: (value: any) => any;
    isVisitable: (value: any) => boolean;
  }

  interface SerializerVisitor {
    (
      this: GenericFormData,
      value: any,
      key: string | number,
      path: null | Array<string | number>,
      helpers: FormDataVisitorHelpers
    ): boolean;
  }

  interface SerializerOptions {
    visitor?: SerializerVisitor;
    /** key{} keeps its braces (true). */
    dots?: boolean;
    metaTokens?: boolean;
    /** Arrays as a[] (false), a[0] (true) or a (null). */
    indexes?: boolean | null;
  }

  interface FormSerializerOptions extends SerializerOptions {}

  interface ParamEncoder {
    (value: any, defaultEncoder: (value: any) => any): any;
  }

  interface CustomParamsSerializer {
    (params: Record<string, any>, options?: ParamsSerializerOptions): string;
  }

  interface ParamsSerializerOptions extends SerializerOptions {
    encode?: ParamEncoder;
    serialize?: CustomParamsSerializer;
  }

  type MaxUploadRate = number;
  type MaxDownloadRate = number;

  interface AxiosProgressEvent {
    loaded: number;
    total?: number;
    progress?: number;
    bytes: number;
    rate?: number;
    estimated?: number;
    upload?: boolean;
    download?: boolean;
    event?: any;
    lengthComputable: boolean;
  }

  type Milliseconds = number;

  type AddressFamily = 4 | 6 | undefined;

  interface LookupAddressEntry {
    address: string;
    family?: AddressFamily;
  }

  type LookupAddress = string | LookupAddressEntry;

  interface AxiosRequestConfig<D = any> {
    url?: string;
    method?: Method | string;
    baseURL?: string;
    /** An absolute url goes where it says (true, the default) or is joined to baseURL too (false). */
    allowAbsoluteUrls?: boolean;
    transformRequest?: AxiosRequestTransformer | AxiosRequestTransformer[];
    transformResponse?: AxiosResponseTransformer | AxiosResponseTransformer[];
    headers?: (RawAxiosRequestHeaders & MethodsHeaders) | AxiosHeaders;
    params?: any;
    paramsSerializer?: ParamsSerializerOptions | CustomParamsSerializer;
    data?: D;
    /** Milliseconds (0: none). */
    timeout?: Milliseconds;
    timeoutErrorMessage?: string;
    withCredentials?: boolean;
    adapter?: AxiosAdapterConfig | AxiosAdapterConfig[];
    auth?: AxiosBasicCredentials;
    responseType?: ResponseType;
    responseEncoding?: responseEncoding | string;
    xsrfCookieName?: string;
    xsrfHeaderName?: string;
    onUploadProgress?: (progressEvent: AxiosProgressEvent) => void;
    onDownloadProgress?: (progressEvent: AxiosProgressEvent) => void;
    /** Bytes of the response at most (-1: no limit). */
    maxContentLength?: number;
    validateStatus?: ((status: number) => boolean) | null;
    /** Bytes of the request at most (-1: no limit). */
    maxBodyLength?: number;
    maxRedirects?: number;
    /** Bytes a second: one for both ways, or [upload, download]. */
    maxRate?: number | [MaxUploadRate, MaxDownloadRate];
    beforeRedirect?: (
      options: Record<string, any>,
      responseDetails: { headers: Record<string, string>; statusCode: HttpStatusCode }
    ) => void;
    socketPath?: string | null;
    transport?: any;
    httpAgent?: HttpAgent | any;
    httpsAgent?: HttpsAgent | any;
    /** A proxy, or false for none (the environment's otherwise: http_proxy, https_proxy, no_proxy). */
    proxy?: AxiosProxyConfig | false;
    cancelToken?: CancelToken;
    decompress?: boolean;
    transitional?: TransitionalOptions;
    signal?: GenericAbortSignal;
    insecureHTTPParser?: boolean;
    env?: {
      FormData?: new (...args: any[]) => object;
      fetch?: (input: URL | Request | string, init?: RequestInit) => Promise<Response>;
      Request?: new (input: URL | Request | string, init?: RequestInit) => Request;
      Response?: new (body?: any, init?: ResponseInit) => Response;
      Blob?: new (...args: any[]) => object;
    };
    formSerializer?: FormSerializerOptions;
    family?: AddressFamily;
    lookup?:
      | ((
          hostname: string,
          options: object,
          cb: (
            err: Error | null,
            address: LookupAddress | LookupAddress[] | DnsLookupAddress[],
            family?: AddressFamily
          ) => void
        ) => void)
      | ((
          hostname: string,
          options: object
        ) => Promise<[address: LookupAddressEntry | LookupAddressEntry[], family?: AddressFamily] | LookupAddress>);
    withXSRFToken?: boolean | ((config: InternalAxiosRequestConfig) => boolean | undefined);
    parseReviver?: (this: any, key: string, value: any) => any;
    fetchOptions?: Omit<RequestInit, 'body' | 'headers' | 'method' | 'signal'> | Record<string, any>;
    /** 2 for HTTP/2 (its sessions shared by authority). */
    httpVersion?: 1 | 2;
    http2Options?: Record<string, any> & { sessionTimeout?: number };
  }

  type RawAxiosRequestConfig<D = any> = AxiosRequestConfig<D>;

  /** The config interceptors and adapters see: merged, its headers AxiosHeaders. */
  interface InternalAxiosRequestConfig<D = any> extends AxiosRequestConfig<D> {
    headers: AxiosRequestHeaders;
  }

  interface HeadersDefaults {
    common: RawAxiosRequestHeaders;
    delete: RawAxiosRequestHeaders;
    get: RawAxiosRequestHeaders;
    head: RawAxiosRequestHeaders;
    post: RawAxiosRequestHeaders;
    put: RawAxiosRequestHeaders;
    patch: RawAxiosRequestHeaders;
    options?: RawAxiosRequestHeaders;
    purge?: RawAxiosRequestHeaders;
    link?: RawAxiosRequestHeaders;
    unlink?: RawAxiosRequestHeaders;
  }

  interface AxiosDefaults<D = any> extends Omit<AxiosRequestConfig<D>, 'headers'> {
    headers: HeadersDefaults;
  }

  interface CreateAxiosDefaults<D = any> extends Omit<AxiosRequestConfig<D>, 'headers'> {
    headers?: RawAxiosRequestHeaders | AxiosHeaders | Partial<HeadersDefaults>;
  }

  // --- Responses and errors ------------------------------------------------------------------------------------------

  interface AxiosResponse<T = any, D = any, H = {}> {
    data: T;
    status: number;
    statusText: string;
    headers: H & RawAxiosResponseHeaders & AxiosResponseHeaders;
    config: InternalAxiosRequestConfig<D>;
    request?: any;
  }

  type AxiosPromise<T = any> = Promise<AxiosResponse<T>>;

  // --- Cancellation (the API before AbortSignal) ---------------------------------------------------------------------

  interface Cancel {
    message: string | undefined;
  }

  interface CancelStatic {
    new (message?: string): Cancel;
  }

  interface Canceler {
    (message?: string, config?: AxiosRequestConfig, request?: any): void;
  }

  interface CancelToken {
    promise: Promise<Cancel>;
    reason?: Cancel;
    throwIfRequested(): void;
  }

  interface CancelTokenSource {
    token: CancelToken;
    cancel: Canceler;
  }

  interface CancelTokenStatic {
    new (executor: (cancel: Canceler) => void): CancelToken;
    source(): CancelTokenSource;
  }

  // --- Interceptors, instances -------------------------------------------------------------------------------------

  interface AxiosInterceptorOptions {
    /** Run in the call, not after a microtask (when every request interceptor is). */
    synchronous?: boolean;
    runWhen?: (config: InternalAxiosRequestConfig) => boolean;
  }

  type AxiosInterceptorFulfilled<T> = (value: T) => T | Promise<T>;
  type AxiosInterceptorRejected = (error: any) => any;

  type AxiosRequestInterceptorUse<T> = (
    onFulfilled?: AxiosInterceptorFulfilled<T> | null,
    onRejected?: AxiosInterceptorRejected | null,
    options?: AxiosInterceptorOptions
  ) => number;

  type AxiosResponseInterceptorUse<T> = (
    onFulfilled?: AxiosInterceptorFulfilled<T> | null,
    onRejected?: AxiosInterceptorRejected | null
  ) => number;

  interface AxiosInterceptorHandler<T> {
    fulfilled: AxiosInterceptorFulfilled<T>;
    rejected?: AxiosInterceptorRejected;
    synchronous: boolean;
    runWhen: ((config: AxiosRequestConfig) => boolean) | null;
  }

  interface AxiosInterceptorManager<V> {
    use: V extends AxiosResponse ? AxiosResponseInterceptorUse<V> : AxiosRequestInterceptorUse<V>;
    eject(id: number): void;
    clear(): void;
    handlers?: Array<AxiosInterceptorHandler<V>>;
  }

  interface AxiosInstance extends Axios {
    <T = any, R = AxiosResponse<T>, D = any>(config: AxiosRequestConfig<D>): Promise<R>;
    <T = any, R = AxiosResponse<T>, D = any>(url: string, config?: AxiosRequestConfig<D>): Promise<R>;

    create(config?: CreateAxiosDefaults): AxiosInstance;
    defaults: Omit<AxiosDefaults, 'headers'> & {
      headers: HeadersDefaults & { [key: string]: AxiosHeaderValue };
    };
  }

  // --- Forms ---------------------------------------------------------------------------------------------------------

  interface GenericFormData {
    append(name: string, value: any, options?: any): any;
  }

  interface GenericHTMLFormElement {
    name: string;
    method: string;
    submit(): void;
  }

  // --- Statuses ------------------------------------------------------------------------------------------------------

  /** The default instance: axios(config), axios.get(url)..., and the API's classes and helpers. */
  interface AxiosStatic extends AxiosInstance {
    Cancel: CancelStatic;
    CancelToken: CancelTokenStatic;
    Axios: typeof AxiosClass;
    AxiosError: typeof AxiosErrorClass;
    CanceledError: typeof CanceledErrorClass;
    AxiosHeaders: typeof AxiosHeadersClass;
    HttpStatusCode: typeof HttpStatusCodeEnum;
    readonly VERSION: string;
    isCancel<T = any>(value: any): value is CanceledError<T>;
    all<T>(values: Array<T | Promise<T>>): Promise<T[]>;
    spread<T, R>(callback: (...args: T[]) => R): (array: T[]) => R;
    isAxiosError<T = any, D = any>(payload: any): payload is AxiosError<T, D>;
    /** An object's values appended to a form (nested keys as a[b] or a.b). */
    toFormData(sourceObj: object, targetFormData?: GenericFormData, options?: FormSerializerOptions): GenericFormData;
    /** A FormData's (or a form's) entries as an object. */
    formToJSON(form: GenericFormData | GenericHTMLFormElement): object;
    /** The first adapter of a list the environment has. */
    getAdapter(adapters: AxiosAdapterConfig | AxiosAdapterConfig[] | undefined): AxiosAdapter;
    mergeConfig<D = any>(config1: AxiosRequestConfig<D>, config2: AxiosRequestConfig<D>): AxiosRequestConfig<D>;
    default: AxiosStatic;
  }
}

declare const axios: axios.AxiosStatic;

export = axios;
