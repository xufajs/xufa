import { EventEmitter } from 'node:events';

/** Milliseconds, or a text: '500ms', '30s', '10m', '2h', '1d', '1w', '1h30m'. */
export type Duration = number | string;

/** What a run gets. */
export interface RunContext<Data = unknown> {
  name: string;
  /** The time of this run (not when it started: a run that waited starts later). */
  scheduledAt: Date;
  /** 1, then 2... when a run that failed is tried again (retries). */
  attempt: number;
  /** Aborted at its timeout (a TimeoutError), or when the scheduler stops without it ending. */
  signal: AbortSignal;
  data: Data;
  scheduler: Scheduler;
}

interface JobBase<Data = unknown> {
  name: string;
  run: (context: RunContext<Data>) => unknown;
  /** 'skip' (the default): a time while a run goes on is left out; 'wait': run once when it ends; 'allow': at once. */
  overlap?: 'skip' | 'wait' | 'allow';
  /** Aborts the signal of a run that goes over it, and counts it as failed. */
  timeout?: Duration;
  /** Runs once when the scheduler starts too. */
  immediate?: boolean;
  /** false: this job runs in every process, though the scheduler has a lock. */
  lock?: boolean;
  /** How long a claim of the lock lasts if its process dies (renewed while the run goes on). The timeout, or 10 m. */
  lockTtl?: Duration;
  /** Given to each run. */
  data?: Data;
  /** How many times more a run that fails is tried (0). The attempts are one run. */
  retries?: number;
  /** The wait before the second attempt (1 s), multiplied by retryFactor (2) each time, up to maxRetryDelay. */
  retryDelay?: Duration;
  retryFactor?: number;
  maxRetryDelay?: Duration;
}

export interface EveryJob<Data = unknown> extends JobBase<Data> {
  every: Duration;
  /** true (the default): at the multiples of the interval since 1970 (every '10m': :00, :10...); false: from the start. */
  align?: boolean;
  /** When the scheduler starts, the last time missed (by the history) runs once. Needs a history; aligned only. */
  catchUp?: boolean;
}

export interface CronJob<Data = unknown> extends JobBase<Data> {
  /** 'minute hour day month weekday', or with seconds first; @hourly, @daily, @weekly, @monthly, @yearly. */
  cron: string;
  /** An IANA time zone ('Europe/Madrid'): that of the scheduler, or the local one. */
  timezone?: string;
  /** When the scheduler starts, the last time missed (by the history) runs once. Needs a history. */
  catchUp?: boolean;
}

export interface AtJob<Data = unknown> extends JobBase<Data> {
  at: Date | string | number;
  /** Jobs of once do not catch up. */
  catchUp?: never;
}

export interface InJob<Data = unknown> extends JobBase<Data> {
  in: Duration;
  /** Jobs of once do not catch up. */
  catchUp?: never;
}

export type JobSpec<Data = unknown> = EveryJob<Data> | CronJob<Data> | AtJob<Data> | InJob<Data>;

export interface JobInfo {
  name: string;
  /** 'every 10m', 'cron 0 8 * * 1-5 (Europe/Madrid)', 'at ...', 'in 30s'. */
  schedule: string;
  next: Date | null;
  running: boolean;
  runs: number;
  failures: number;
  skipped: number;
  /** Attempts tried again. */
  retries: number;
  lastRun: Date | null;
  lastDuration: number | null;
  lastError: unknown;
}

/** Which process runs a time of a job, among several with the same jobs. */
export interface Lock {
  /** A token, or null when that time was taken or a run of the job goes on elsewhere. */
  claim(claim: { name: string; slot: number; ttl: number }): string | null | Promise<string | null>;
  renew(claim: { name: string; token: string; ttl: number }): unknown;
  release(claim: { name: string; token: string }): unknown;
}

/** A run, in a history. */
export interface HistoryEntry {
  name: string;
  scheduledAt: Date;
  startedAt: Date;
  duration: number;
  status: 'done' | 'failed' | 'timeout';
  attempts: number;
  /** The message of the error of a run that failed. */
  error: string | null;
  host: string;
}

/** The runs of the jobs, recorded by the scheduler (and read by catchUp). */
export interface History {
  record(entry: HistoryEntry): unknown;
  /** The run of the latest time of a job, or null. */
  last(name: string): HistoryEntry | null | Promise<HistoryEntry | null>;
  /** The runs of a job, the last first (20). */
  list(name: string, options?: { limit?: number }): HistoryEntry[] | Promise<HistoryEntry[]>;
}

