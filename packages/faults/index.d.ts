/** What an operation is: its name, and the fields its filters read. */
export interface FaultContext {
  operation: string;
  /** Waits (delay, hang) end when it is aborted. */
  signal?: AbortSignal;
  [field: string]: unknown;
}

/** The options of a rule. */
export interface FaultOptions<Operation extends string = string> {
  /** Operations (names or groups); the defaults of the faults when not given. */
  operations?: Operation | Operation[];
  /** The chance of each match, 0 to 1 (faults.random() below it). */
  rate?: number;
  /** The first n matches are left alone. */
  after?: number;
  /** Removed after n hits. */
  times?: number;
  /** A check of the context of the operation, besides the filters. */
  match?: (context: FaultContext) => boolean;
  /** The error of a fail: an error, or a function of the context. */
  error?: Error | ((context: FaultContext) => Error);
  message?: string;
  /** Filters of the faults (models, tenants, keys, paths, events...): names, prefixes or regular expressions. */
  [filter: string]: unknown;
}

export interface FaultRule {
  readonly kind: string;
  /** The operations it acted on. */
  readonly hits: number;
  readonly active: boolean;
  remove(): this;
  /** What it holds (hang) goes on. */
  release(): this;
}

export interface FaultsConfig<Operation extends string = string> {
  /** Its name in messages ('cache', 'database'...). */
  name?: string;
  operations?: readonly Operation[];
  groups?: Record<string, readonly Operation[]>;
  defaults?: readonly Operation[];
  /** Options of rules to fields of the context: 'model', or { field: 'path', prefixes: true }. */
  filters?: Record<string, string | { field: string; prefixes?: boolean }>;
  error?: (rule: FaultRule, context: FaultContext) => Error;
  downMessage?: string;
}

export declare class Faults<Operation extends string = string> {
  constructor(config?: FaultsConfig<Operation>);
  /** Its name in messages ('faults' when not given). */
  readonly name: string;
  readonly rules: FaultRule[];
  /** Math.random; a function of your own in tests. */
  random: () => number;
  fail(options?: FaultOptions<Operation>): FaultRule;
  delay(options: FaultOptions<Operation> & { ms: number; jitter?: number }): FaultRule;
  hang(options?: FaultOptions<Operation>): FaultRule;
  /** Every operation fails, until up(). */
  down(options?: FaultOptions<Operation>): FaultRule;
  up(): this;
  clear(): this;
  /** A rule of a kind of its own: replace(context) is what the operation gives instead. */
  add(
    kind: string,
    options?: FaultOptions<Operation>,
    extra?: { replace?: (context: FaultContext) => unknown }
  ): FaultRule;
  /** The rules that act on an operation, at once (their hits counted). */
  pick(context: FaultContext): Array<{ rule: FaultRule; kind: string; ms: number }>;
  /** An operation through the faults. */
  apply<T>(context: FaultContext, run: () => T | Promise<T>): Promise<T>;
  /** Throws what a rule of these options would throw, without making it. */
  check(kind: string, options?: FaultOptions<Operation>): this;
}

/** A duration: milliseconds, or text as '500ms', '30s', '2m', '1h'. */
export type Duration = number | string;

export type ScenarioTarget = Faults<any> | { readonly faults: Faults<any> };

export interface ScenarioStep {
  /** When it starts, from the start of the scenario (0). */
  at?: Duration;
  /** Faults (or what has them), or the name of one of `targets`. */
  target: ScenarioTarget | string;
  kind: 'fail' | 'delay' | 'hang' | 'down' | 'respond' | 'drop';
  options?: FaultOptions & Record<string, unknown>;
  /** How long its rule stays; until the end of the scenario without it. */
  for?: Duration;
}

export interface ScenarioEvent {
  type: 'start' | 'step' | 'end' | 'error' | 'done' | 'stopped';
  /** Milliseconds from the start. */
  at: number;
  step?: number;
  target?: string;
  kind?: string;
  message?: string;
}

export interface ScenarioOptions {
  name?: string;
  steps: ScenarioStep[];
  /** How long it lasts: until its last step ends when not given. */
  duration?: Duration;
  targets?: Record<string, ScenarioTarget>;
  onEvent?: (event: ScenarioEvent, scenario: Scenario) => void;
}

