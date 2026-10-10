import { EventEmitter } from 'node:events';
import type { Database, Model, ModelClass, QuerySet } from '@xufa/orm';

/** Milliseconds, or a text: '500ms', '30s', '10m', '2h', '1d', '1w', '1h30m'. */
export type Duration = number | string;

/** The status of a job: waiting to run (or to run again), running, done (kept with keepDone) or failed. */
export type JobStatus = 'pending' | 'running' | 'done' | 'failed';

/** A job: an object of the model of the queue (its table, xufa_jobs). */
export interface Job<Payload = unknown> extends Model {
  id: number;
  name: string;
  queue: string;
  payload: Payload;
  status: JobStatus;
  /** Higher first. */
  priority: number;
  /** When it runs (or runs again). */
  runAt: Date;
  /** The runs started (1 in the first run). */
  attempts: number;
  maxAttempts: number;
  /** A job with the same key pending or running makes others not added. */
  key: string | null;
  /** The worker that runs it, and until when it is its own (then other workers take it back). */
  lockedBy: string | null;
  lockedUntil: Date | null;
  /** The error (its stack) of the last run that failed. */
  lastError: string | null;
  /** What the function gave (kept with keepDone). */
  result: unknown;
  createdAt: Date;
  finishedAt: Date | null;
  /** In a run: aborted at its timeout (and when its pool takes its node back). */
  signal?: AbortSignal;
  /** In a run of a kind of job with a pool: the node it was given. */
  node?: any;
}

/** The delay before a job is tried again: ms or a text, { type, delay, max, jitter }, or a function of the attempts. */
export type Backoff =
  | Duration
  | { type?: 'exponential' | 'fixed'; delay?: Duration; max?: Duration; jitter?: boolean }
  | ((attempts: number) => Duration);

/** The options of a kind of job (and the defaults of the queue). */
export interface JobOptions {
  /** Runs before it is failed (3). */
  attempts?: number;
  /** Exponential from 5 s, up to 1 h, with jitter, by default. */
  backoff?: Backoff;
  /** A run longer is failed, and its signal aborted ('5m'). */
  timeout?: Duration;
  /** The queue of its jobs ('default'). */
  queue?: string;
  /** Waited for when a run fails, before the job is tried again (final: false) or failed (final: true). */
  onFailure?: (job: Job, error: unknown, final: boolean) => unknown;
}

/** A pool of nodes of @xufa/cluster (createPool or usePool): jobs wait for a free node before they are claimed. */
export interface JobPool {
  acquire(options?: {
    signal?: AbortSignal;
  }): Promise<{ node: any; signal: AbortSignal; release(failed?: boolean): void }>;
}

/** The options of a kind of job. */
export interface DefineOptions extends JobOptions {
  /** Its jobs run on a node of this pool: they wait (pending) for a free one, and run with job.node. */
  pool?: JobPool;
}

/** The options of a queue: the defaults of its jobs, its table and model, whether done jobs are kept, a logger. */
export interface QueueOptions extends JobOptions {
  /** The table of the jobs ('xufa_jobs'). */
  table?: string;
  /** The name of their model ('XufaJob'). */
  model?: string;
  /** The model of another queue on the same database (its jobs shared). */
  jobModel?: ModelClass<Job>;
  /** Done jobs kept with their results (status 'done'); otherwise deleted. */
  keepDone?: boolean;
  logger?: { error(object: unknown, message?: string): void };
}

/** How a job is enqueued. */
export interface EnqueueOptions {
  /** Runs after this (ms or '10m'). */
  delay?: Duration;
  /** Runs at this time. */
  at?: Date | string | number;
  /** Higher first (0). */
  priority?: number;
  queue?: string;
  attempts?: number;
  /** Not added when a job with this key is pending or running (that one is given). */
  key?: string;
}

/** A worker of a queue (queue.work()). */
export declare class Worker {
  readonly concurrency: number;
  /** Looks for jobs now. */
  wake(): void;
  /** Stops, waiting for the jobs it runs (up to timeout ms). */
  stop(options?: { timeout?: number }): Promise<void>;
}

/** Counts of the jobs by status. */
export type JobCounts = Record<JobStatus, number>;

/**
 * Jobs in the background, kept in a database of @xufa/orm (any backend), run by workers on any machine with the
 * database: retries with backoff, timeouts, priorities, delays, unique keys; enqueued in a transaction, a job is there
 * only when it commits.
 */