export interface OrmHistory extends History {
  model: any;
  sync(): Promise<void>;
  last(name: string): Promise<HistoryEntry | null>;
  list(name: string, options?: { limit?: number }): Promise<HistoryEntry[]>;
  /** Deletes the runs older than maxAge (or than before): how many. */
  prune(before?: Date): Promise<number>;
}

export interface OrmLock extends Lock {
  /** The model of the table of the locks, registered in the database. */
  model: any;
  /** Creates its table (db.sync() does too). */
  sync(): Promise<void>;
}

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(timer: unknown): void;
}

export interface SchedulerLogger {
  debug(obj: object, msg?: string): void;
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export interface SchedulerOptions {
  logger?: SchedulerLogger;
  lock?: Lock;
  /** Where every run is recorded (memoryHistory(), ormHistory(db)); catchUp reads it. */
  history?: History;
  /** Of every failure (an error it throws stops nothing). */
  onError?: (error: unknown, job: JobInfo) => void;
  /** Of the cron jobs without one. */
  timezone?: string;
  lockTtl?: Duration;
  /** Timers that do not keep the process alive. */
  unref?: boolean;
  /** For tests: a clock of your own. */
  clock?: Clock;
}

export interface SchedulerEvents {
  run: [{ name: string; scheduledAt: Date }];
  retry: [{ name: string; scheduledAt: Date; attempt: number; error: unknown; delay: number }];
  done: [{ name: string; scheduledAt: Date; duration: number; attempts: number; result: unknown }];
  failure: [{ name: string; scheduledAt: Date; duration: number; attempts: number; error: unknown }];
  catchUp: [{ name: string; scheduledAt: Date }];
  skip: [{ name: string; scheduledAt: Date; why: 'running' | 'locked' }];
}

export class Scheduler extends EventEmitter<SchedulerEvents> {
  constructor(options?: SchedulerOptions);
  readonly started: boolean;
  add<Data = unknown>(job: JobSpec<Data>): JobInfo;
  remove(name: string): boolean;
  has(name: string): boolean;
  job(name: string): JobInfo | null;
  jobs(): JobInfo[];
  start(): this;
  /** Waits for the runs going on (up to timeout, 10 s), then aborts the signals of those left. */
  stop(options?: { timeout?: Duration }): Promise<void>;
  /** The runs of a job in the history, the last first ([] without one). */
  history(name: string, options?: { limit?: number }): Promise<HistoryEntry[]>;
  /** Runs a job now (with its lock, overlap and retries): its result, or undefined when skipped. */
  runNow<T = unknown>(name: string): Promise<T | undefined>;
}

export function createScheduler(options?: SchedulerOptions): Scheduler;

export interface SchedulerPluginOptions extends SchedulerOptions {
  jobs?: JobSpec<any>[];
  /** false: you start it (app.scheduler.start()). */
  start?: boolean;
  /** One made before, instead of a new one. */
  scheduler?: Scheduler;
  /** How long close() waits for the runs going on. */
  stopTimeout?: Duration;
}

/** The plugin of @xufa/http and fastify: app.scheduler. */
export function schedulerPlugin(app: any, options: SchedulerPluginOptions, done: (err?: Error) => void): void;

export function memoryLock(options?: { now?: () => number }): Lock;
export function ormLock(db: any, options?: { table?: string; model?: string }): OrmLock;
/** The last runs of each job (keep: 100) in this process. */
export function memoryHistory(options?: { keep?: number }): History;
/** In a table of a database of @xufa/orm (xufa_scheduler_runs); runs older than maxAge (30 days; null: kept) deleted. */
export function ormHistory(db: any, options?: { table?: string; model?: string; maxAge?: Duration | null }): OrmHistory;

/** The next times of a cron expression. */
export function nextRuns(
  expression: string,
  count?: number,
  options?: { timezone?: string; from?: Date | number }
): Date[];

export function toMs(value: Duration, what?: string): number;

export class SchedulerError extends Error {
  code: 'XUFA_SCHEDULER_ERR';
}

export class TimeoutError extends Error {
  code: 'XUFA_SCHEDULER_TIMEOUT';
}
