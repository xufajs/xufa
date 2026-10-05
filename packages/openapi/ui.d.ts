// @xufa/openapi/ui: the explorer of the document of @xufa/openapi (Swagger UI, Scalar or Redoc).
import { XufaPluginCallback, XufaRequest, XufaReply, onRequestHookHandler, preHandlerHookHandler } from '@xufa/http';

declare namespace explorer {
  export interface ExplorerOptions {
    /** Where its routes are ('/documentation'). */
    routePrefix?: string;
    /** 'swagger' (the default), 'scalar' or 'redoc'. */
    ui?: 'swagger' | 'scalar' | 'redoc';
    /** The CDN of the explorers ('https://cdn.jsdelivr.net/npm'). */
    cdn?: string;
    /** The version of the explorer on the CDN (VERSIONS by default). */
    version?: string;
    /** A folder of swagger-ui-dist served at <routePrefix>/static instead of the CDN (swagger only). */
    assets?: string | null;
    /** The title of the page (the title of the document by default). */
    title?: string;
    /** The configuration of the explorer, as JSON (functions cannot be sent to the browser). */
    uiConfig?: Record<string, unknown>;
    /** Swagger UI: the options of initOAuth(). */
    initOAuth?: Record<string, unknown> | null;
    /** The document of the routes /json and /yaml, changed for a request. */
    transformSpecification?:
      ((document: Record<string, any>, request: XufaRequest, reply: XufaReply) => unknown) | null;
    /** Whether transformSpecification gets a copy of the document (true). */
    transformSpecificationClone?: boolean;
    /** Hooks of its routes: to protect them. */
    uiHooks?: { onRequest?: onRequestHookHandler; preHandler?: preHandlerHookHandler };
    /** A Content-Security-Policy for the page: true (its own and the CDN) or a policy of yours. */
    csp?: boolean | string;
  }

  /** The versions of the explorers on the CDN. */
  export const VERSIONS: { swagger: string; scalar: string; redoc: string };
}

type Explorer = XufaPluginCallback<explorer.ExplorerOptions>;

// A function, as the declarations of @fastify/swagger: the options are inferred from it, not from what is given.
declare function explorer(...params: Parameters<Explorer>): ReturnType<Explorer>;
export = explorer;
