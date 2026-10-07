import { EventEmitter } from 'node:events';
import type { Worker } from 'node:cluster';

/** Milliseconds, or a text: '500ms', '30s', '5m', '1h', '1m30s'. */
export type Duration = number | string;

/** The messages between the processes of a cluster (in one process, to the handlers of that process). */
export declare class Bus {
  /** Whether messages go to other processes (a primary with workers, or a worker). */
  readonly clustered: boolean;
  readonly isPrimary: boolean;
  /** The ids of the workers (in the primary). */
  readonly workers: number[];
  /** Faults of @xufa/faults: messages lost, late or held, for tests of resilience. */
  readonly faults: any;
  /** handler(data, sender): sender is the worker (in the primary) or null. Its result is the reply of requests. */
  on(event: string, handler: (data: any, sender: Worker | null) => unknown): this;
  off(event: string, handler: (data: any, sender: Worker | null) => unknown): this;
  /** An event to the primary (in a worker). */
  send(event: string, data?: unknown): void;
  /** An event to one worker (in the primary). */
  sendTo(workerId: number, event: string, data?: unknown): void;
  /** An event to every worker: from the primary, or from a worker (others: but itself). */
  broadcast(event: string, data?: unknown, options?: { except?: number; others?: boolean }): void;
  /** A request to the primary: the reply of its handler (timeout: 30 s, 0 for none). */
  request<T = any>(event: string, data?: unknown, options?: { timeout?: number }): Promise<T>;
  /** Data written by @xufa/marshal: instances of registered classes arrive as themselves. */
  useMarshal(registry?: unknown): this;
}

export declare class BusError extends Error {
  code?: string;
}

/** What primary() and worker() get. */
export interface ClusterContext {
  bus: Bus;
  /** 0 in the primary (and in one process). */
  id: number;
  isPrimary: boolean;
  isWorker: boolean;
  /** A function run when the cluster stops (in reverse order of registration). */
  onShutdown(fn: () => unknown): void;
}

export interface StartOptions {
  /** os.availableParallelism() by default; 0 (or false) runs everything in one process. */
  workers?: number | false;
  primary?: (context: ClusterContext) => unknown;
  worker?: (context: ClusterContext) => unknown;
  /** Milliseconds a worker has to stop before it is killed (10000). */
  shutdownTimeout?: number;
  /** Workers that die are forked again (true). */
  restart?: boolean;
  onWorkerExit?: (info: { id: number; code: number | null; signal: string | null; delay: number }) => void;
  /** SIGINT and SIGTERM stop the cluster (true). */
  signals?: boolean;
  env?: Record<string, string | undefined>;
  exec?: string;
  /** true, or a Registry of @xufa/marshal. */
  marshal?: boolean | unknown;
}

export declare function start(options?: StartOptions): Promise<ClusterContext>;
export declare function stop(): Promise<void>;
/** The bus of this process (the same in every module). */
export declare const bus: Bus;
export declare const isPrimary: boolean;
export declare const isWorker: boolean;

/** A node of a pool: an object with an id (a Discovery's peer, or one of a list), sent to the work as it is. */
export interface PoolNode {
  id: string | number;
  [key: string]: any;
}

/** A source of nodes: its peers now, and the events 'up' and 'down' (a Discovery of @xufa/discovery). */
export interface PoolNodeSource {
  peers?: PoolNode[];
  on(event: 'up' | 'down', listener: (peer: PoolNode) => void): unknown;
  off(event: 'up' | 'down', listener: (peer: PoolNode) => void): unknown;
}

/** A check of xufa.health of @xufa/http (checks: { name: x.health() }): what its check gives, and whether it is critical. */
export interface PoolHealthCheck {
  check(): Promise<
    { status: 'up' | 'degraded' | 'down'; error?: string } & {
      nodes?: number;
      slots?: number;
      free?: number;
      running?: number;
      waiting?: number;
    }
  >;
  critical: boolean;
  timeout?: number | string;
}

export interface PoolHealthOptions {
  /** Down with fewer nodes (1). */
  minNodes?: number;
  /** Degraded with more tickets waiting. */
  maxWaiting?: number;
  /** false by default: the app serves without it. */
  critical?: boolean;
  timeout?: number | string;
}

