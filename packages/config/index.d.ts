export type ConfigType =
  'string' | 'number' | 'integer' | 'boolean' | 'port' | 'url' | 'duration' | 'array' | 'object' | 'any';

/** A key of a schema: one value. */
export interface KeySpec {
  type: ConfigType;
  default?: unknown;
  /** Missing (no value, no default) is an error. */
  required?: boolean;
  nullable?: boolean;
  /** The variable of the environment that sets it. */
  env?: string;
  /** The values allowed. */
  values?: readonly unknown[];
  /** Of strings. */
  pattern?: string | RegExp;
  /** Of numbers, or of the length of strings and arrays. */
  min?: number;
  max?: number;
  /** The type of the items of an array. */
  items?: ConfigType;
  /** Redacted when the configuration is shown. */
  sensitive?: boolean;
  doc?: string;
}

export interface Schema {
  [key: string]: KeySpec | Schema;
}

type Scalar<T extends ConfigType> = T extends 'string' | 'url'
  ? string
  : T extends 'number' | 'integer' | 'port' | 'duration'
    ? number
    : T extends 'boolean'
      ? boolean
      : T extends 'array'
        ? unknown[]
        : T extends 'object'
          ? Record<string, unknown>
          : unknown;

type ValueOf<S extends KeySpec> = (
  S extends { values: readonly (infer V)[] }
    ? V
    : S['type'] extends 'array'
      ? S extends { items: infer I extends ConfigType }
        ? Scalar<I>[]
        : unknown[]
      : Scalar<S['type']>
) extends infer V
  ? | V
    | (S extends { nullable: true } ? null : never)
    | ('default' extends keyof S ? never : S extends { required: true } ? never : undefined)
  : never;

/** The configuration a schema describes. */
export type InferConfig<S extends Schema> = {
  [K in keyof S]: S[K] extends KeySpec ? ValueOf<S[K]> : S[K] extends Schema ? InferConfig<S[K]> : never;
};

type DeepReadonly<T> = T extends (infer I)[]
  ? readonly DeepReadonly<I>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

export interface ConfigMethods {
  /** The value at a path ('database.url', or ['database', 'url']): a key that is not there is an error. */
  get<T = any>(path: string | readonly string[]): T;
  has(path: string | readonly string[]): boolean;
  /** A copy without its secrets: keys sensitive in the schema, and named as secrets (password, token, apiKey...). */
  redacted(): Record<string, unknown>;
  /** The copy without secrets (JSON.stringify writes it). */
  toJSON(): Record<string, unknown>;
  /** The files read: .env files, then those of the configuration. */
  readonly sources: readonly string[];
}

export type Config<T> = DeepReadonly<T> & ConfigMethods;

export interface LoadOptions {
  /** The folder of the files of the configuration ('config', from cwd). */
  dir?: string;
  cwd?: string;
  /** The environment: its file (config/production.json...). NODE_ENV, or 'development'. */
  env?: string;
  /** The variables (process.env). */
  environment?: Record<string, string | undefined>;
  /** Below the files. */
  defaults?: Record<string, unknown>;
  /** Over everything. */
  overrides?: Record<string, unknown>;
  /** Variables with it (APP__DATABASE__URL with 'APP') set keys. */
  envPrefix?: string;
  /** Between the keys of those variables ('__'). */
  envSeparator?: string;
  /** false: none; files of your own (they must exist); by default .env, .env.{env}, .env.local, .env.{env}.local. */
  dotenv?: boolean | string | string[];
  /** Sets in process.env the variables of the .env files it does not have. */
  populate?: boolean;
  /** With a schema: keys that are not in it are errors. */
  strict?: boolean;
}

/** The configuration of a schema, its type from it. */
export function loadConfig<const S extends Schema>(options: LoadOptions & { schema: S }): Config<InferConfig<S>>;
/** The configuration, of the type you give. */
export function loadConfig<T = Record<string, any>>(options?: LoadOptions & { schema?: Schema }): Config<T>;

