// Type definitions for @xufa/netcache.
import { EventEmitter } from 'node:events';
import type { Discovery, DiscoveryOptions } from '@xufa/discovery';
import type { CacheFaults } from '@xufa/faults';

export interface NetCacheOptions {
  /** 16 bytes or more: connections are authenticated and every frame sealed. Required unless `insecure`. */
  secret?: string | Buffer;
  /** No secret: plain frames, any machine of the network can read and write the cache. */
  insecure?: boolean;
  /** Nodes of other services are not peers ('xufa'). */
  service?: string;
  /** Keys kept in each copy (10000), the least used dropped first. */
  max?: number;
  /** Milliseconds values live by default (0: until dropped). */
  ttl?: number;
  /** The TCP port of this node (0: any). */
  port?: number;
  /** The address it listens on ('0.0.0.0'). */
  host?: string;
  /** The address the others connect to, when not the one they see (NAT, containers). */
  advertise?: string;
  /** Writes kept for each peer until it acknowledges them (10000): a peer that misses more is emptied. */
  queue?: number;
  /** A node that starts gets the entries of its first peer (true). */
  sync?: boolean;
  /** Milliseconds start() waits for the nodes there to answer (300). */
  settle?: number;
  /** Milliseconds deletes and clears are remembered, so late older writes do not bring values back (60000). */
  tombstoneTtl?: number;
  /** The largest frame accepted, in bytes (16 MiB). */
  maxFrame?: number;
  /** The options of the discovery of the nodes, or a Discovery of the app (its meta gets `netcache`). */
  discovery?: DiscoveryOptions | Discovery;
}

export interface NetCacheStats {
  sent: number;
  applied: number;
  ignored: number;
  resent: number;
  resets: number;
  snapshots: number;
}

export interface NetCacheEvents {
  peer: [id: string, state: 'connected' | 'disconnected'];
  change: [change: { op: 'set' | 'del' | 'clear'; key: string; peer: string }];
  reset: [peer: string];
  synced: [peer: string];
  publish: [channel: string, data: unknown, peer: string];
  error: [error: Error];
}

/** A cache shared by the machines of a service: a copy in each, every write sent to all. */
export declare class NetCache extends EventEmitter<NetCacheEvents> {
  constructor(options?: NetCacheOptions);
  /** Its faults: get, set, delete and clear made to fail, wait or hang. */
  readonly faults: CacheFaults;
  readonly id: string;
  readonly started: boolean;
  readonly port: number;
  readonly size: number;
  /** The ids of the peers connected now. */
  readonly connected: string[];
  readonly stats: NetCacheStats;
  readonly discovery: Discovery;
  start(): Promise<this>;
  stop(): Promise<void>;
  /** A copy of the value, or undefined. */
  get<T = unknown>(key: string): Promise<T | undefined>;
  /** `ttl`: milliseconds (the default of the cache when not given). */
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  delete(keys: string | string[]): Promise<void>;
  /** The keys of a prefix ('' for all). */
  clear(prefix?: string): Promise<void>;
  /** A message to the nodes connected now ('publish' on them; not kept): how many it was sent to. */
  publish(channel: string, data: unknown): number;
}

export declare class NetCacheError extends Error {
  code: 'XUFA_NETCACHE_ERR_OPTIONS';
}
