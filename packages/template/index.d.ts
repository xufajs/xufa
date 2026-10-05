import type { Filter } from '@xufa/expression';

export type TemplateContext = Record<string, unknown> | object | null | undefined;

/** A template compiled: it gives its text for a context. */
export interface CompiledTemplate {
  (context?: TemplateContext): string;
  /** The source it was compiled from. */
  readonly source: string;
  /** With one expression alone ({{ expression }}): its value, not as text. */
  value?: (context?: TemplateContext) => unknown;
  /** The text in chunks of at least chunkSize characters (65536), made as they are read. */
  stream(context?: TemplateContext, options?: { chunkSize?: number }): Generator<string, void, undefined>;
}

export interface TemplateEngineOptions {
  /** Filters over the default ones ({{ value | name(args) }}: the value first). */
  filters?: Record<string, Filter>;
  /** Names of the expressions over the default globals (Math, JSON, Number...). */
  globals?: Record<string, unknown>;
  /** false: no default globals in expressions. */
  builtins?: boolean;
  /** true (HTML, the default), false, or a function that escapes a text. */
  escape?: boolean | ((text: string) => string);
  /** Names not given and members of null are errors (by default they are nothing). */
  strict?: boolean;
  /** Sources of partials by name ({{> name}}). */
  partials?: Record<string, string>;
  /** How deep partials can be in partials (32). */
  maxDepth?: number;
  /** How many templates compiled are kept (500). */
  cacheSize?: number;
  /** false: templates rendered often stay closures (they do not become one function with their paths inline). */
  inline?: boolean;
  /** The source of a partial that is not registered ({{> name}}), or undefined: the plugin reads them from files. */
  loadPartial?: (name: string) => string | undefined | null;
}

export interface CompileOptions {
  /** The name of the template, in its errors. */
  name?: string;
  /** false: values are written as they are. */
  escape?: false;
}

export declare class TemplateEngine {
  constructor(options?: TemplateEngineOptions);
  readonly filters: Record<string, Filter>;
  readonly partials: Map<string, string>;
  compile(source: string, options?: CompileOptions): CompiledTemplate;
  render(source: string, context?: TemplateContext, options?: CompileOptions): string;
  /** Data with templates in its strings: a string that is one {{ expression }} alone gives its value. */
  fill<T = unknown>(value: T, context?: TemplateContext): unknown;
  /** Adds a filter (or replaces one). */
  filter(name: string, fn: Filter): this;
  /** Adds a partial (or replaces one). */
  partial(name: string, source: string): this;
}

export type TemplateErrorCode =
  'XUFA_TEMPLATE_ERR_SYNTAX' | 'XUFA_TEMPLATE_ERR_RUNTIME' | 'XUFA_TEMPLATE_ERR_PARTIAL' | 'XUFA_EXPR_ERR_FORBIDDEN';

export declare class TemplateError extends Error {
  code: TemplateErrorCode;
  /** The name of the template, when it has one. */
  template?: string;
  position?: number;
  line?: number;
  column?: number;
}

/** A text that is HTML already: written as it is. */
export declare class SafeString {
  constructor(value: unknown);
  readonly value: string;
  toString(): string;
  toJSON(): string;
}

export declare function escapeHtml(value: unknown): string;
/** The default filters. */
export declare const FILTERS: Readonly<Record<string, Filter>>;

export declare function compile(source: string, options?: CompileOptions): CompiledTemplate;
export declare function render(source: string, context?: TemplateContext, options?: CompileOptions): string;
export declare function fill(value: unknown, context?: TemplateContext): unknown;

export interface TemplatePluginOptions extends TemplateEngineOptions {
  /** The folder of the views ('views'). */
  root?: string;
  /** Added to names without one ('.html'). */
  extension?: string;
  /** The view a view is rendered in, as body (none by default). */
  layout?: string | null;
  /** The context of every view, under reply.locals and the data given. */
  defaultContext?: Record<string, unknown>;
  /** Files read once (by default when NODE_ENV is production); without it, read at every render. */
  cache?: boolean;
  /** The name of the decorations ('view': reply.view, reply.viewAsync, app.view). */
  propertyName?: string;
  /** Every view sent in chunks made as the client reads them (false). */
  stream?: boolean;
  /** The size of those chunks, in characters (65536). */
  chunkSize?: number;
  /** An engine of your own (the options of the engine are then those it has). */
  engine?: TemplateEngine;
}

export interface ViewOptions {
  /** The layout of this view (false: none). */
  layout?: string | false | null;
  /** Sent in chunks made as the client reads them (the option of the plugin by default). */
  stream?: boolean;
}

/** reply.view: renders a view and sends it (text/html unless the reply has a content type). */
export type ReplyView<Reply = any> = (name: string, data?: Record<string, unknown>, options?: ViewOptions) => Reply;
/** reply.viewAsync and app.view: the text of a view. */
export type RenderView = (name: string, data?: Record<string, unknown>, options?: ViewOptions) => Promise<string>;

/**
 * The plugin for @xufa/http (and fastify): views are files of root, rendered and sent by reply.view(name, data). It
 * decorates the app with view, and replies with view, viewAsync and locals. To type them:
 *
 *   declare module '@xufa/http' {
 *     interface XufaInstance { view: RenderView }
 *     interface XufaReply { view: ReplyView<XufaReply>; viewAsync: RenderView; locals: Record<string, unknown> | null }
 *   }
 */
export declare function plugin(app: any, options: TemplatePluginOptions, done: (err?: Error) => void): void;
