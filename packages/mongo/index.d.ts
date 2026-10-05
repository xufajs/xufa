// The declarations of @xufa/mongo (the API of the official driver for what applications use).

/// <reference types="node" />

import { ConnectionOptions } from 'node:tls';

export type Document = Record<string, any>;
export type Filter<T = Document> = Partial<Record<keyof T | string, any>> & Document;
export type ReadPreference = 'primary' | 'primaryPreferred' | 'secondary' | 'secondaryPreferred' | 'nearest';

export interface WriteConcern {
  w?: number | 'majority';
  j?: boolean;
  wtimeout?: number;
}

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
  // 'zstd', 'zlib' or both ('zstd,zlib'): compression of the messages, agreed with the server.
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

export interface SessionOption {
  session?: ClientSession;
}

export interface ReadOptions extends SessionOption {
  readPreference?: ReadPreference;
}

export interface WriteOptions extends SessionOption {
  writeConcern?: WriteConcern;
}

export interface FindOptions<T = Document> extends ReadOptions {
  sort?: Record<string, 1 | -1>;
  skip?: number;
  limit?: number;
  projection?: Record<string, 0 | 1 | boolean>;
  batchSize?: number;
  hint?: string | Document;
  collation?: Document;
  // false: the next batch is not asked for before the one before is read.
  prefetch?: boolean;
  readonly __type?: T;
}

export interface AggregateOptions extends ReadOptions {
  batchSize?: number;
  allowDiskUse?: boolean;
  hint?: string | Document;
  collation?: Document;
  prefetch?: boolean;
}

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

export interface InsertOneResult {
  acknowledged: boolean;
  insertedId: any;
}

export interface InsertManyResult {
  acknowledged: boolean;
  insertedCount: number;
  insertedIds: any[];
}

export interface UpdateResult {
  acknowledged: boolean;
  matchedCount: number;
  modifiedCount: number;
  upsertedId: any;
}

export interface DeleteResult {
  acknowledged: boolean;
  deletedCount: number;
}

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

export declare class ClientSession {
  readonly inTransaction: boolean;
  startTransaction(): void;
  commitTransaction(): Promise<void>;
  abortTransaction(): Promise<void>;
  withTransaction<R>(fn: (session: ClientSession) => Promise<R>): Promise<R>;
  endSession(): Promise<void>;
}

export declare class MongoClient {
  constructor(url?: string, options?: MongoClientOptions);
  readonly supportsTransactions: boolean;
  connect(): Promise<this>;
  db(name?: string): Db;
  startSession(): ClientSession;
  close(): Promise<void>;
}

export declare function parseUrl(url: string): {
  srv: boolean;
  username?: string;
  password?: string;
  hosts: Array<{ host: string; port: number }>;
  database?: string;
  options: Record<string, string>;
};

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

export declare class Binary {
  constructor(buffer: Uint8Array, subType?: number);
  buffer: Buffer;
  subType: number;
}

export declare class Timestamp {
  constructor(low: number, high: number);
  low: number;
  high: number;
}

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

export declare class MinKey {}
export declare class MaxKey {}

export declare class Int32 {
  constructor(value: number);
  value: number;
}

export declare class Double {
  constructor(value: number);
  value: number;
}

export declare function serialize(doc: Document, reserve?: number): Buffer;
export declare function deserialize(buffer: Buffer, offset?: number): Document;

export declare class MongoError extends Error {}
export declare class MongoNetworkError extends MongoError {}
export declare class MongoServerError extends MongoError {
  code?: number;
  codeName?: string;
  errorLabels: string[];
  reply: Document;
  writeErrors?: Document[];
  hasErrorLabel(label: string): boolean;
}
