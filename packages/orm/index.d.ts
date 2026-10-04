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

export interface FieldOptions<T> {
  null?: boolean;
  default?: T | (() => T);
  unique?: boolean;
  index?: boolean;
  primaryKey?: boolean;
  choices?: readonly T[];
  column?: string;
  validate?: ((value: T) => string | boolean | void) | Array<(value: T) => string | boolean | void>;
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
  id(options?: FieldOptions<number | string>): Field<number | string>;
  string<O extends StringOptions>(options?: O): Field<string, Nullable<O>>;
  text<O extends StringOptions>(options?: O): Field<string, Nullable<O>>;
  integer<O extends NumberOptions>(options?: O): Field<number, Nullable<O>>;
  float<O extends NumberOptions>(options?: O): Field<number, Nullable<O>>;
  bigint<O extends FieldOptions<number | bigint>>(options?: O): Field<number | bigint, Nullable<O>>;
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
  indexes?: Array<string[] | { fields: string[]; unique?: boolean; name?: string }>;
  abstract?: boolean;
  fillfactor?: number;
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

export type Conditions = Record<string, unknown> | Q;

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
    'memory' | 'sqlite' | 'postgres' | 'mongodb' | Backend | (new (options: Record<string, unknown>) => Backend);
  [option: string]: unknown;
}

export declare class Database {
  constructor(options?: DatabaseOptions);
  static registerBackend(name: string, factory: () => new (options: Record<string, unknown>) => Backend): void;
  readonly backend: Backend;
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

export interface PluginOptions {
  database: Database;
  connect?: boolean;
  close?: boolean;
  migrate?: { dir: string; to?: string };
  sync?: boolean;
  errorHandler?: boolean;
}

// The plugin for @xufa/http (and fastify): app.register(plugin, { database }).
export declare function plugin(app: any, options: PluginOptions): Promise<void>;

// To type app.db, augment the instance of @xufa/http in your project:
//   declare module '@xufa/http' { interface XufaInstance { db: Database } }
