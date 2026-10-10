/** A message in the plural: its forms by the rules of each language (Intl.PluralRules), other always. */
export interface PluralMessage {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

/** A catalog: messages by key, nested or with dots ('cart.items'). */
export interface Catalog {
  [key: string]: string | PluralMessage | Catalog;
}

export interface I18nOptions {
  /** Catalogs by locale: { en: {...}, es: {...}, 'es-AR': {...} }. */
  locales?: Record<string, Catalog>;
  /** The language every locale falls back to ('en'). */
  fallback?: string;
  /** What a key without a message gives (the key). */
  missing?: (key: string, locale: string, params: Record<string, unknown>) => string;
}

/** Messages in the languages of an app. */
export declare class I18n {
  constructor(options?: I18nOptions);
  readonly fallback: string;
  /** The locales with a catalog. */
  readonly locales: string[];
  /** The locale of this async context (a request), or the fallback. */
  readonly locale: string;
  /** Adds messages to the catalog of a locale. */
  add(locale: string, catalog: Catalog): this;
  /** The message of a key with its parameters ({name}; count for plurals), in a locale (this context's by default). */
  t(key: string, params?: Record<string, unknown>, locale?: string): string;
  /** Whether a key has a message in a locale (or in those it falls back to). */
  has(key: string, locale?: string): boolean;
  /** Runs fn in a locale: everything it calls speaks it. */
  run<T>(locale: string, fn: () => T): T;
  /** The locale for the rest of this async context. */
  enter(locale: string): void;
  /** The locales a locale looks in: es-AR, es, the fallback. */
  chain(locale: string): string[];
  /** The best locale with a catalog for those wanted (in order), or null. */
  match(wanted: string[]): string | null;
  /** Numbers, dates and lists in the locale of this context. */
  number(value: number | bigint, options?: Intl.NumberFormatOptions): string;
  date(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string;
  list(values: string[], options?: Intl.ListFormatOptions): string;
  /** The validation messages of @xufa/orm in the locale of each request (xufa's translations: es, fr, de, pt, it). */
  translateOrm(
    orm: {
      setTranslator(fn: ((key: string, params: Record<string, unknown>, english: string) => string) | null): void;
    },
    options?: { messages?: boolean }
  ): this;
  /** The messages users read of @xufa/auth (logins, accounts, their emails) in the locale of each request, as auth.*. */
  translateAuth(
    auth: {
      setTranslator(fn: ((key: string, params: Record<string, unknown>, english: string) => string) | null): void;
      AUTH_MESSAGES: Readonly<Record<string, string>>;
    },
    options?: { messages?: boolean }
  ): this;
  /** The messages of the API of @xufa/admin in the locale of each request, as admin.*. */
  translateAdmin(
    admin: {
      setTranslator(fn: ((key: string, params: Record<string, unknown>, english: string) => string) | null): void;
      ADMIN_MESSAGES: Readonly<Record<string, string>>;
    },
    options?: { messages?: boolean }
  ): this;
  /** The messages of the forms of @xufa/forms in the locale of each request, as forms.*. */
  translateForms(
    forms: { setTranslator(fn: ((key: string, params: Record<string, unknown>, english: string) => string) | null): void; FORMS_MESSAGES: Readonly<Record<string, string>> },
    options?: { messages?: boolean }
  ): this;
  /** Installs the translator of a module and xufa's catalogs of it (by locale) under a namespace. */
  install(
    module: {
      setTranslator(fn: ((key: string, params: Record<string, unknown>, english: string) => string) | null): void;
    },
    namespace: string,
    bundled: Record<string, Record<string, unknown>> | null
  ): this;
  /** A filter of @xufa/template: {{ 'cart.items' | t({ count }) }}. */
  readonly filter: (key: string, params?: Record<string, unknown>) => string;
}

export declare class I18nError extends Error {
  code: 'XUFA_I18N_ERR';
}

export interface I18nPluginOptions {
  i18n: I18n;
  /** How the locale of a request is found, in order: 'query', 'cookie', 'user', 'header', or functions (the first that matches). */
  detect?: Array<'query' | 'cookie' | 'user' | 'header' | ((request: any) => string | string[] | null | undefined)>;
  /** The query parameter and the cookie ('lang'). */
  query?: string;
  cookie?: string;
  /** The locale of the user of a request (request.user.locale). */
  user?: (request: any) => string | null | undefined;
  /** Content-Language in the answers (true). */
  contentLanguage?: boolean;
}

/** The plugin of @xufa/http: request.locale, request.t(), app.i18n. */
export declare function plugin(app: any, options: I18nPluginOptions, done: (err?: Error) => void): void;

/** The languages of an Accept-Language header, by their q. */
export declare function acceptedLanguages(header: string | undefined): string[];

/** A locale as BCP 47 writes it (es_ar gives es-AR), or null. */
export declare function normalize(locale: string): string | null;

/** The translations of the validation messages of @xufa/orm, by locale. */
export declare const ormMessages: Record<string, Record<string, string>>;

declare module '@xufa/http' {
  interface XufaRequest {
    locale: string | null;
    t(key: string, params?: Record<string, unknown>): string;
  }
}