export interface PoolStats {
  name: string;
  nodes: number;
  slots: number;
  free: number;
  /** Leases given (works running). */
  running: number;
  /** Tickets waiting for a node. */
  waiting: number;
  byNode: { id: string | number; slots: number; running: number; failures: number }[];
}

/** Scales the nodes by the demand (waiting plus running): up at once, down only after downAfter. */
export interface PoolAutoscale {
  /** Called with the nodes wanted: ceil((waiting + running) / perNode), between min and max. */
  scale(count: number, stats: PoolStats): unknown;
  /** Works a node takes (1). */
  perNode?: number;
  min?: number;
  max?: number;
  /** The least time between scale ups ('10s'). */
  upEvery?: Duration;
  /** How long the demand is lower before scaling down ('10m'). */
  downAfter?: Duration;
  /** The nodes there are when it starts (the nodes of the pool). */
  initial?: number;
}

export interface PoolOptions {
  /** Ids or nodes, or a source of peers (a Discovery). */
  nodes?: (string | number | PoolNode)[] | PoolNodeSource;
  /** Works a node takes at once (1), or a function of the node. */
  slots?: number | ((node: PoolNode) => number);
  /** A lease longer is taken back: its work's signal aborted (none by default). */
  leaseTimeout?: Duration;
  /** A ticket that waits longer is rejected (XUFA_POOL_WAIT_TIMEOUT; none by default). */
  waitTimeout?: Duration;
  /** Tickets waiting at most: more are rejected (XUFA_POOL_FULL). */
  maxWaiting?: number;
  autoscale?: PoolAutoscale;
  /** A store of slots shared with the pools of other machines (ormSlots(db)). */
  shared?: SlotStore;
  /**
   * Tells the pools of other machines when a slot comes back, so their tickets waiting are served at once: a NetCache
   * of @xufa/netcache, a Discovery of @xufa/discovery, or { publish, subscribe }. Needs shared.
   */
  notify?:
    | PoolNotifier
    | {
        publish(channel: string, data: unknown): unknown;
        on(event: 'publish', listener: (...args: any[]) => void): unknown;
        off(event: string, listener: (...args: any[]) => void): unknown;
      }
    | {
        send(event: string, data: unknown): unknown;
        on(event: 'message', listener: (...args: any[]) => void): unknown;
        off(event: string, listener: (...args: any[]) => void): unknown;
      };
  /** How often to look again when every free slot is taken by other machines ('500ms'). */
  pollEvery?: Duration;
  /** How long a node that answered busy is left aside, when it does not say (Retry-After): '1s'. */
  busyFor?: Duration;
  /** Which errors are busy answers (an HTTP 429 by default), for the pool's own use(). */
  busy?: (err: unknown) => boolean;
  /** A bus other than this process's one. */
  bus?: Bus;
}

/** A node given: release() it when done; its signal is aborted when the pool takes it back. */
export declare class Lease<N extends PoolNode = PoolNode> {
  readonly node: N;
  readonly signal: AbortSignal;
  /** failed: the work failed on the node (counted in its stats). */
  /** failed: true, or the error of the work (a busy answer leaves the node aside instead). */
  release(failed?: boolean | unknown): void;
}

export interface AcquireOptions {
  /** Higher first (0). */
  priority?: number;
  /** Ids of nodes to avoid while there are others. */
  exclude?: (string | number)[];
  /** Stops waiting. */
  signal?: AbortSignal;
}

export interface UseOptions extends AcquireOptions {
  /** Tries again on other nodes (0). */
  retries?: number;
  /** Which errors are tried again (all). */
  retryOn?: (err: unknown, attempt: number) => boolean;
  /** Retries avoid the nodes where the work failed (true). */
  avoidFailed?: boolean;
  /** Busy answers tried again on other nodes (not attempts) before giving up (20). */
  maxBusy?: number;
}