export declare class Queue extends EventEmitter {
  constructor(db: Database, options?: QueueOptions);
  readonly db: Database;
  /** The model of the jobs. */
  readonly Job: ModelClass<Job>;
  keepDone: boolean;
  readonly workers: Worker[];
  /** Creates the table of the jobs (db.sync() makes it too). */
  sync(): Promise<void>;
  /** A kind of job: its function (payload, job), and options. */
  define<Payload = any>(
    name: string,
    handler: (payload: Payload, job: Job<Payload>) => unknown,
    options?: DefineOptions
  ): this;
  /** Adds a job (or gives the one there with its key). */
  enqueue<Payload = unknown>(name: string, payload?: Payload, options?: EnqueueOptions): Promise<Job<Payload>>;
  /** Runs the jobs due now, one after another (tests, scripts): counts by outcome. */
  runDue(options?: {
    queues?: string[] | null;
    limit?: number;
  }): Promise<{ done: number; retrying: number; failed: number }>;
  /** Starts a worker: up to concurrency jobs at once, of some queues, looking for jobs every poll ('1s'). */
  work(options?: { queues?: string[] | null; concurrency?: number; poll?: Duration }): Worker;
  /** Stops the workers, waiting for their jobs (up to timeout ms). */
  stop(options?: { timeout?: number }): Promise<void>;
  /** Failed jobs pending again (all, or those of the ids given): their number. */
  retry(ids?: unknown | unknown[]): Promise<number>;
  /** Jobs of stopped workers (past lockedUntil) pending again, or failed without attempts left: their number. */
  recover(): Promise<number>;
  /** Claims a job for this process: the job, or null when another took it. */
  claim(id: unknown, timeout: number): Promise<Job | null>;
  /** Runs a job claimed. */
  execute(job: Job): Promise<'done' | 'retrying' | 'failed'>;
  /** The jobs, as a queryset of their model. */
  readonly jobs: QuerySet<Job>;
  /**
   * A check of xufa.health: the counts, the lag of the oldest job due and the workers; degraded past maxLag ('5m'),
   * maxPending or maxFailed; down when the jobs cannot be read. Not critical by default.
   */
  health(options?: {
    maxLag?: Duration;
    maxPending?: number;
    maxFailed?: number;
    critical?: boolean;
    timeout?: number | string;
  }): QueueHealthCheck;
  counts(): Promise<JobCounts>;
  on(event: 'completed', listener: (job: Job, result: unknown) => void): this;
  on(event: 'retrying', listener: (job: Job, error: unknown, delay: number) => void): this;
  on(event: 'failed', listener: (job: Job, error: unknown) => void): this;
  on(event: 'error', listener: (error: unknown) => void): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;
}

/** A check of xufa.health of @xufa/http (checks: { name: x.health() }): what its check gives, and whether it is critical. */
export interface QueueHealthCheck {
  check(): Promise<
    { status: 'up' | 'degraded' | 'down'; error?: string } & {
      pending?: number;
      running?: number;
      done?: number;
      failed?: number;
      lag?: number;
      workers?: number;
    }
  >;
  critical: boolean;
  timeout?: number | string;
}

/** An error of the queue: a wrong job or option, or a run past its timeout (timeout: true). */
export declare class QueueError extends Error {
  code: 'XUFA_QUEUE_ERR';
  timeout?: boolean;
}

/** The options of the plugin: the queue, and its workers (started when the app is ready) or none. */
export interface QueuePluginOptions {
  queue: Queue;
  work?: boolean | { queues?: string[] | null; concurrency?: number; poll?: Duration };
  stopTimeout?: number;
}

/** The plugin of @xufa/http: app.queue, its workers started and stopped with the app. */
export declare function queuePlugin(app: any, options: QueuePluginOptions, done: (err?: Error) => void): void;
export { queuePlugin as plugin };

/** The delay before attempt attempts + 1. */
export declare function backoffDelay(backoff: Backoff, attempts: number): number;

/** The status of a run of a pipeline. */
export type RunStatus = 'running' | 'done' | 'failed' | 'cancelled';

/** The status of a step of a run. */
export type StepStatus =
  'waiting' | 'queued' | 'running' | 'retrying' | 'paused' | 'done' | 'skipped' | 'failed' | 'cancelled';

/** What a block gives (ctx.wait()) to stay paused until resume(). */
export declare const WAIT: unique symbol;

