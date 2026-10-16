// Types of @xufa/http/helmet: helmet's API (8.3), middlewares of node:http that set the security headers of responses.
import type { IncomingMessage, ServerResponse } from 'node:http';

declare namespace helmet {
  type Middleware = (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void;

  type DirectiveValueFunction = (req: IncomingMessage, res: ServerResponse) => string;
  type DirectiveValue = string | DirectiveValueFunction;
  type Directives = Record<
    string,
    null | Iterable<DirectiveValue> | typeof contentSecurityPolicy.dangerouslyDisableDefaultSrc
  >;

  type ContentSecurityPolicyOptions = { reportOnly?: boolean } & (
    { useDefaults?: true; directives?: Directives } | { useDefaults: false; directives: Directives }
  );

  interface CrossOriginEmbedderPolicyOptions {
    policy?: 'require-corp' | 'credentialless' | 'unsafe-none';
  }

  interface CrossOriginOpenerPolicyOptions {
    policy?: 'same-origin' | 'same-origin-allow-popups' | 'noopener-allow-popups' | 'unsafe-none';
  }

  interface CrossOriginResourcePolicyOptions {
    policy?: 'same-origin' | 'same-site' | 'cross-origin';
  }

  type ReferrerPolicyToken =
    | 'no-referrer'
    | 'no-referrer-when-downgrade'
    | 'same-origin'
    | 'origin'
    | 'strict-origin'
    | 'origin-when-cross-origin'
    | 'strict-origin-when-cross-origin'
    | 'unsafe-url'
    | '';

  interface ReferrerPolicyOptions {
    policy?: ReferrerPolicyToken | ReferrerPolicyToken[];
  }

  interface StrictTransportSecurityOptions {
    /** Seconds (a year by default). */
    maxAge?: number;
    /** true by default. */
    includeSubDomains?: boolean;
    preload?: boolean;
  }

  interface XDnsPrefetchControlOptions {
    allow?: boolean;
  }

  interface XFrameOptionsOptions {
    action?: 'deny' | 'sameorigin';
  }

  interface XPermittedCrossDomainPoliciesOptions {
    permittedPolicies?: 'none' | 'master-only' | 'by-content-type' | 'all';
  }

  // An option by its name or its old name, not both.
  type EitherKey<Key1 extends PropertyKey, Key2 extends PropertyKey, Value> =
    ({ [K in Key1]?: Value } & { [K in Key2]?: never }) | ({ [K in Key1]?: never } & { [K in Key2]?: Value });

  /** Each header on by default (Cross-Origin-Embedder-Policy off): false turns one off, an object gives its options. */
  type HelmetOptions = {
    contentSecurityPolicy?: ContentSecurityPolicyOptions | boolean;
    crossOriginEmbedderPolicy?: CrossOriginEmbedderPolicyOptions | boolean;
    crossOriginOpenerPolicy?: CrossOriginOpenerPolicyOptions | boolean;
    crossOriginResourcePolicy?: CrossOriginResourcePolicyOptions | boolean;
    originAgentCluster?: boolean;
    referrerPolicy?: ReferrerPolicyOptions | boolean;
  } & EitherKey<'strictTransportSecurity', 'hsts', StrictTransportSecurityOptions | boolean> &
    EitherKey<'xContentTypeOptions', 'noSniff', boolean> &
    EitherKey<'xDnsPrefetchControl', 'dnsPrefetchControl', XDnsPrefetchControlOptions | boolean> &
    EitherKey<'xDownloadOptions', 'ieNoOpen', boolean> &
    EitherKey<'xFrameOptions', 'frameguard', XFrameOptionsOptions | boolean> &
    EitherKey<
      'xPermittedCrossDomainPolicies',
      'permittedCrossDomainPolicies',
      XPermittedCrossDomainPoliciesOptions | boolean
    > &
    EitherKey<'xPoweredBy', 'hidePoweredBy', boolean> &
    EitherKey<'xXssProtection', 'xssFilter', boolean>;

  const contentSecurityPolicy: {
    (options?: Readonly<ContentSecurityPolicyOptions>): Middleware;
    /** helmet's default directives (a new copy each call). */
    getDefaultDirectives(): Record<string, Iterable<DirectiveValue>>;
    /** The value of default-src that leaves it out (a policy needs one otherwise). */
    readonly dangerouslyDisableDefaultSrc: unique symbol;
  };
  function crossOriginEmbedderPolicy(options?: Readonly<CrossOriginEmbedderPolicyOptions>): Middleware;
  function crossOriginOpenerPolicy(options?: Readonly<CrossOriginOpenerPolicyOptions>): Middleware;
  function crossOriginResourcePolicy(options?: Readonly<CrossOriginResourcePolicyOptions>): Middleware;
  function originAgentCluster(): Middleware;
  function referrerPolicy(options?: Readonly<ReferrerPolicyOptions>): Middleware;
  function strictTransportSecurity(options?: Readonly<StrictTransportSecurityOptions>): Middleware;
  function xContentTypeOptions(): Middleware;
  function xDnsPrefetchControl(options?: Readonly<XDnsPrefetchControlOptions>): Middleware;
  function xDownloadOptions(): Middleware;
  function xFrameOptions(options?: Readonly<XFrameOptionsOptions>): Middleware;
  function xPermittedCrossDomainPolicies(options?: Readonly<XPermittedCrossDomainPoliciesOptions>): Middleware;
  function xPoweredBy(): Middleware;
  function xXssProtection(): Middleware;

  // The old names.
  const hsts: typeof strictTransportSecurity;
  const noSniff: typeof xContentTypeOptions;
  const dnsPrefetchControl: typeof xDnsPrefetchControl;
  const ieNoOpen: typeof xDownloadOptions;
  const frameguard: typeof xFrameOptions;
  const permittedCrossDomainPolicies: typeof xPermittedCrossDomainPolicies;
  const hidePoweredBy: typeof xPoweredBy;
  const xssFilter: typeof xXssProtection;

  /**
   * What helmet(options) does to every response (headers set, headers removed), or null when the policy has values
   * computed per request (xufa's, not helmet's).
   */
  function staticHeaders(options?: Readonly<HelmetOptions>): { set: Record<string, string>; removed: string[] } | null;
}

/** The middleware of every header, as the options say. */
declare function helmet(options?: Readonly<helmet.HelmetOptions>): helmet.Middleware;

export = helmet;