/** The pool of the primary, from any process. */
export declare class PoolClient<N extends PoolNode = PoolNode> {
  constructor(name: string, options: { bus: Bus; busy?: (err: unknown) => boolean });
  readonly name: string;
  /** Waits for a free node. */
  acquire(options?: AcquireOptions): Promise<Lease<N>>;
  /** Runs fn on a free node, and gives the slot back when it ends. */
  use<T>(
    fn: (node: N, context: { signal: AbortSignal; attempt: number }) => T | Promise<T>,
    options?: UseOptions
  ): Promise<T>;
  stats(): Promise<PoolStats>;
  /** A check of xufa.health, with the stats of the primary. */
  health(options?: PoolHealthOptions): PoolHealthCheck;
}

/** A pool of nodes, in the primary: its nodes, their slots, the tickets waiting and the leases given. */
export declare class Pool<N extends PoolNode = PoolNode> extends EventEmitter {
  constructor(name: string, options: PoolOptions & { bus: Bus });
  readonly name: string;
  /** Adds a node (or updates the one with its id). */
  add(node: string | number | N): this;
  /** Takes a node away: its leases are taken back. */
  remove(id: string | number): this;
  stats(): PoolStats;
  /** A check of xufa.health: down without nodes (minNodes), degraded with too many waiting (maxWaiting). */
  health(options?: PoolHealthOptions): PoolHealthCheck;
  acquire(options?: AcquireOptions): Promise<Lease<N>>;
  use<T>(
    fn: (node: N, context: { signal: AbortSignal; attempt: number }) => T | Promise<T>,
    options?: UseOptions
  ): Promise<T>;
  /** Rejects the tickets, takes the leases back and stops watching the nodes. */
  close(): void;
  on(event: 'demand', listener: (stats: PoolStats) => void): this;
  on(event: 'scale', listener: (info: PoolStats & { from: number; to: number }) => void): this;
  on(event: 'up' | 'down', listener: (node: N) => void): this;
  on(event: 'revoke', listener: (info: { node: string | number; worker: number; reason: PoolError }) => void): this;
  on(event: 'busy', listener: (info: { node: N; for: number }) => void): this;
  on(event: 'error', listener: (err: unknown) => void): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;
}

/** In the primary (or the only process): a pool of nodes. */
export declare function createPool<N extends PoolNode = PoolNode>(name: string, options?: PoolOptions): Pool<N>;
/** From a worker (or any process): the pool of the primary. */
export declare function usePool<N extends PoolNode = PoolNode>(
  name: string,
  options?: { bus?: Bus; busy?: (err: unknown) => boolean }
): PoolClient<N>;

/** What tells the other machines that a slot came back. */
export interface PoolNotifier {
  publish(data: { pool: string; node: string | number }): unknown;
  /** Its result: what unsubscribes. */
  subscribe(handler: (data: { pool: string; node: string | number }) => void): (() => void) | void;
}

/** Where the slots of nodes shared by several machines are kept. */
export interface SlotStore {
  /** A token of a free slot of the node, or null when every one is taken. */
  claim(pool: string, node: string | number, slots: number): Promise<string | null>;
  release(token: string): Promise<unknown>;
  /** Extends the slots held (every ttl / 3). */
  renew?(tokens: string[]): Promise<unknown>;
  /** Milliseconds a slot is held without renewal. */
  ttl?: number;
}

/**
 * The slots in a database of @xufa/orm (any backend): a row by slot of a node, taken with an update only one machine
 * can make. Those of a machine that died are free again after ttl ('30s').
 */
export declare function ormSlots(
  db: unknown,
  options?: { ttl?: Duration; table?: string; model?: string | unknown; owner?: string }
): SlotStore & {
  ttl: number;
  owner: string;
  model: unknown;
  /** The slots held now, by node of a pool. */
  held(pool: string): Promise<Record<string, number>>;
};

export type PoolErrorCode =
  | 'XUFA_POOL_FULL'
  | 'XUFA_POOL_BUSY'
  | 'XUFA_POOL_WAIT_TIMEOUT'
  | 'XUFA_POOL_LEASE_TIMEOUT'
  | 'XUFA_POOL_NODE_DOWN'
  | 'XUFA_POOL_WORKER_EXIT'
  | 'XUFA_POOL_CANCELLED'
  | 'XUFA_POOL_CLOSED'
  | 'XUFA_POOL_UNKNOWN'
  | 'XUFA_POOL_ERR';

export declare class PoolError extends Error {
  code: PoolErrorCode;
  statusCode: number;
}