/** What the run of a block gets, besides its input. */
export interface StepContext {
  /** The config of the step. */
  config: Record<string, any>;
  /** The id of the step. */
  step: string;
  run: { id: unknown; pipeline: string; input: unknown };
  /** The outputs of the steps done, by id. */
  outputs: Record<string, unknown>;
  job: Job;
  /** Aborted at the timeout of the block (and when its pool takes the node back). */
  signal: AbortSignal;
  /** The node of its pool, with a pool. */
  node?: any;
  attempt: number;
  /** Paused until resume(); timeout and onTimeout over those of the step. */
  wait(options?: { timeout?: Duration; onTimeout?: OnTimeout }): typeof WAIT;
}

/** A kind of step: run, validate(config) (an error message, or nothing), and the options of its jobs. */
export interface BlockSpec extends DefineOptions {
  run(input: any, ctx: StepContext): unknown;
  validate?(config: Record<string, any>): string | undefined | void;
}

/** What a paused step does at its waitTimeout: its run fails, its branch is skipped, or it goes on with an output. */
export type OnTimeout = 'fail' | 'skip' | { output: unknown };

/** A step of a pipeline. */
export interface PipelineStep {
  id: string | number;
  /** A block registered (or run, in code). */
  block?: string;
  run?: (input: any, ctx: StepContext) => unknown;
  config?: Record<string, any>;
  /** The steps it runs after (their outputs are its input); parent is the same with one. */
  after?: string | number | (string | number)[];
  parent?: string | number;
  /** An expression of @xufa/expression over input, outputs, run and config (or a function, in code). */
  when?:
    | string
    | ((input: any, scope: { input: any; outputs: Record<string, unknown>; run: unknown; config: unknown }) => unknown);
  /** Its output is (part of) the result of the run. */
  result?: boolean;
  attempts?: number;
  priority?: number;
  queue?: string;
  /** How long it can be paused (a 'wait' block, or ctx.wait()); then onTimeout ('fail' by default). */
  waitTimeout?: Duration;
  onTimeout?: OnTimeout;
  /** The options of the jobs of a step with run. */
  options?: DefineOptions;
}

/** A pipeline: data (stored, edited, shown), or code with functions. */
export interface PipelineDefinition {
  name: string;
  /** pipelines.trigger(event) starts it. */
  trigger?: string;
  /** The steps of a run queued or running at once, at most (paused ones do not count). */
  concurrency?: number;
  description?: string;
  steps: PipelineStep[];
}

/** A run of a pipeline: an object of its model (table xufa_pipeline_runs). */
/** The options of a run: its key and trigger, and those of the jobs of its steps. */
export type StartOptions = {
  key?: string;
  trigger?: string;
  priority?: number;
  queue?: string;
} & ({ delay?: number | string; at?: never } | { at?: Date | string | number; delay?: never });

export interface PipelineRun<Result = unknown> extends Model {
  pipeline: string;
  status: RunStatus;
  input: unknown;
  result: Result | null;
  error: string | null;
  /** The definition it runs (kept: changing the pipeline does not change it). */
  definition: { name: string; trigger?: string; steps: unknown[] };
  trigger: string | null;
  key: string | null;
  /** Its steps queued or running (with concurrency). */
  inFlight: number;
  /** The priority and queue of the jobs of its steps (those of a step win). */
  priority: number;
  queue: string | null;
  /** When its first steps run (start() with delay or at), or null. */
  runAt: Date | null;
  /** A run of a step of another run (the block 'pipeline'): that run, that step, and how deep it is (0: none). */
  parent: string | null;
  parentStep: string | null;
  depth: number;
  createdAt: Date;
  finishedAt: Date | null;
}

