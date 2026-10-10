// The declarations of @xufa/pg (the API of pg for what applications use).

/// <reference types="node" />

import { EventEmitter } from 'node:events';
import { ConnectionOptions } from 'node:tls';

/**
 * The options of a connection (or a connection string, postgres://user:password@host:port/database?sslmode=...): the
 * server or servers, the credentials and TLS, timeouts, and how values are read.
 */
export interface ClientConfig {
  connectionString?: string;
  /**
   * A host, or the directory of a unix socket (/var/run/postgresql); several hosts ('a,b' or an array) are tried in
   * order (libpq's failover), with a port for each or one for all.
   */
  host?: string | string[];
  port?: number | string | number[];
  /** The kind of server to connect to among the hosts. */
  target_session_attrs?: 'any' | 'read-write' | 'read-only' | 'primary' | 'standby' | 'prefer-standby';
  /** random: the hosts in a random order (to spread connections). */
  load_balance_hosts?: 'disable' | 'random';
  /** The authentication methods the server may ask for (libpq's: 'scram-sha-256', '!password,!md5', 'none'...). */
  require_auth?: string;
  /** SCRAM bound to the TLS channel (SCRAM-SHA-256-PLUS): prefer (the default), require or disable. */
  channel_binding?: 'disable' | 'prefer' | 'require';
  /** An OAuth token for OAUTHBEARER (PostgreSQL 18), or a function that gives it. */
  oauthBearerToken?: string | (() => string | Promise<string>);
  /** The user and the password, or functions that give them (asked for every connection: tokens of AWS RDS IAM...). */
  user?: string | (() => string | Promise<string>);
  password?: string | (() => string | Promise<string>);
  database?: string;
  ssl?: boolean | ConnectionOptions;
  application_name?: string;
  options?: string;
  /** Milliseconds to connect and log in (30000; 0: no limit). connectTimeoutMillis is the old name. */
  connectionTimeoutMillis?: number;
  connectTimeoutMillis?: number;
  /** Settings of the session, in milliseconds. */
  statement_timeout?: number;
  lock_timeout?: number;
  idle_in_transaction_session_timeout?: number;
  /** Parsers by type oid, of the text of the values (those types are read as text). */
  types?: Map<number, (value: string) => unknown> | Record<number, (value: string) => unknown>;
  /** 'text': date columns as their text ('2026-10-09'), not Dates at local midnight (what @xufa/orm asks for). */
  dates?: 'text';
  /** false: statements are not prepared. */
  prepare?: boolean;
  /** false: only the text format (no binary parameters and results). */
  binary?: boolean;
  /** Milliseconds after which queries are cancelled. */
  query_timeout?: number;
}

/**
 * The options of a pool: those of each connection, and max (connections, 10), idleTimeoutMillis and
 * acquireTimeoutMillis.
 */
export interface PoolConfig extends ClientConfig {
  max?: number;
  /**
   * How many reads a connection takes before another is opened (8; 1: a connection for each query at once, up to max).
   * Reads (SELECT, WITH, VALUES, TABLE, SHOW) are pipelined on the connections open, never behind a write; writes take
   * a connection of their own, as their commits wait for the disk.
   */
  pipeline?: number;
  idleTimeoutMillis?: number;
  /**
   * How long a query or connect() waits for a connection, free or being opened (0: no limit); past it, an error of
   * code ACQUIRE_TIMEOUT.
   */
  acquireTimeoutMillis?: number;
}

/** A column of a result: its name, the table and column it comes from, and its type. */
export interface FieldDef {
  name: string;
  tableID: number;
  columnID: number;
  dataTypeID: number;
  dataTypeSize: number;
  dataTypeModifier: number;
  format: 'text' | 'binary';
}

/**
 * The result of a query: its rows (objects by column, or arrays with rowMode: 'array'), the command, the number of rows
 * and the columns.
 */
export interface QueryResult<R = any> {
  command: string;
  rowCount: number | null;
  rows: R[];
  fields: FieldDef[];
  rowAsArray: boolean;
}

/**
 * A query with its options: the text, its values ($1, $2...), arrays as rows, prepared or not, a signal or a timeout to
 * cancel it, and a name for tracing.
 */
export interface QueryConfig<V extends unknown[] = unknown[]> {
  text: string;
  values?: V;
  rowMode?: 'array';
  prepare?: boolean;
  /** Cancels the query (it rejects with an AbortError, and the server stops it). */
  signal?: AbortSignal;
  /** Milliseconds after which the query is cancelled (it rejects with the code QUERY_TIMEOUT). */
  timeout?: number;
  /** A name for tracing (pg:query). */
  name?: string;
}

/** query({ text, describe: true }): the types (oids) of the parameters and the columns, without running the text. */
export interface DescribeResult {
  params: number[];
  fields: FieldDef[];
}

/** A notification of LISTEN/NOTIFY: its channel and payload, and the process that sent it. */
export interface Notification {
  processId: number;
  channel: string;
  payload: string;
}

