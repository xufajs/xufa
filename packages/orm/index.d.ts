// The declarations of @xufa/orm.
//
// TypeScript cannot read the properties of objects from `static fields`: give them to the model with an interface of
// the same name, and use Model.query() for QuerySets of the model:
//
//   const authorFields = { name: fields.string(), age: fields.integer({ null: true }) };
//   class Author extends Model { static fields = authorFields; }
//   interface Author extends Fields<typeof authorFields> {}
//   const authors: Author[] = await Author.query().filter({ age__gte: 18 });

/// <reference types="node" />

/**
 * A validation rule: an expression of @xufa/expression (on `value` for a field, on the fields of the object for a
 * model), a function, or either with its message. It gives true (valid), false (not valid) or a message.
 */
export type ValidationRule<S> = string | ((subject: S) => string | boolean | void);
export type RuleSpec<S> = ValidationRule<S> | { rule: ValidationRule<S>; message?: string };

export interface FieldOptions<T> {
  null?: boolean;
  default?: T | (() => T);
  unique?: boolean;
  index?: boolean;
  primaryKey?: boolean;
  choices?: readonly T[];
  column?: string;
  /** Rules of the value: functions, expressions on `value` ('value >= 0'), or { rule, message }. */
  validate?: RuleSpec<T> | Array<RuleSpec<T>>;
  /**
   * A computed field: an expression of @xufa/expression on the other fields of its object ('price * quantity'), or a
   * function of the object. Not stored by default: computed when it is read, and no query can use it.
   */
  computed?: string | ((object: any) => unknown);
  /** A computed field kept in a column: set on save and update, so queries can filter, order and aggregate by it. */
  stored?: boolean;
  /** The fields a computed function reads (an expression's are found by the ORM): updates of others skip it. */
  uses?: readonly string[];
}

export interface StringOptions extends FieldOptions<string> {
  maxLength?: number;
  minLength?: number;
}

export interface NumberOptions extends FieldOptions<number> {
  min?: number;
  max?: number;
}

// A GeoJSON geometry (its crs is its SRID: { type: 'name', properties: { name: 'EPSG:4326' } }).
export interface GeoJsonGeometry {
  type: 'Point' | 'LineString' | 'Polygon' | 'MultiPoint' | 'MultiLineString' | 'MultiPolygon' | 'GeometryCollection';
  coordinates?: unknown[];
  geometries?: GeoJsonGeometry[];
  crs?: { type: string; properties: { name: string } };
}

export interface GeometryOptions extends FieldOptions<GeoJsonGeometry> {
  // 'POINT', 'LINESTRING', 'POLYGON'... and the SRID of the column (PostgreSQL).
  shape?: string;
  srid?: number;
}

export interface DateTimeOptions extends FieldOptions<Date> {
  autoNow?: boolean;
  autoNowAdd?: boolean;
}

export interface DecimalOptions extends FieldOptions<string> {
  precision?: number;
  scale?: number;
}

export type OnDelete = 'cascade' | 'setNull' | 'protect' | 'doNothing';
export type DbOnDelete = 'cascade' | 'setNull' | 'restrict' | 'noAction';

export interface ForeignKeyOptions extends FieldOptions<unknown> {
  onDelete?: OnDelete;
  relatedName?: string;
  // The name of the key (`<name>Id` by default).
  attname?: string;
  // ON DELETE of the foreign key in SQL databases.
  dbOnDelete?: DbOnDelete;
  // ON UPDATE of the foreign key in SQL databases.
  dbOnUpdate?: DbOnDelete;
}

export interface EncryptedOptions<T> extends Omit<FieldOptions<T>, 'primaryKey'> {
  // The same value is the same text (for the same key): found by exact and in, and can be unique or indexed.
  deterministic?: boolean;
  // Values that are not encrypted (written before the field was) are read as they are, until reencrypt().
  acceptPlaintext?: boolean;
  // What the values are bound to (the table and column by default): the old names, when one of them is renamed.
  context?: string;
}

export interface ManyToManyOptions {
  relatedName?: string;
  through?: ModelClass | (() => ModelClass);
}

