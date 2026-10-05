// Type definitions for @xufa/websocket/hub.
import type { WebSocket } from './index';

/** The bus of @xufa/cluster (what the hub uses of it). */
interface BusLike {
  on(event: string, handler: (data: any, sender?: any) => unknown): unknown;
  send(event: string, data?: unknown): unknown;
  broadcast(event: string, data?: unknown, options?: { except?: number; others?: boolean }): unknown;
  readonly clustered: boolean;
  readonly isPrimary: boolean;
}

/** A NetCache of @xufa/netcache (what the hub uses of it). */
interface CacheLike {
  publish(channel: string, data: unknown): number;
  on(event: 'publish', listener: (channel: string, data: any, peer: string) => void): unknown;
  off(event: 'publish', listener: (channel: string, data: any, peer: string) => void): unknown;
}

export interface HubOptions {
  /** Hubs of one name share their messages (default). */
  name?: string;
  /** The bus of @xufa/cluster: the sockets of the other workers. */
  bus?: BusLike;
  /** A NetCache of @xufa/netcache: the sockets of other machines. */
  cache?: CacheLike;
  /** How values that are not strings or bytes are written (JSON.stringify). */
  serialize?: (value: unknown) => string | Buffer;
}

export interface SendOptions {
  /** Sent as a binary message (bytes are, by default). */
  binary?: boolean;
}

export declare class Target {
  /** Sockets (or their ids, for sockets of other processes) left out. */
  except(...sockets: Array<WebSocket | string | Array<WebSocket | string>>): this;
  send(data: unknown, options?: SendOptions): void;
}

export declare class Hub {
  constructor(options?: HubOptions);
  readonly name: string;
  /** Adds a socket (until it closes), in rooms: its id. */
  add(socket: WebSocket, options?: { rooms?: string[]; id?: string }): string;
  remove(socket: WebSocket): void;
  join(socket: WebSocket, ...rooms: Array<string | string[]>): void;
  leave(socket: WebSocket, ...rooms: Array<string | string[]>): void;
  roomsOf(socket: WebSocket): string[];
  idOf(socket: WebSocket): string | undefined;
  /** The ids of the sockets of this process in a room. */
  local(room: string): string[];
  /** The sockets of these rooms, in every process and machine. */
  to(...rooms: Array<string | string[]>): Target;
  /** To every socket. */
  send(data: unknown, options?: SendOptions): void;
  close(): void;
}