/** The data of a COPY ... FROM STDIN: text or bytes in the format of the COPY, at once or in chunks. */
export type CopyData = string | Buffer | Iterable<string | Buffer> | AsyncIterable<string | Buffer>;

/** What clients, pool clients and pools share: query(), and the COPY methods. */
interface Queryable {
  query<R = any>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
  query(config: QueryConfig & { describe: true }): Promise<DescribeResult>;
  query<R = any>(config: QueryConfig): Promise<QueryResult<R>>;
  /** COPY ... FROM STDIN with data in the format of the COPY. */
  copyFrom(text: string, data: CopyData): Promise<QueryResult<never>>;
  /** COPY ... TO STDOUT: the chunks of data. */
  copyTo(text: string): AsyncIterable<Buffer>;
  /** Loads rows (arrays, or objects by column) into a table with COPY (binary when it can): the number of rows. */
  copyRows(
    table: string | string[],
    columns: string[],
    rows: Iterable<unknown[] | Record<string, unknown>>
  ): Promise<number>;
}

/**
 * One connection to PostgreSQL, as pg's Client: connect(), query() (prepared statements, binary values), COPY,
 * LISTEN/NOTIFY and end().
 */
export declare class Client extends EventEmitter implements Queryable {
  constructor(config?: string | ClientConfig);
  readonly processID: number | null;
  connect(): Promise<this>;
  /** Ends the connection after the queries already sent (new ones are refused). */
  end(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
  escapeIdentifier(value: string): string;
  escapeLiteral(value: string): string;
  /** After changes of the schema: the statements prepared are prepared again. */
  forgetStatements(): void;
  query<R = any>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
  query(config: QueryConfig & { describe: true }): Promise<DescribeResult>;
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

/** A connection taken from a pool with connect(): release() gives it back. */
export declare class PoolClient extends EventEmitter implements Queryable {
  readonly processID: number | null;
  escapeIdentifier(value: string): string;
  escapeLiteral(value: string): string;
  query<R = any>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
  query(config: QueryConfig & { describe: true }): Promise<DescribeResult>;
  query<R = any>(config: QueryConfig): Promise<QueryResult<R>>;
  copyFrom(text: string, data: CopyData): Promise<QueryResult<never>>;
  copyTo(text: string): AsyncIterable<Buffer>;
  copyRows(
    table: string | string[],
    columns: string[],
    rows: Iterable<unknown[] | Record<string, unknown>>
  ): Promise<number>;
  /** Gives the connection back to the pool; with an error (or true), it is closed instead. */
  release(err?: Error | boolean): void;
  /** using client = await pool.connect(): released at the end of the block. */
  [Symbol.dispose](): void;
}

/**
 * A pool of connections, as pg's Pool: query() takes one for each query; connect() takes one for several (a
 * transaction).
 */
export declare class Pool extends EventEmitter implements Queryable {
  constructor(config?: string | PoolConfig);
  readonly totalCount: number;
  readonly idleCount: number;
  readonly waitingCount: number;
  /** After changes of the schema: the statements every connection prepared are prepared again. */
  forgetStatements(): void;
  query<R = any>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
  query(config: QueryConfig & { describe: true }): Promise<DescribeResult>;
  query<R = any>(config: QueryConfig): Promise<QueryResult<R>>;
  connect(): Promise<PoolClient>;
  copyFrom(text: string, data: CopyData): Promise<QueryResult<never>>;
  copyTo(text: string): AsyncIterable<Buffer>;
  copyRows(
    table: string | string[],
    columns: string[],
    rows: Iterable<unknown[] | Record<string, unknown>>
  ): Promise<number>;
  /** Opens the connections of the pool (replaceable, to open them in another way). */
  openConnection(options: ClientConfig): Promise<unknown>;
  /** Ends the pool after the queries sent and once the clients given by connect() are released. */
  end(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
  on(event: 'error', listener: (err: Error, client: unknown) => void): this;
  on(event: 'connect' | 'notice', listener: (value: unknown) => void): this;
}

/** The class of the errors of @xufa/pg. */
export declare class PgError extends Error {}

/** An error of the connection: it could not connect or log in, or it was lost. */
export declare class ConnectionError extends PgError {}

/**
 * An error the server answered, with its fields: code (the SQLSTATE: 23505 for a unique violation), detail, constraint,
 * table, column...
 */
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

/** "identifier" and 'literal' (E'...' with backslashes), as pg writes them; a null character is refused. */
export declare function escapeIdentifier(value: string): string;
/** A string as a literal of SQL ('it''s'; E'...' with backslashes), as pg writes it. */
export declare function escapeLiteral(value: string): string;

/** The options of a connection string (or of options with one), as the client reads them. */
export declare function parseConfig(config?: string | ClientConfig): ClientConfig;

/** How values are read and written: the parser of a type (by oid) and the text of a parameter. */
export declare const types: {
  parserOf(
    oid: number,
    custom?: Map<number, (value: string) => unknown>
  ): (buffer: Buffer, start: number, end: number) => unknown;
  paramToText(value: unknown): string | Buffer | null;
};

/** COPY of rows: copyRows() loads rows (binary when it can), with the helpers it uses. */
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
