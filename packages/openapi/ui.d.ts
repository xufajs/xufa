// @xufa/openapi/ui: the explorer of the document of @xufa/openapi (Swagger UI, Scalar or Redoc).
import { XufaPluginCallback, XufaRequest, XufaReply, onRequestHookHandler, preHandlerHookHandler } from '@xufa/http';

declare namespace explorer {
  export interface ExplorerOptions {
    /** Where its routes are ('/documentation'). */
    routePrefix?: string;
    /** 'swagger' (the default), 'scalar' or 'redoc'. */
    ui?: 'swagger' | 'scalar' | 'redoc';
    /**
     * Where its files come from, one after another in the browser when one fails: names of CDNS ('jsdelivr',
     * 'unpkg', 'npmmirror'), templates of {name}, {version} and {file}, or base URLs (<base>/<name>@<version>/<file>).
     * ['jsdelivr', 'npmmirror'] by default.
     */
    cdn?: string | string[];
    /** The version of the explorer on the CDNs (VERSIONS by default). */
    version?: string;
    /**
     * The sha384 of its files the browser checks: true, those of the pinned versions; false, none; or file -> hash
     * (over them).
     */
    integrity?: boolean | Record<string, string>;
    /**
     * A folder whose files are served at <routePrefix>/static and used instead of the CDNs', file by file (by their
     * paths in the package: a copy of swagger-ui-dist, or a swagger-ui.css of yours).
     */
    assets?: string | null;
    /** CSS of yours, loaded after the explorer's (served at <routePrefix>/custom.css). */
    css?: string | Buffer | null;
    /** HTML put in the head of the page (a favicon, a font). */
    head?: string;
    /** The page as sent: the HTML made, changed by a function of yours. */
    page?: ((html: string, request: XufaRequest, reply: XufaReply) => string | Promise<string>) | null;
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
    /** A Content-Security-Policy for the page: true (its own origin and the CDNs') or a policy of yours. */
    csp?: boolean | string;
  }

  /** The versions of the explorers on the CDNs. */
  export const VERSIONS: { swagger: string; scalar: string; redoc: string };
  /** The CDNs by name: templates of {name}, {version} and {file}. */
  export const CDNS: { jsdelivr: string; unpkg: string; npmmirror: string };
}

type Explorer = XufaPluginCallback<explorer.ExplorerOptions>;

// A function, as the declarations of @fastify/swagger: the options are inferred from it, not from what is given.
declare function explorer(...params: Parameters<Explorer>): ReturnType<Explorer>;
export = explorer;