/** Options of every remote source. */
export interface RemoteSourceOptions {
  /** Its name in errors, warnings, sources and cacheFile. */
  name?: string;
  /** The key it is put under ('secrets', 'a.b'). */
  at?: string;
  /** A failure leaves it out (a warning) instead of failing the configuration. */
  optional?: boolean;
  /** Its keys are redacted; never written to cacheFile. */
  sensitive?: boolean;
  /** false: its texts are never templates (a secret with {{ is that text). */
  templates?: boolean;
  /** Ms of each attempt (5000). */
  timeout?: number;
  /** Attempts after the first (2), waiting 200 ms, 400 ms... */
  retries?: number;
}

export interface RemoteContext {
  /** The variables (with those of the .env files). */
  env: Readonly<Record<string, string>>;
  /** The environment (production...). */
  name: string;
  /** Aborted at its timeout. */
  signal: AbortSignal;
}

/** A remote source: sources.http(), consul(), vault(), directory(), or one of your own. */
export interface RemoteSource extends RemoteSourceOptions {
  name: string;
  load(context: RemoteContext): Promise<Record<string, unknown> | undefined> | Record<string, unknown> | undefined;
}

export declare const sources: {
  /** A document of JSON or YAML over HTTP (its format by format, the content type or the extension); ETag kept. */
  http(
    options: RemoteSourceOptions & { url: string; headers?: Record<string, string>; format?: 'json' | 'yaml' }
  ): RemoteSource;
  /** The keys of Consul under a prefix as a tree, or one key as a document. CONSUL_HTTP_ADDR, CONSUL_HTTP_TOKEN. */
  consul(
    options: RemoteSourceOptions & {
      url?: string;
      token?: string;
      datacenter?: string;
      format?: 'json' | 'yaml';
    } & ({ prefix: string; key?: never } | { key: string; prefix?: never })
  ): RemoteSource;
  /** A secret of the KV engine of Vault (2 or 1), with a token or AppRole. VAULT_ADDR, VAULT_TOKEN... Sensitive. */
  vault(
    options: RemoteSourceOptions & {
      path: string;
      url?: string;
      mount?: string;
      kv?: 1 | 2;
      token?: string;
      roleId?: string;
      secretId?: string;
      namespace?: string;
    }
  ): RemoteSource;
  /** The files of a folder, a key each (Docker secrets, ConfigMaps and Secrets of Kubernetes). */
  directory(options: RemoteSourceOptions & { dir: string }): RemoteSource;
};

export interface RemoteLoadOptions extends LoadOptions {
  /** Read at once; merged in their order, after the files and before the variables. */
  remote?: RemoteSource[];
  /** A file of the last trees of the sources that are not sensitive, used when they fail. */
  cacheFile?: string;
  /** A source that failed but was left out (optional) or taken from cacheFile (a warning by default). */
  onSourceError?: (error: Error, source: RemoteSource) => void;
}

/** The configuration with remote sources (a schema: its type from it). */
export function loadRemoteConfig<const S extends Schema>(
  options: RemoteLoadOptions & { schema: S }
): Promise<Config<InferConfig<S>>>;
export function loadRemoteConfig<T = Record<string, any>>(
  options?: RemoteLoadOptions & { schema?: Schema }
): Promise<Config<T>>;

export interface WatchOptions<C> {
  /** A duration ('30s', 60000). */
  interval?: string | number;
  /** A new configuration, the one before, and the paths that changed. */
  onChange?: (config: C, previous: C, changed: string[]) => void | Promise<void>;
  /** A reading that failed (the configuration there was is kept). A warning by default. */
  onError?: (error: Error) => void;
}

export interface ConfigWatcher<C> {
  /** The configuration now. */
  readonly current: C;
  /** Reads it again now. */
  refresh(): Promise<C>;
  stop(): void;
}

/** The configuration, read again every interval. */
export function watchConfig<const S extends Schema>(
  options: RemoteLoadOptions & { schema: S },
  watch?: WatchOptions<Config<InferConfig<S>>>
): Promise<ConfigWatcher<Config<InferConfig<S>>>>;
export function watchConfig<T = Record<string, any>>(
  options?: RemoteLoadOptions & { schema?: Schema },
  watch?: WatchOptions<Config<T>>
): Promise<ConfigWatcher<Config<T>>>;

export function parseDotenv(text: string, file?: string): Record<string, string>;

export class ConfigError extends Error {
  code: 'XUFA_CONFIG_ERR';
  /** Every error found. */
  errors: { path: string; message: string }[];
}