export interface ScenarioStatus {
  name: string;
  state: 'ready' | 'running' | 'done' | 'stopped';
  duration: number;
  elapsed: number;
  startedAt: string | null;
  steps: Array<{
    at: number;
    for: number | null;
    target: string;
    kind: string;
    state: 'waiting' | 'active' | 'done' | 'skipped' | 'failed';
    hits: number;
  }>;
  events: ScenarioEvent[];
}

/** Rules that come and go on a timeline (steps checked when it is made). */
export declare class Scenario {
  constructor(options: ScenarioOptions);
  readonly name: string;
  readonly duration: number;
  readonly state: ScenarioStatus['state'];
  start(): this;
  /** Starts it (when it has not started) and waits for its end. */
  run(): Promise<this>;
  /** Stops it: its rules removed, the steps not made skipped. */
  stop(): this;
  status(): ScenarioStatus;
}

export function scenario(options: ScenarioOptions): Scenario;

/** The error of a fault injected; instanceof is true of every one (its code ends in FAULT). */
export declare class FaultError extends Error {
  constructor(message: string, context?: Partial<FaultContext>);
  readonly code: string;
  readonly statusCode: number;
  readonly operation: string | undefined;
}

export function isFault(value: unknown): boolean;
export function sleep(ms: number, signal?: AbortSignal): Promise<void>;
/** Wraps methods of an object: each call goes through the faults. */
export function wrap<O extends object, Operation extends string>(
  faults: Faults<Operation>,
  target: O,
  methods: readonly string[],
  contextOf: (method: string, args: unknown[]) => FaultContext
): Faults<Operation>;

export type CacheOperation = 'get' | 'set' | 'delete' | 'clear' | 'read' | 'write';
/** The faults of a cache: get, set, delete, clear (read, write); keys by prefix or regular expression. */
export type CacheFaults = Faults<CacheOperation>;
export function cacheFaults(cache: object, name?: string): CacheFaults;

/** The faults that have rules now (of the database, its caches, the clients, the bus...). */
export function activeFaults(): Faults[];
/** Removes every rule of every faults, and lets go what they hold; gives the number of rules removed. */
export function clearFaults(): number;
export interface UseFaultsOptions {
  /** A test that ends with faults still set fails (they are cleared all the same). */
  strict?: boolean;
  /** The hooks of the runner (require('node:test')); the globals by default. */
  hooks?: TestHooks;
}
export interface TestHooks {
  afterEach(fn: () => void): unknown;
}
/** clearFaults() after each test: the afterEach of the runner (a global), or of the hooks given (node:test). */
export function useFaults(hooks?: TestHooks, options?: UseFaultsOptions): void;
export function useFaults(options: UseFaultsOptions): void;

export interface FaultsPluginOptions {
  /** The faults the routes act on, by name: faults, or what has them (db, db.cache, a client, the bus...). */
  targets: Record<string, Faults<any> | { readonly faults: Faults<any> }>;
  /** Authorization: Bearer <token> (or x-faults-token); 16 characters or more. */
  token?: string;
  /** A check of your own of each request (true: allowed). */
  authorize?: (request: any) => boolean | Promise<boolean>;
  /** A rule of @xufa/auth, as the config.auth of the routes. */
  auth?: unknown;
  /** Where the routes are ('/_faults'). */
  path?: string;
  /** The page of the faults at <path>/ui (true); its files have no data, and it asks the protected routes. */
  ui?: boolean;
  /** The longest a rule stays: a duration (30000, '10m', '1h'). '1h'. */
  maxDuration?: number | string;
  /** Off in production by default (NODE_ENV). */
  enabled?: boolean;
  /** Needed, with enabled: true, in production. */
  allowProduction?: boolean;
  /** Scenarios started by name (POST <path>/scenarios/:name): their steps name targets. Checked when registered. */
  scenarios?: Record<string, { steps: Array<ScenarioStep & { target: string }>; duration?: Duration }>;
}

/** The plugin of @xufa/http (and fastify) that turns faults on and off over HTTP, for staging. */
export declare const plugin: (app: any, options: FaultsPluginOptions) => Promise<void>;
