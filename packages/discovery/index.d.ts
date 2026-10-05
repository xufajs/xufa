// Type definitions for @xufa/discovery.
import { EventEmitter } from 'node:events';

export type Transport = 'multicast' | 'broadcast' | 'unicast';
export type Meta = Record<string, unknown>;

export interface DiscoveryOptions {
  /** The name of the service: nodes of other services are not peers. 'xufa' by default. */
  service?: string;
  /** 'multicast' (default), 'broadcast' or 'unicast' (seeds). */
  transport?: Transport;
  /** The UDP port: shared by the nodes of a machine for multicast and broadcast. 29050 by default; 0 for any. */
  port?: number;
  /** The address to bind ('0.0.0.0'). */
  address?: string;
  /** The multicast group ('239.255.29.5'). */
  group?: string;
  /** The interface multicast is sent on (its IPv4 address); the default one when not given. */
  interface?: string;
  /** Hops multicast goes through (1: the local network; 0: this machine). */
  ttl?: number;
  /** The broadcast address ('255.255.255.255'). */
  broadcastAddress?: string;
  /** Addresses ('host:port' or [host, port]) the node announces itself to, besides the group or broadcast. */
  seeds?: Array<string | [string, number]>;
  /** Milliseconds between announcements (1000). */
  interval?: number;
  /** Milliseconds a peer is kept without being heard (3 intervals and a half by default). */
  timeout?: number;
  /** 16 bytes or more: packets are sealed (AES-256-GCM), and only the nodes that know it are peers. */
  secret?: string | Buffer;
  /** With a secret, packets older (or newer) than this many milliseconds are refused (30000). */
  maxSkew?: number;
  /** What this node tells the others: its URL, its role... (JSON, in one packet of 1400 bytes). */
  meta?: Meta;
  /** The id of this node (a random UUID by default). */
  id?: string;
}

export interface Peer<M extends Meta = Meta> {
  id: string;
  service: string;
  address: string;
  port: number;
  meta: M;
  /** When it was first heard (ms since the epoch). */
  since: number;
  /** When it was last heard. */
  lastSeen: number;
}

export interface DiscoveryStats {
  sent: number;
  received: number;
  dropped: number;
  sendErrors: number;
}

export interface DiscoveryEvents<M extends Meta = Meta> {
  up: [peer: Peer<M>];
  down: [peer: Peer<M>, reason: 'bye' | 'timeout'];
  update: [peer: Peer<M>, previous: M];
  message: [event: string, data: unknown, peer: Peer<M>];
  error: [error: Error];
}

export declare class Discovery<M extends Meta = Meta> extends EventEmitter<DiscoveryEvents<M>> {
  constructor(options?: DiscoveryOptions);
  readonly id: string;
  readonly service: string;
  readonly started: boolean;
  readonly meta: M;
  readonly stats: DiscoveryStats;
  /** The peers now (copies). */
  readonly peers: Peer<M>[];
  /** The port bound (the one given, or the one the system chose for 0). */
  readonly port: number;
  get(id: string): Peer<M> | undefined;
  start(): Promise<this>;
  /** Says goodbye to the others, and closes the socket. */
  stop(): Promise<void>;
  setMeta(meta: M): void;
  /** A message to every peer, or to one: datagrams can be lost. */
  send(event: string, data?: unknown, options?: { to?: string }): Promise<void>;
  /** The peers once the predicate holds; rejects after `timeout` ms (10000). */
  waitFor(predicate: (peers: Peer<M>[]) => boolean, options?: { timeout?: number }): Promise<Peer<M>[]>;
}

export declare class DiscoveryError extends Error {
  code:
    | 'XUFA_DISCOVERY_ERR_OPTIONS'
    | 'XUFA_DISCOVERY_ERR_SIZE'
    | 'XUFA_DISCOVERY_ERR_STOPPED'
    | 'XUFA_DISCOVERY_ERR_PEER'
    | 'XUFA_DISCOVERY_ERR_TIMEOUT';
}

export declare function createDiscovery<M extends Meta = Meta>(options?: DiscoveryOptions): Discovery<M>;

/** The largest packet sent (1400 bytes: one Ethernet frame). */
export declare const MAX_PACKET: number;
