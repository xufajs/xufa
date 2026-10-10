// The declarations of @xufa/mongo (the API of the official driver for what applications use).

/// <reference types="node" />

import { ConnectionOptions } from 'node:tls';

/** A document of MongoDB: an object of BSON values. */
export type Document = Record<string, any>;
/** The filter of a query: equalities by field and the operators of MongoDB ($gt, $in, $or...). */
export type Filter<T = Document> = Partial<Record<keyof T | string, any>> & Document;
/** Which members of a replica set the reads go to: the primary (the default) or its secondaries. */
export type ReadPreference = 'primary' | 'primaryPreferred' | 'secondary' | 'secondaryPreferred' | 'nearest';

/** How a write is acknowledged: by how many members (w), journaled (j), within wtimeout ms. */
export interface WriteConcern {
  w?: number | 'majority';
  j?: boolean;
  wtimeout?: number;
}

/**
 * Options of a MongoClient, over those of the URL (mongodb:// and mongodb+srv://): the pool, retries, the selection of
 * servers, timeouts, compression, TLS and authentication (SCRAM-SHA-256 or SCRAM-SHA-1).
 */
export interface MongoClientOptions {
  maxPoolSize?: number;
  readPreference?: ReadPreference;
  retryWrites?: boolean;
  retryReads?: boolean;
  replicaSet?: string;
  directConnection?: boolean;
  heartbeatFrequencyMS?: number;
  serverSelectionTimeoutMS?: number;
  localThresholdMS?: number;
  connectTimeoutMS?: number;
  /** 'zstd', 'zlib' or both ('zstd,zlib'): compression of the messages, agreed with the server. */
  compressors?: string | string[];
  zlibCompressionLevel?: number;
  tls?: boolean;
  tlsOptions?: ConnectionOptions;
  appName?: string;
  username?: string;
  password?: string;
  authSource?: string;
  authMechanism?: 'SCRAM-SHA-256' | 'SCRAM-SHA-1';
}

/** The session of an operation: it runs in its transaction when one is open. */
export interface SessionOption {
  session?: ClientSession;
}

/** Options of reads: the session and the read preference. */
export interface ReadOptions extends SessionOption {
  readPreference?: ReadPreference;
}

/** Options of writes: the session and the write concern. */
export interface WriteOptions extends SessionOption {
  writeConcern?: WriteConcern;
}

/** Options of find() and findOne(): sort, skip, limit, projection, batch size, hint and collation. */
export interface FindOptions<T = Document> extends ReadOptions {
  sort?: Record<string, 1 | -1>;
  skip?: number;
  limit?: number;
  projection?: Record<string, 0 | 1 | boolean>;
  batchSize?: number;
  hint?: string | Document;
  collation?: Document;
  /** false: the next batch is not asked for before the one before is read. */
  prefetch?: boolean;
  readonly __type?: T;
}

/** Options of aggregate(): the session, the read preference, and those of the command (allowDiskUse...). */
export interface AggregateOptions extends ReadOptions {
  batchSize?: number;
  allowDiskUse?: boolean;
  hint?: string | Document;
  collation?: Document;
  prefetch?: boolean;
}

/**
 * The documents of a find() or an aggregate(), read in batches: for await (const doc of cursor), or toArray(). Batches
 * are asked for ahead of the reading unless prefetch is false.
 */
export declare class Cursor<T = Document> implements AsyncIterable<T> {
  sort(sort: Record<string, 1 | -1>): this;
  skip(count: number): this;
  limit(count: number): this;
  project(projection: Record<string, 0 | 1 | boolean>): this;
  batchSize(size: number): this;
  next(): Promise<T | null>;
  toArray(): Promise<T[]>;
  close(): Promise<void>;
  [Symbol.asyncIterator](): AsyncIterator<T>;
}

/** The result of insertOne(): the _id of the document inserted. */
export interface InsertOneResult {
  acknowledged: boolean;
  insertedId: any;
}

/** The result of insertMany(): how many documents were inserted, and their _ids by position. */
export interface InsertManyResult {
  acknowledged: boolean;
  insertedCount: number;
  insertedIds: any[];
}

/** The result of an update or a replace: the documents matched and modified, and the _id of one upserted. */
export interface UpdateResult {
  acknowledged: boolean;
  matchedCount: number;
  modifiedCount: number;
  upsertedId: any;
}

/** The result of a delete: how many documents were deleted. */
export interface DeleteResult {
  acknowledged: boolean;
  deletedCount: number;
}

/**
 * A collection of a database: its reads (find, findOne, aggregate, countDocuments), writes (insert, update, replace,
 * delete) and indexes, as the official driver has them.
 */
export declare class Collection<T extends Document = Document> {
  readonly name: string;
  readonly db: Db;
  find(filter?: Filter<T>, options?: FindOptions<T>): Cursor<T>;
  findOne(filter?: Filter<T>, options?: FindOptions<T>): Promise<T | null>;
  aggregate<R = Document>(pipeline: Document[], options?: AggregateOptions): Cursor<R>;
  countDocuments(filter?: Filter<T>, options?: ReadOptions & { skip?: number; limit?: number }): Promise<number>;
  insertOne(doc: T, options?: WriteOptions): Promise<InsertOneResult>;
  insertMany(docs: T[], options?: WriteOptions & { ordered?: boolean }): Promise<InsertManyResult>;
  updateOne(
    filter: Filter<T>,
    update: Document,
    options?: WriteOptions & { upsert?: boolean; arrayFilters?: Document[] }
  ): Promise<UpdateResult>;
  updateMany(
    filter: Filter<T>,
    update: Document,
    options?: WriteOptions & { upsert?: boolean; arrayFilters?: Document[] }
  ): Promise<UpdateResult>;
  replaceOne(filter: Filter<T>, replacement: T, options?: WriteOptions & { upsert?: boolean }): Promise<UpdateResult>;
  deleteOne(filter: Filter<T>, options?: WriteOptions): Promise<DeleteResult>;
  deleteMany(filter: Filter<T>, options?: WriteOptions): Promise<DeleteResult>;
  createIndex(keys: Record<string, 1 | -1 | string>, options?: SessionOption & Document): Promise<string>;
  dropIndex(name: string, options?: SessionOption): Promise<void>;
  indexes(options?: ReadOptions): Promise<Document[]>;
  drop(options?: SessionOption): Promise<boolean>;
}