// A field of values of type T (null when N is true).
export declare class Field<T = unknown, N extends boolean = false> {
  private readonly __value: T;
  private readonly __null: N;
  readonly type: string;
  readonly dbType: string;
  name: string;
  attname: string;
  column: string;
  null: boolean;
  unique: boolean;
  primaryKey: boolean;
  jsonSchema(): Record<string, unknown>;
}

export declare class ForeignKey<M extends Model = Model, N extends boolean = false> extends Field<M, N> {
  readonly target: ModelClass<M>;
  onDelete: OnDelete;
  relatedName: string;
}

export declare class ManyToManyField<M extends Model = Model> {
  private readonly __target: M;
  readonly target: ModelClass<M>;
  relatedName: string;
  name: string;
}

type Nullable<O> = O extends { null: true } ? true : false;
type ModelRef<M extends Model> = ModelClass<M> | (() => ModelClass<M>) | 'self' | string;

export declare const fields: {
  // mode (SQL databases): the keys as numbers (the default), bigints or strings, as those of bigint fields.
  id(
    options?: FieldOptions<number | string> & { mode?: 'number' | 'bigint' | 'string' }
  ): Field<number | string | bigint>;
  string<O extends StringOptions>(options?: O): Field<string, Nullable<O>>;
  text<O extends StringOptions>(options?: O): Field<string, Nullable<O>>;
  integer<O extends NumberOptions>(options?: O): Field<number, Nullable<O>>;
  float<O extends NumberOptions>(options?: O): Field<number, Nullable<O>>;
  // mode: 'number' (the default: numbers when they are safe integers, bigints otherwise), 'bigint' or 'string'.
  bigint<O extends FieldOptions<number | bigint> & { mode?: 'number' }>(
    options?: O
  ): Field<number | bigint, Nullable<O>>;
  bigint<O extends FieldOptions<bigint> & { mode: 'bigint' }>(options: O): Field<bigint, Nullable<O>>;
  bigint<O extends FieldOptions<string> & { mode: 'string' }>(options: O): Field<string, Nullable<O>>;
  decimal<O extends DecimalOptions>(options?: O): Field<string, Nullable<O>>;
  date<O extends FieldOptions<string>>(options?: O): Field<string, Nullable<O>>;
  bytes<O extends FieldOptions<Buffer>>(options?: O): Field<Buffer, Nullable<O>>;
  boolean<O extends FieldOptions<boolean>>(options?: O): Field<boolean, Nullable<O>>;
  datetime<O extends DateTimeOptions>(options?: O): Field<Date, Nullable<O>>;
  json<T = unknown, O extends FieldOptions<T> = FieldOptions<T>>(options?: O): Field<T, Nullable<O>>;
  // Maps of strings: HSTORE in PostgreSQL (the extension hstore), json text in SQLite, documents in MongoDB.
  hstore<O extends FieldOptions<Record<string, string | null>>>(
    options?: O
  ): Field<Record<string, string | null>, Nullable<O>>;
  // Geometries of PostGIS as GeoJSON: GEOMETRY / GEOGRAPHY columns (of a shape and SRID) in PostgreSQL.
  geometry<O extends GeometryOptions>(options?: O): Field<GeoJsonGeometry, Nullable<O>>;
  geography<O extends GeometryOptions>(options?: O): Field<GeoJsonGeometry, Nullable<O>>;
  // Arrays of the values of a field: native arrays in PostgreSQL, json text in SQLite, arrays in MongoDB.
  array<T, O extends FieldOptions<Array<T | null>> = FieldOptions<Array<T | null>>>(
    base: Field<T, boolean>,
    options?: O
  ): Field<Array<T | null>, Nullable<O>>;
  // The values of a field kept encrypted (AES-256-GCM) in a TEXT column: conditions only by isnull (and exact and in
  // when deterministic), no orders nor aggregates other than Count.
  encrypted<T, O extends EncryptedOptions<T> = EncryptedOptions<T>>(
    base: Field<T, boolean>,
    options?: O
  ): Field<T, Nullable<O>>;
  uuid<O extends FieldOptions<string>>(options?: O): Field<string, Nullable<O>>;
  foreignKey<M extends Model, O extends ForeignKeyOptions = ForeignKeyOptions>(
    to: ModelRef<M>,
    options?: O
  ): ForeignKey<M, Nullable<O>>;
  manyToMany<M extends Model>(to: ModelRef<M>, options?: ManyToManyOptions): ManyToManyField<M>;
  Field: typeof Field;
  ForeignKey: typeof ForeignKey;
  ManyToManyField: typeof ManyToManyField;
};

