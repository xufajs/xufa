// The declarations of @xufa/pg (the API of pg for what applications use).

/// <reference types="node" />

import { EventEmitter } from 'node:events';
import { ConnectionOptions } from 'node:tls';

export interface ClientConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl?: boolean | ConnectionOptions;
  application_name?: string;
  options?: string;
  connectTimeoutMillis?: number;
  // Parsers by type oid, of the text of the values (those types are read as text).
  types?: Map<number, (value: string) => unknown> | Record<number, (value: string) => unknown>;
  // false: statements are not prepared.
  prepare?: boolean;
  // false: only the text format (no binary parameters and results).
  binary?: boolean;
  // Milliseconds after which queries are cancelled.
  query_timeout?: number;
}

export interface PoolConfig extends ClientConfig {
  max?: number;
  idleTimeoutMillis?: number;
}

export interface FieldDef {
  name: string;
  tableID: number;
  columnID: number;
  dataTypeID: number;
  dataTypeSize: number;
  dataTypeModifier: number;
  format: 'text' | 'binary';
}

export interface QueryResult<R = any> {
  command: string;
  rowCount: number | null;
  rows: R[];
  fields: FieldDef[];
  rowAsArray: boolean;
}

export interface QueryConfig<V extends unknown[] = unknown[]> {
  text: string;
  values?: V;
  rowMode?: 'array';
  prepare?: boolean;
  // Cancels the query (it rejects with an AbortError, and the server stops it).
  signal?: AbortSignal;
  // Milliseconds after which the query is cancelled (it rejects with the code QUERY_TIMEOUT).
  timeout?: number;
}

export interface Notification {
  processId: number;
  channel: string;
  payload: string;
}

export type CopyData = string | Buffer | Iterable<string | Buffer> | AsyncIterable<string | Buffer>;

interface Queryable {
  query<R = any>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
  query<R = any>(config: QueryConfig): Promise<QueryResult<R>>;
  // COPY ... FROM STDIN with data in the format of the COPY.
  copyFrom(text: string, data: CopyData): Promise<QueryResult<never>>;
  // COPY ... TO STDOUT: the chunks of data.
  copyTo(text: string): AsyncIterable<Buffer>;
  // Loads rows (arrays, or objects by column) into a table with COPY (binary when it can): the number of rows.
  copyRows(
    table: string | string[],
    columns: string[],
    rows: Iterable<unknown[] | Record<string, unknown>>
  ): Promise<number>;
}

export declare class Client extends EventEmitter implements Queryable {
  constructor(config?: string | ClientConfig);
  readonly processID: number | null;
  connect(): Promise<this>;
  end(): Promise<void>;
  // After changes of the schema: the statements prepared are prepared again.
  forgetStatements(): void;
  query<R = any>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
  query<R = any>(config: QueryConfig): Promise<QueryResult<R>>;
  copyFrom(text: string, data: CopyData): Promise<QueryResult<never>>;
  copyTo(text: string): AsyncIterable<Buffer>;
  copyRows(
    table: string | string[],
    columns: string[],
    rows: Iterable<unknown[] | Record<string, unknown>>
  ): Promise<number>;
  on(event: 'notification', listener: (message: Notification) => void): this;
  on(event: 'notice', listener: (notice: DatabaseError) => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  on(event: 'end', listener: () => void): this;
}

export declare class PoolClient extends EventEmitter implements Queryable {
  readonly processID: number | null;
  query<R = any>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
  query<R = any>(config: QueryConfig): Promise<QueryResult<R>>;
  copyFrom(text: string, data: CopyData): Promise<QueryResult<never>>;
  copyTo(text: string): AsyncIterable<Buffer>;
  copyRows(
    table: string | string[],
    columns: string[],
    rows: Iterable<unknown[] | Record<string, unknown>>
  ): Promise<number>;
  // Gives the connection back to the pool; with an error (or true), it is closed instead.
  release(err?: Error | boolean): void;
}

export declare class Pool extends EventEmitter implements Queryable {
  constructor(config?: string | PoolConfig);
  readonly totalCount: number;
  readonly idleCount: number;
  readonly waitingCount: number;
  // After changes of the schema: the statements every connection prepared are prepared again.
  forgetStatements(): void;
  query<R = any>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
  query<R = any>(config: QueryConfig): Promise<QueryResult<R>>;
  connect(): Promise<PoolClient>;
  copyFrom(text: string, data: CopyData): Promise<QueryResult<never>>;
  copyTo(text: string): AsyncIterable<Buffer>;
  copyRows(
    table: string | string[],
    columns: string[],
    rows: Iterable<unknown[] | Record<string, unknown>>
  ): Promise<number>;
  end(): Promise<void>;
  on(event: 'error', listener: (err: Error, client: unknown) => void): this;
  on(event: 'connect' | 'notice', listener: (value: unknown) => void): this;
}

export declare class PgError extends Error {}

export declare class ConnectionError extends PgError {}

export declare class DatabaseError extends PgError {
  severity?: string;
  code?: string;
  detail?: string;
  hint?: string;
  position?: string;
  internalPosition?: string;
  internalQuery?: string;
  where?: string;
  schema?: string;
  table?: string;
  column?: string;
  dataType?: string;
  constraint?: string;
  file?: string;
  line?: string;
  routine?: string;
}

export declare function parseConfig(config?: string | ClientConfig): ClientConfig;

export declare const types: {
  parserOf(
    oid: number,
    custom?: Map<number, (value: string) => unknown>
  ): (buffer: Buffer, start: number, end: number) => unknown;
  paramToText(value: unknown): string | Buffer | null;
};

export declare const copy: {
  copyRows(
    connection: unknown,
    table: string | string[],
    columns: string[],
    rows: Iterable<unknown[] | Record<string, unknown>>
  ): Promise<number>;
  quoteIdentifier(name: string): string;
  textValue(value: unknown): string;
};