/** A database of the deployment: its collections, and commands. */
export declare class Db {
  readonly name: string;
  readonly client: MongoClient;
  collection<T extends Document = Document>(name: string): Collection<T>;
  command(command: Document, options?: ReadOptions): Promise<Document>;
  listCollections(
    filter?: Document,
    options?: { nameOnly?: boolean; readPreference?: ReadPreference }
  ): Promise<Document[]>;
  createCollection<T extends Document = Document>(name: string, options?: Document): Promise<Collection<T>>;
  dropDatabase(): Promise<void>;
}

/**
 * A session of the client (startSession()): transactions on replica sets and sharded clusters. withTransaction()
 * commits, or aborts when its function throws; as the official drivers, it runs the transaction again on a
 * TransientTransactionError and its commit again on an UnknownTransactionCommitResult, until `timeout` (120 s).
 */
export declare class ClientSession {
  readonly inTransaction: boolean;
  startTransaction(): void;
  commitTransaction(): Promise<void>;
  abortTransaction(): Promise<void>;
  /** fn may run more than once (a transient error runs the whole transaction again): it should only write in it. */
  withTransaction<R>(fn: (session: ClientSession) => Promise<R>, options?: { timeout?: number }): Promise<R>;
  /** Commits the last transaction again, with a majority write concern (its result was unknown). */
  retryCommit(): Promise<void>;
  endSession(): Promise<void>;
}

/**
 * A client of a MongoDB deployment (a server, a replica set or mongos), with a pool of connections to each server:
 * connect(), db(), startSession() and close().
 */
export declare class MongoClient {
  constructor(url?: string, options?: MongoClientOptions);
  readonly supportsTransactions: boolean;
  connect(): Promise<this>;
  db(name?: string): Db;
  startSession(): ClientSession;
  close(): Promise<void>;
}

/**
 * The parts of a connection string (mongodb:// or mongodb+srv://): the hosts, the credentials, the database and the
 * options.
 */
export declare function parseUrl(url: string): {
  srv: boolean;
  username?: string;
  password?: string;
  hosts: Array<{ host: string; port: number }>;
  database?: string;
  options: Record<string, string>;
};

/** A BSON ObjectId: 12 bytes, as 24 hex characters (toHexString()); new ObjectId() makes a unique one. */
export declare class ObjectId {
  constructor(value?: string | Uint8Array | ObjectId);
  static isValid(value: unknown): boolean;
  static generate(): Buffer;
  readonly buffer: Buffer;
  readonly id: Buffer;
  toHexString(): string;
  toString(): string;
  toJSON(): string;
  equals(other: ObjectId | string): boolean;
  getTimestamp(): Date;
}

/** BSON binary data, with its subtype. */
export declare class Binary {
  constructor(buffer: Uint8Array, subType?: number);
  buffer: Buffer;
  subType: number;
}

/** A BSON timestamp (of the oplog): seconds and an increment. */
export declare class Timestamp {
  constructor(low: number, high: number);
  low: number;
  high: number;
}

/** A BSON Decimal128: a decimal of 34 digits, kept exactly (fromString(), toString()). */
export declare class Decimal128 {
  constructor(bytes: Uint8Array);
  bytes: Buffer;
  /** The decimal of a text ('12.50', '1E+3', 'NaN'), exactly: more than 34 digits or an exponent out of range throws. */
  static fromString(text: string): Decimal128;
  /** (-1)^negative * coefficient * 10^exponent, with a coefficient of up to 34 digits. */
  static fromParts(negative: boolean, coefficient: bigint, exponent: number): Decimal128;
  /** Its sign, coefficient (a number under 2^53, a bigint above) and exponent, or what special value it is. */
  toParts(): { negative: boolean; coefficient: number | bigint; exponent: number; special: null | 'Infinity' | 'NaN' };
  /** The text of the standard: '12.50', '1E+3', '-0.0001'. */
  toString(): string;
  toJSON(): { $numberDecimal: string };
}

/** The BSON value lower than every other. */
export declare class MinKey {}
/** The BSON value greater than every other. */
export declare class MaxKey {}

/**
 * A number written as a BSON 32-bit integer (numbers are written as such when they are integers that fit, as doubles
 * otherwise).
 */
export declare class Int32 {
  constructor(value: number);
  value: number;
}

/** A number written as a BSON double, even when it is an integer. */
export declare class Double {
  constructor(value: number);
  value: number;
}

/** A document as BSON bytes. */
export declare function serialize(doc: Document, reserve?: number): Buffer;
/** The document of BSON bytes (from offset). */
export declare function deserialize(buffer: Buffer, offset?: number): Document;

/** The class of the errors of @xufa/mongo, with their labels (of the server, or of the driver for network errors). */
export declare class MongoError extends Error {
  errorLabels: string[];
  hasErrorLabel(label: string): boolean;
}
/** An error of the connection to a server (it could not connect, or the connection was lost). */
export declare class MongoNetworkError extends MongoError {}
/** An error the server answered, with its code and codeName (11000: a duplicate key). */
export declare class MongoServerError extends MongoError {
  code?: number;
  codeName?: string;
  reply: Document;
  writeErrors?: Document[];
}