type ValueOf<F> = F extends Field<infer T, infer N> ? (N extends true ? T | null : T) : never;

// The properties of the objects of a model from its fields: values; for a foreign key `author`, the key in
// `authorId` and the object (once loaded) in `author`; for many-to-many relations, their QuerySets.
export type Fields<F> = {
  -readonly [K in keyof F as F[K] extends ForeignKey<any, any> | ManyToManyField<any> ? never : K]: ValueOf<F[K]>;
} & {
  -readonly [K in keyof F as F[K] extends ForeignKey<any, any> ? `${K & string}Id` : never]: F[K] extends ForeignKey<
    any,
    infer N
  >
    ? N extends true
      ? number | string | null
      : number | string
    : never;
} & {
  -readonly [K in keyof F as F[K] extends ForeignKey<any, any> ? K : never]: F[K] extends ForeignKey<infer M, infer N>
    ? N extends true
      ? M | null | undefined
      : M | undefined
    : never;
} & {
  readonly [K in keyof F as F[K] extends ManyToManyField<any> ? K : never]: F[K] extends ManyToManyField<infer M>
    ? RelatedSet<M>
    : never;
};

export interface ModelClass<M extends Model = Model> {
  new (data?: Record<string, unknown>): M;
  readonly meta: Meta;
  readonly fields?: Record<string, unknown>;
  readonly options?: ModelOptions;
}

export interface ModelOptions {
  table?: string;
  // The schema of the table (PostgreSQL; SQLite names the table 'schema.table').
  schema?: string;
  // The fields of a composite primary key (its value is the array of theirs: filter({ pk: [1, 'a'] })), or false for
  // a model without one (its objects are only inserted; querysets update and delete its rows).
  primaryKey?: string[] | false;
  ordering?: string | string[];
  /**
   * Rules of the objects, checked by validate() (save, create, bulkCreate) once their fields are valid: expressions on
   * their fields ('end > start'), functions of the object, or { rule, message, field } (field: whose errors get the
   * message; __all__ otherwise).
   */
  rules?: Array<RuleSpec<any> | { rule: ValidationRule<any>; message?: string; field?: string }>;
  // expireAfter (seconds, or text as '30d'; 0: at the date): a TTL index of one datetime field. Its objects expire
  // that long after the date: native in MongoDB, deleted by db.expire() / db.startExpiry() in every backend.
  indexes?: Array<
    string[] | { fields: string[]; unique?: boolean; name?: string; condition?: string; expireAfter?: number | string }
  >;
  abstract?: boolean;
  fillfactor?: number;
  // SQLite: a STRICT table (its columns hold values of their types only).
  strict?: boolean;
  /**
   * Objects kept in the cache of their database (`cache` of the Database; a MemoryCache when none is given): get() by
   * the primary key, or by a field of `indexes` (unique fields), is answered from it; `ttl` in ms. Saving or deleting
   * an object removes it, update() and delete() of querysets clear the model, and transactions neither read nor fill
   * it.
   */
  cache?: boolean | ModelCacheOptions;
  // In Databases: the name of the database of the model (before the routes and the default one).
  database?: string;
}

export interface ModelCacheOptions {
  ttl?: number;
  indexes?: string[];
}

export interface Meta {
  readonly name: string;
  readonly table: string;
  readonly fields: Field<unknown, boolean>[];
  readonly pk: Field<unknown, boolean>;
  readonly db: Database | undefined;
  field(name: string): Field<unknown, boolean> | undefined;
}

export type HookName = 'beforeSave' | 'afterSave' | 'beforeDelete' | 'afterDelete';

export declare class Model {
  constructor(data?: Record<string, unknown>);
  static readonly meta: Meta;
  static readonly db: Database;
  // A QuerySet of the objects of the model (typed by Model.query()).
  static readonly objects: QuerySet<any>;
  static query<M extends Model>(this: ModelClass<M>): QuerySet<M>;
  static create<M extends Model>(this: ModelClass<M>, data: Record<string, unknown>): Promise<M>;
  static on<M extends Model>(
    this: ModelClass<M>,
    event: HookName,
    hook: (instance: M, info: { created?: boolean }) => void | Promise<void>
  ): ModelClass<M>;
  static jsonSchema(options?: { exclude?: string[]; partial?: boolean }): Record<string, unknown>;
  pk: number | string | null;
  validate(): void;
  save(options?: { fields?: string[]; validate?: boolean; db?: Database }): Promise<this>;
  delete(): Promise<number>;
  refresh(): Promise<this>;
  load(name: string): Promise<unknown>;
  toJSON(): Record<string, unknown>;
}