/** A step of a run (table xufa_pipeline_steps). */
export interface PipelineStepRow extends Model {
  run: string;
  step: string;
  block: string;
  status: StepStatus;
  output: unknown;
  error: string | null;
  attempts: number;
  /** A paused step with waitTimeout: when it stops waiting. */
  pausedUntil: Date | null;
  /** The run a step of the block 'pipeline' waits for. */
  child: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface PipelinesOptions {
  /** The prefix of its tables ('xufa_pipeline': _runs and _steps). */
  table?: string;
  runModel?: string;
  stepModel?: string;
  /** Other Pipelines on the same database: their models (runs shared). */
  models?: Pipelines;
  /** How deep pipelines started by steps (the block 'pipeline') can go (10): a cycle stops there. */
  maxDepth?: number;
}

/** Pipelines of steps run as jobs of a queue, each run and step kept in the database. */
export declare class Pipelines extends EventEmitter {
  constructor(queue: Queue, options?: PipelinesOptions);
  readonly queue: Queue;
  readonly Run: ModelClass<PipelineRun>;
  readonly Step: ModelClass<PipelineStepRow>;
  /** Creates the tables of the runs and steps (db.sync() makes them too). */
  sync(): Promise<void>;
  /**
   * A kind of step. Built in: 'transform' (config.map or config.value: expressions), 'wait', and 'pipeline' (runs the
   * pipeline config.pipeline with its input, or config.input, an expression, and goes on with its result).
   */
  block(type: string, spec: BlockSpec | ((input: any, ctx: StepContext) => unknown)): this;
  /** Every error of a definition (an empty list when it is valid). */
  check(definition: PipelineDefinition): string[];
  /** Defines a pipeline (a PipelineError with every error when it is not valid). */
  define(definition: PipelineDefinition): this;
  /**
   * A task: a block and a pipeline of one step that runs it, by one name (its runs kept, retried and shown as those of
   * any pipeline). Options: those of the block, and the trigger and description of the pipeline.
   */
  task(
    name: string,
    run: (input: any, ctx: StepContext) => unknown,
    options?: Omit<BlockSpec, 'run'> & { trigger?: string; description?: string }
  ): this;
  /**
   * A pipeline started on a schedule of a Scheduler of @xufa/scheduler: a job of the scheduler (every, cron, timezone,
   * at, in, catchUp, lock...) whose run starts a run (trigger 'schedule:<name>', key 'schedule:<name>:<time due>':
   * a time already started is not started again). The info of the job.
   */
  schedule(
    scheduler: { add(job: any): any },
    pipeline: string,
    spec: {
      /** The name of the job (the pipeline's). */
      name?: string;
      every?: number | string;
      cron?: string;
      timezone?: string;
      at?: Date | string | number;
      in?: number | string;
      /** A value, or the input of each time. */
      input?: unknown | ((time: { scheduledAt: Date; name: string }) => unknown);
      priority?: number;
      queue?: string;
      [option: string]: unknown;
    }
  ): any;
  /** The schedules that start runs (schedule()), by the name of their job. */
  readonly schedules: Map<string, { name: string; pipeline: string; trigger: string; scheduler: unknown }>;
  /**
   * Starts a run (its steps without after are queued). key: a run with it running is given instead. priority and
   * queue: those of the jobs of its steps (a step keeps its own); delay or at: when its first steps run.
   */
  start<Result = unknown>(
    pipeline: string | PipelineDefinition,
    input?: unknown,
    options?: StartOptions
  ): Promise<PipelineRun<Result>>;
  /** Starts a run of every pipeline with that trigger. */
  trigger(event: string, input?: unknown, options?: { key?: string }): Promise<PipelineRun[]>;
  /** A run with its steps by id. */
  get<Result = unknown>(
    runId: unknown
  ): Promise<{ run: PipelineRun<Result>; steps: Record<string, PipelineStepRow> } | null>;
  /** The runs, as a queryset. */
  readonly runs: QuerySet<PipelineRun>;
  /** Ends a paused step with its output, and moves the run on. */
  resume(
    runId: unknown,
    stepId: string,
    output?: unknown
  ): Promise<{ run: PipelineRun; steps: Record<string, PipelineStepRow> }>;
  /** Cancels a running run: false when it was not running. */
  cancel(runId: unknown): Promise<boolean>;
  /** A failed or cancelled run goes on from where it stopped: false when it was not. */
  retry(runId: unknown): Promise<boolean>;
  /** Moves on the runs whose process stopped between two steps: their number. */
  recover(): Promise<number>;
  on(event: 'started' | 'completed', listener: (run: PipelineRun) => void): this;
  on(event: 'failed', listener: (run: PipelineRun, error: unknown, step: string) => void): this;
  on(event: 'step', listener: (run: PipelineRun, step: string, status: StepStatus) => void): this;
  on(event: 'error', listener: (error: unknown) => void): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;
}

/** A pipeline that is not valid (errors: every one), or a run or step that is not there. */
export declare class PipelineError extends Error {
  code: 'XUFA_PIPELINE_ERR';
  errors?: string[];
}

declare module '@xufa/http' {
  interface XufaInstance {
    queue: Queue;
  }
}