export type Conditions = Record<string, unknown> | Q | JsonPath;

// A condition on a value inside a json field, its path a list of keys (any text: also 'in' or 'a__b') and indexes
// of arrays (numbers up to 2^31 - 1): jsonPath('data', ['owner', 'name'], 'ada'), jsonPath('data', ['tags', 0], 'x').
export declare class JsonPath {
  constructor(field: string, path: Array<string | number>, value: unknown, lookup?: string);
  readonly field: string;
  readonly path: Array<string | number>;
  readonly value: unknown;
  readonly lookup: string;
}
export declare function jsonPath(
  field: string,
  path: Array<string | number>,
  value: unknown,
  lookup?: string
): JsonPath;

export declare class Q {
  constructor(conditions?: Record<string, unknown>, op?: 'and' | 'or' | 'not');
  and(...items: Conditions[]): Q;
  or(...items: Conditions[]): Q;
  not(): Q;
}

export declare function and(...items: Conditions[]): Q;
export declare function or(...items: Conditions[]): Q;
export declare function not(...items: Conditions[]): Q;

export interface FExpression {
  add(value: number | FExpression): FExpression;
  sub(value: number | FExpression): FExpression;
  mul(value: number | FExpression): FExpression;
  div(value: number | FExpression): FExpression;
}
export declare function F(name: string): FExpression;

export interface Aggregate<T = number | null> {
  readonly __result?: T;
  fn: string;
  name?: string;
}
export declare function Count(name?: string, options?: { distinct?: boolean }): Aggregate<number>;
export declare function Sum(name: string): Aggregate<number | null>;
export declare function Avg(name: string): Aggregate<number | null>;
export declare function Min<T = unknown>(name: string): Aggregate<T | null>;
export declare function Max<T = unknown>(name: string): Aggregate<T | null>;

type AggregateResult<A> = { [K in keyof A]: A[K] extends Aggregate<infer T> ? T : never };

export declare class QuerySet<T> implements PromiseLike<T[]>, AsyncIterable<T> {
  readonly model: ModelClass;
  all(): QuerySet<T>;
  filter(...conditions: Conditions[]): QuerySet<T>;
  exclude(...conditions: Conditions[]): QuerySet<T>;
  orderBy(...names: string[]): QuerySet<T>;
  limit(count: number): QuerySet<T>;
  offset(count: number): QuerySet<T>;
  slice(start: number, end?: number): QuerySet<T>;
  only(...names: string[]): QuerySet<T>;
  values<R = Record<string, unknown>>(...names: string[]): QuerySet<R>;
  valuesList<R = unknown>(...args: [...string[], { flat: true }]): QuerySet<R>;
  valuesList<R extends unknown[] = unknown[]>(...names: string[]): QuerySet<R>;
  selectRelated(...names: string[]): QuerySet<T>;
  prefetchRelated(...names: string[]): QuerySet<T>;
  // Aggregates of Count, Sum... or Raw('SUM(CASE WHEN ... END)') (SQL databases).
  annotate<A extends Record<string, Aggregate<unknown>>>(
    aggregates: A
  ): QuerySet<Record<string, unknown> & AggregateResult<A>>;
  using(db: Database): QuerySet<T>;
  // Locks the rows selected until the end of the transaction (PostgreSQL).
  // Its reads stop when the signal is aborted: they throw its reason, and PostgreSQL cancels the one that runs.
  signal(signal: AbortSignal | null): QuerySet<T>;
  // Its results kept in the cache of the database until a model it reads is written (every one needs the option
  // cache); ttl in ms (the ttl of the option cache of the model by default).
  cached(options?: { ttl?: number }): QuerySet<T>;
  selectForUpdate(options?: {
    skipLocked?: boolean;
    noWait?: boolean;
    mode?: 'update' | 'share' | 'noKeyUpdate' | 'keyShare';
    of?: 'self';
  }): QuerySet<T>;
  // The first `count` objects (after `offset`) of every group of values of the fields, in the order of the query.
  limitPer(names: string | string[], count: number, offset?: number): QuerySet<T>;
  then<R1 = T[], R2 = never>(
    onfulfilled?: ((value: T[]) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): Promise<R1 | R2>;
  catch<R = never>(onrejected?: ((reason: unknown) => R | PromiseLike<R>) | null): Promise<T[] | R>;
  [Symbol.asyncIterator](): AsyncIterator<T>;
  fetch(): Promise<T[]>;
  get(...conditions: Conditions[]): Promise<T>;
  first(): Promise<T | null>;
  last(): Promise<T | null>;
  count(): Promise<number>;
  exists(): Promise<boolean>;
  aggregate<A extends Record<string, Aggregate<unknown>>>(aggregates: A): Promise<AggregateResult<A>>;
  create(data?: Record<string, unknown>): Promise<T>;
  getOrCreate(conditions: Record<string, unknown>, defaults?: Record<string, unknown>): Promise<[T, boolean]>;
  updateOrCreate(conditions: Record<string, unknown>, defaults?: Record<string, unknown>): Promise<[T, boolean]>;
  bulkCreate(items: Array<T | Record<string, unknown>>, options?: { validate?: boolean }): Promise<T[]>;
  update(values: Record<string, unknown>): Promise<number>;
  /** Computes again the stored computed fields of the objects, saving those that changed: their number. */
  recompute(): Promise<number>;
  delete(): Promise<number>;
}

// The QuerySet of a many-to-many relation of an object, with the methods that link and unlink objects.
export declare class RelatedSet<T> extends QuerySet<T> {
  add(...items: Array<T | number | string | Array<T | number | string>>): Promise<void>;
  remove(...items: Array<T | number | string | Array<T | number | string>>): Promise<void>;
  set(items: Array<T | number | string>): Promise<void>;
  clear(): Promise<void>;
}

export interface MigrationOperation {
  op: string;
  [key: string]: unknown;
}

export interface DatabaseOptions {
  backend?:
    'memory' | 'fs' | 'sqlite' | 'postgres' | 'mongodb' | Backend | (new (options: Record<string, unknown>) => Backend);
  /** fs: the folder of the files. */
  dir?: string;
  /** fs: a file for each collection (the default), or a folder for each collection and a file for each object. */
  layout?: 'collection' | 'files';
  /** fs: JSON written indented. */
  pretty?: boolean;
  /** fs: false leaves out the lock file that keeps other processes out of the folder. */
  lock?: boolean;
  /** fs: reads again the files changed from outside while the database is open (delay: ms to gather changes). */
  watch?: boolean | { delay?: number };
  /** fs: called with the tables read again after a change from outside. */
  onChange?: (tables: string[]) => void | Promise<void>;
  /** fs: called when a file changed from outside cannot be read (or the folder cannot be watched). */
  onError?: (err: Error) => void;
  /** The name of the database, in the keys of its cache: databases sharing a cache need different names ('db1'...). */
  name?: string;
  /** Where the objects of models with the option `cache` are kept: a MemoryCache when not given. */
  cache?: Cache;
  [option: string]: unknown;
}

// --- Caches (the option `cache` of a Database). Values are copied in and out: what is cached cannot be changed by
// the objects read from it.

/** What a Database keeps cached objects in: these four (MemoryCache, SharedCache, LocalCache, the NetCache of
 * @xufa/netcache, or one of your own). */
export interface Cache {
  get(key: string): Promise<unknown>;
  /** `ttl`: ms (the default of the cache when not given). */
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  delete(keys: string | string[]): Promise<void>;
  /** The keys of a prefix ('' for all). */
  clear(prefix?: string): Promise<void>;
}

export interface MemoryCacheOptions {
  /** Keys kept at most; the least recently used go first (10000). */
  max?: number;
  /** ms a value is kept (0: until evicted). */
  ttl?: number;
}

/** In the process: an LRU of `max` keys, whose values expire after `ttl` ms. */
export declare class MemoryCache implements Cache {
  constructor(options?: MemoryCacheOptions);
  readonly max: number;
  readonly ttl: number;
  readonly size: number;
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  delete(keys: string | string[]): Promise<void>;
  clear(prefix?: string): Promise<void>;
  /** The same, synchronous. */
  getNow(key: string): unknown;
  setNow(key: string, value: unknown, ttl?: number): void;
  deleteNow(keys: string | string[]): void;
  clearNow(prefix?: string): void;
}

/** The bus of @xufa/cluster (`bus` of its start()), as the caches use it. */
export interface CacheBus {
  readonly isPrimary: boolean;
  on(event: string, handler: (data: any) => unknown): unknown;
  request(event: string, data?: unknown, options?: { timeout?: number }): Promise<any>;
  broadcast(event: string, data?: unknown, options?: { except?: number; others?: boolean }): unknown;
}

export interface SharedCacheOptions extends MemoryCacheOptions {
  bus: CacheBus;
  /** Caches of different names do not share their keys ('default'). */
  name?: string;
  /** In the primary: where the values are held (a MemoryCache of `max` and `ttl` by default), such as a NetCache,
   * shared with other machines. */
  store?: Cache;
}

/** In the primary of a cluster: the workers ask it, one copy shared by all. Created in every process with the bus. */
export declare class SharedCache implements Cache {
  constructor(options: SharedCacheOptions);
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  delete(keys: string | string[]): Promise<void>;
  clear(prefix?: string): Promise<void>;
}

export interface LocalCacheOptions extends MemoryCacheOptions {
  bus: CacheBus;
  /** Caches of different names do not share their invalidations ('default'). */
  name?: string;
}

/** A copy in each process (reads do not leave it); deletes and clears reach the copies of the others. */
export declare class LocalCache extends MemoryCache {
  constructor(options: LocalCacheOptions);
}

export declare class Database {
  constructor(options?: DatabaseOptions);
  static registerBackend(name: string, factory: () => new (options: Record<string, unknown>) => Backend): void;
  readonly backend: Backend;
  /** The name of the database (in the keys of its cache). */
  readonly name: string;
  /** Where cached objects are kept: the option `cache`, or a MemoryCache made at the first use (null until then). */
  cache: Cache | null;
  readonly models: Map<string, ModelClass>;
  register(...models: ModelClass<any>[]): this;
  model<M extends Model = Model>(name: string): ModelClass<M> | undefined;
  connect(): Promise<this>;
  close(): Promise<void>;
  sync(): Promise<void>;
  drop(): Promise<void>;
  transaction<R>(fn: () => R | Promise<R>): Promise<R>;
  makeMigrations(options: { dir: string; name?: string }): Promise<{
    name: string;
    file: string;
    operations: MigrationOperation[];
  } | null>;
  migrate(options: { dir: string; to?: string }): Promise<string[]>;
  showMigrations(options: { dir: string }): Promise<Array<{ name: string; applied: boolean }>>;
  // Deletes the objects of TTL indexes that expired: the number deleted, by model.
  expire(options?: { now?: Date }): Promise<Record<string, number>>;
  // MongoDB: converts the decimals written as strings to Decimal128, in the server; the number of values by model.
  migrateDecimals(): Promise<Record<string, number>>;
  // Calls expire() every interval (seconds or text: '1m') until stopExpiry() or close().
  startExpiry(options?: { interval?: number | string; onError?: (err: Error) => void }): this;
  stopExpiry(): void;
}

// Several databases by name, and the models routed to them: the option `database` of a model, its route, or the
// default one. Relations across them are followed with more queries; a query cannot join them.
export declare class Databases {
  constructor(
    config: Record<string, DatabaseOptions | Database>,
    options?: { routes?: Record<string, string>; defaultName?: string }
  );
  readonly databases: Map<string, Database>;
  readonly models: Map<string, ModelClass>;
  get(name?: string): Database;
  // The name of the database of a model, and the database it is registered in (null when none).
  route(model: ModelClass<any>): string;
  databaseOf(model: ModelClass<any>): Database | null;
  register(...models: ModelClass<any>[]): this;
  connect(): Promise<this>;
  close(): Promise<void>;
  sync(): Promise<void>;
  makeMigrations(options: { dir: string; name?: string }): Promise<Record<string, unknown>>;
  migrate(options: { dir: string }): Promise<Record<string, string[]>>;
  transaction<R>(name: string, fn: () => R | Promise<R>): Promise<R>;
}

// What config(tenantId) gives: the options of one database, a Database, a Databases, or several databases with the
// routes of the models (over those of the Tenants).
export type TenantConfig =
  | DatabaseOptions
  | Database
  | Databases
  | { databases: Record<string, DatabaseOptions | Database>; routes?: Record<string, string>; defaultName?: string };

// A database (or several) for each tenant, opened the first time it is used; code run in a tenant uses it.
export interface CachedOptions<A extends unknown[]> {
  /** What of the arguments is the key (the arguments by default). */
  key?(...args: A): unknown;
  /** ms a result is kept (0: until evicted). */
  ttl?: number;
  /** Where (a MemoryCache of its own by default); a cache of yours needs a name. */
  cache?: Cache;
  name?: string;
  /** The keys of its own MemoryCache. */
  max?: number;
}

export type CachedFunction<F extends (...args: any[]) => Promise<any>> = F & {
  /** Forgets the result of some arguments. */
  invalidate(...args: Parameters<F>): Promise<void>;
  /** Forgets every result. */
  clear(): Promise<void>;
};

// A function whose results are kept: the same arguments give the result kept, and calls made while one runs wait
// for it. Errors are not kept.
export declare function cached<F extends (...args: any[]) => Promise<any>>(
  fn: F,
  options?: CachedOptions<Parameters<F>>
): CachedFunction<F>;

// Runs fn with the reads of its queries stopped when the signal is aborted (writes are not stopped).
export declare function withSignal<R>(signal: AbortSignal, fn: () => R): R;

export declare class Tenants {
  constructor(options: {
    models?: ModelClass<any>[];
    config: (tenantId: string) => TenantConfig | null | undefined | Promise<TenantConfig | null | undefined>;
    setup?: (db: Database | Databases, tenantId: string) => unknown;
    // The databases of tenants kept open (the last used).
    max?: number;
    // The databases of the models, for the tenants with several.
    routes?: Record<string, string>;
  });
  database(tenantId: string): Promise<Database | Databases>;
  run<R>(tenantId: string, fn: () => R | Promise<R>): Promise<R>;
  enter(tenantId: string): Promise<Database | Databases>;
  close(): Promise<void>;
}

export declare class Backend {
  constructor(options?: Record<string, unknown>);
  readonly name: string;
  readonly inTransaction: boolean;
  connect(): Promise<void>;
  close(): Promise<void>;
  transaction<R>(fn: () => R | Promise<R>): Promise<R>;
  raw?(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
}

export interface OrmError extends Error {
  code: string;
  statusCode?: number;
}

export interface ValidationErrorInstance extends OrmError {
  errors: Record<string, string[]>;
}

type ErrorClass<E = OrmError> = (new (...args: unknown[]) => E) & ((...args: unknown[]) => E);

export declare const ValidationError: ErrorClass<ValidationErrorInstance>;
export declare const FieldError: ErrorClass;
export declare const LookupError: ErrorClass;
export declare const NotFoundError: ErrorClass;
export declare const MultipleObjectsError: ErrorClass;
export declare const NotRegisteredError: ErrorClass;
export declare const ModelError: ErrorClass;
export declare const QueryError: ErrorClass;
export declare const ProtectedError: ErrorClass;
export declare const BackendError: ErrorClass;
export declare const UnsupportedError: ErrorClass;
// A write that would duplicate a unique field or key: 409, with the names of the fields and the model.
export interface UniqueErrorInstance extends OrmError {
  model: string;
  fields: string[];
}
export declare const UniqueError: ErrorClass<UniqueErrorInstance>;
// An encrypted value that cannot be read (its key is not in the keyring, it was changed), or no keys to encrypt.
export declare const EncryptionError: ErrorClass;

// The keys of encrypted fields: 32 bytes each (Buffers, or base64 or hex text), by id; the current one encrypts.
export type EncryptionKey = string | Buffer | Uint8Array;

export declare class Keyring {
  constructor(options: EncryptionKey | { current?: string; keys: Record<string, EncryptionKey> });
  current: string;
  seal(plaintext: Buffer, context: string, deterministic?: boolean): string;
  open(text: string, context: string): Buffer;
}

// Sets the keyring of the process (null: none; then XUFA_ENCRYPTION_KEYS='k2:<base64>,k1:<base64>' is read).
export declare function setEncryptionKeys(
  options: Keyring | EncryptionKey | { current?: string; keys: Record<string, EncryptionKey> } | null
): Keyring | null;
// 32 random bytes in base64.
export declare function generateEncryptionKey(): string;
// Whether a stored value is encrypted text ($xenc$...).
export declare function isEncrypted(value: unknown): value is string;
// Writes the encrypted fields of every object again with the current key: the number of objects written.
export declare function reencrypt(
  Model: ModelClass,
  options?: { fields?: string[]; batchSize?: number }
): Promise<number>;

export interface PluginOptions {
  // The database of the app (app.db), or tenants (a database for each).
  database?: Database;
  // Each request in its tenant (resolve gives its id); without one, 400 when required (the default), 404 when unknown.
  tenants?: { tenants: Tenants; resolve(request: any): string | number | null | undefined; required?: boolean };
  // The reads of a request stop when its client goes away (request.signal): those not started throw, and PostgreSQL
  // cancels the one that runs. Writes are not stopped.
  cancel?: boolean;
  connect?: boolean;
  close?: boolean;
  migrate?: { dir: string; to?: string };
  sync?: boolean;
  errorHandler?: boolean;
  // Deletes the objects of TTL indexes that expired while the app runs (true: every minute).
  expire?: boolean | { interval?: number | string; onError?: (err: Error) => void };
}

export type ResourceAction = 'list' | 'get' | 'create' | 'update' | 'delete';

export interface ResourceOptions<T extends Model = Model> {
  // The actions given (all of them by default): list (GET /), get (GET /:id), create (POST /), update (PUT and PATCH
  // /:id) and delete (DELETE /:id).
  actions?: ResourceAction[];
  // The documentation of its routes for @xufa/openapi (their config openapi): true by default; { tag } names their
  // tag (the name of the model by default); false leaves it out.
  openapi?: boolean | { tag?: string };
  // The objects of a request (all by default): those out of it are not found by any route.
  queryset?(request: any): QuerySet<T>;
  // The fields answered (all of them by default), or all but `exclude`.
  fields?: string[];
  exclude?: string[];
  // The fields a body sets (every one but the primary key and those set by the ORM by default), or all but readOnly.
  writable?: string[];
  readOnly?: string[];
  // The filters of lists, as query parameters: ['author', 'pages__gte'] or { pages: ['gte', 'lte'] }.
  filters?: string[] | Record<string, string | string[]>;
  // The fields lists can be ordered by (?ordering=-pages,title).
  ordering?: string[];
  // The fields ?search= looks into (icontains, any of them).
  search?: string[];
  // Related objects loaded with the objects (selectRelated).
  related?: string[];
  // ?limit (pageSize by default, maxPageSize at most) and ?offset; pagination: false answers arrays.
  pageSize?: number;
  maxPageSize?: number;
  pagination?: boolean;
  // The field of /:id ('pk' by default).
  lookup?: string;
  // The rule of @xufa/auth of every action (config.auth of its routes), or one by action.
  auth?: unknown | Partial<Record<ResourceAction, unknown>>;
  hooks?: {
    beforeCreate?(
      values: Record<string, unknown>,
      request: any
    ): Record<string, unknown> | void | Promise<Record<string, unknown> | void>;
    afterCreate?(object: T, request: any): void | Promise<void>;
    beforeUpdate?(
      object: T,
      values: Record<string, unknown>,
      request: any
    ): Record<string, unknown> | void | Promise<Record<string, unknown> | void>;
    afterUpdate?(object: T, request: any): void | Promise<void>;
    beforeDelete?(object: T, request: any): void | Promise<void>;
  };
  // How an object is answered (its toJSON() by default).
  serialize?(object: T, request: any): unknown;
}

// The routes of the objects of a model, to register with a prefix: app.register(resource(Book), { prefix: '/books' }).
export declare function resource<T extends Model>(
  model: ModelClass<T>,
  options?: ResourceOptions<T>
): (app: any) => Promise<void>;

// The plugin for @xufa/http (and fastify): app.register(plugin, { database }).
export declare function plugin(app: any, options: PluginOptions): Promise<void>;

// To type app.db, augment the instance of @xufa/http in your project:
//   declare module '@xufa/http' { interface XufaInstance { db: Database } }
