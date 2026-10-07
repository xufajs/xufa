import type { CacheFaults } from '@xufa/faults';
import type { TSchema, TObject, TOptional, ObjectOptions } from '@xufa/schema';
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
/** A validation rule with its message: a rule (an expression, or a function), or { rule, message }. */
export type RuleSpec<S> = ValidationRule<S> | { rule: ValidationRule<S>; message?: string };

/**
 * The options every field takes: null, default (a value or a function), unique, index, primaryKey, choices, column,
 * validate (rules), audit, and computed, stored and uses for computed fields.
 */
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
  /** In the audit log: 'redact' keeps only that it changed (not its values), false leaves it out. */
  audit?: false | 'redact';
}

/** The options of string and text fields: maxLength and minLength (and those of every field). */
export interface StringOptions extends FieldOptions<string> {
  maxLength?: number;
  minLength?: number;
}

/** The options of number fields: min and max (and those of every field). */
export interface NumberOptions extends FieldOptions<number> {
  min?: number;
  max?: number;
}

/** A GeoJSON geometry (its crs is its SRID: { type: 'name', properties: { name: 'EPSG:4326' } }). */
export interface GeoJsonGeometry {
  type: 'Point' | 'LineString' | 'Polygon' | 'MultiPoint' | 'MultiLineString' | 'MultiPolygon' | 'GeometryCollection';
  coordinates?: unknown[];
  geometries?: GeoJsonGeometry[];
  crs?: { type: string; properties: { name: string } };
}

/** The options of geometry and geography fields (PostgreSQL with PostGIS): the shape and the SRID of the column. */
export interface GeometryOptions extends FieldOptions<GeoJsonGeometry> {
  /** 'POINT', 'LINESTRING', 'POLYGON'... and the SRID of the column (PostgreSQL). */
  shape?: string;
  srid?: number;
}

/** The options of datetime fields: autoNow (set to now on every save) and autoNowAdd (when created). */
export interface DateTimeOptions extends FieldOptions<Date> {
  autoNow?: boolean;
  autoNowAdd?: boolean;
}

/**
 * The options of decimal fields: precision (digits in all) and scale (decimal places). Values are strings with the
 * places of the scale ('3' is '3.00'); more digits or places are a validation error, as in Django.
 */
export interface DecimalOptions extends FieldOptions<string> {
  precision?: number;
  scale?: number;
}

/**
 * What deleting an object does to the objects whose foreign key points to it, done by the ORM: cascade (deleted too),
 * setNull, protect (the delete is refused: ProtectedError) or doNothing.
 */
export type OnDelete = 'cascade' | 'setNull' | 'protect' | 'doNothing';
/** The ON DELETE of the foreign key constraint in SQL databases, done by the database (dbOnDelete). */
export type DbOnDelete = 'cascade' | 'setNull' | 'restrict' | 'noAction';

/**
 * The options of a foreign key: onDelete, relatedName (the reverse relation of the model it points to), attname (the
 * name of the key), and dbOnDelete and dbOnUpdate for the constraint in SQL databases.
 */
export interface ForeignKeyOptions extends FieldOptions<unknown> {
  onDelete?: OnDelete;
  relatedName?: string;
  /** The name of the key (`<name>Id` by default). */
  attname?: string;
  /** ON DELETE of the foreign key in SQL databases. */
  dbOnDelete?: DbOnDelete;
  /** ON UPDATE of the foreign key in SQL databases. */
  dbOnUpdate?: DbOnDelete;
}

/**
 * The options of encrypted fields: deterministic (found by equality, can be unique), acceptPlaintext (values written
 * before the field was encrypted), and context (the table and column the text is bound to).
 */
export interface EncryptedOptions<T> extends Omit<FieldOptions<T>, 'primaryKey'> {
  /** The same value is the same text (for the same key): found by exact and in, and can be unique or indexed. */
  deterministic?: boolean;
  /** Values that are not encrypted (written before the field was) are read as they are, until reencrypt(). */
  acceptPlaintext?: boolean;
  /** What the values are bound to (the table and column by default): the old names, when one of them is renamed. */
  context?: string;
}

/** The options of a many-to-many field: relatedName, and through (the model of the links, with fields of its own). */
export interface ManyToManyOptions {
  relatedName?: string;
  through?: ModelClass | (() => ModelClass);
}

/** A field of values of type T (null when N is true); O: its options (what Model.schema() reads: default, computed...). */
export declare class Field<T = unknown, N extends boolean = false, O = {}> {
  private readonly __value: T;
  private readonly __null: N;
  private readonly __options: O;
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

/**
 * A foreign key: the key of an object of another model (or of its own: 'self'), in <name>Id, and the object in <name>
 * once loaded.
 */
export declare class ForeignKey<M extends Model = Model, N extends boolean = false, O = {}> extends Field<M, N, O> {
  readonly target: ModelClass<M>;
  onDelete: OnDelete;
  relatedName: string;
}

/**
 * A many-to-many relation: links between the objects of two models, in a table of links (made, or the model of
 * through).
 */
export declare class ManyToManyField<M extends Model = Model> {
  private readonly __target: M;
  readonly target: ModelClass<M>;
  relatedName: string;
  name: string;
}

/** Whether the options of a field say null: true. */
type Nullable<O> = O extends { null: true } ? true : false;
/**
 * A model, as a field names the one it points to: its class, a function that gives it (for models defined later),
 * 'self', or its name.
 */
type ModelRef<M extends Model> = ModelClass<M> | (() => ModelClass<M>) | 'self' | string;

/**
 * The options of a model, as they are: `static options = modelOptions({ primaryKey: ['a', 'b'] })`. TypeScript then
 * keeps their values without `as const` (primaryKey: false, the fields of a composite key: Model.schema() has no
 * automatic id for them) and checks their names.
 */
export declare function modelOptions<const O extends ModelOptions>(
  options: O & { [K in Exclude<keyof O, keyof ModelOptions>]: never }
): O;

/**
 * The fields of models: string, text, integer, bigint, float, decimal, boolean, date, datetime, json, uuid, bytes,
 * array, hstore, geometry, geography, encrypted, blob, blobInfo and mailInfo, and the relations foreignKey and
 * manyToMany.
 */
export declare const fields: {
  /** mode (SQL databases): the keys as numbers (the default), bigints or strings, as those of bigint fields. */
  id(
    options?: FieldOptions<number | string> & { mode?: 'number' | 'bigint' | 'string' }
  ): Field<number | string | bigint, false, { primaryKey: true; auto: true }>;
  string<O extends StringOptions>(options?: O): Field<string, Nullable<O>, O>;
  text<O extends StringOptions>(options?: O): Field<string, Nullable<O>, O>;
  integer<O extends NumberOptions>(options?: O): Field<number, Nullable<O>, O>;
  float<O extends NumberOptions>(options?: O): Field<number, Nullable<O>, O>;
  /** mode: 'number' (the default: numbers when they are safe integers, bigints otherwise), 'bigint' or 'string'. */
  bigint<O extends FieldOptions<number | bigint> & { mode?: 'number' }>(
    options?: O
  ): Field<number | bigint, Nullable<O>, O>;
  bigint<O extends FieldOptions<bigint> & { mode: 'bigint' }>(options: O): Field<bigint, Nullable<O>, O>;
  bigint<O extends FieldOptions<string> & { mode: 'string' }>(options: O): Field<string, Nullable<O>, O>;
  decimal<O extends DecimalOptions>(options?: O): Field<string, Nullable<O>, O>;
  date<O extends FieldOptions<string>>(options?: O): Field<string, Nullable<O>, O>;
  bytes<O extends FieldOptions<Buffer>>(options?: O): Field<Buffer, Nullable<O>, O>;
  boolean<O extends FieldOptions<boolean>>(options?: O): Field<boolean, Nullable<O>, O>;
  datetime<O extends DateTimeOptions>(options?: O): Field<Date, Nullable<O>, O>;
  json<T = unknown, O extends FieldOptions<T> = FieldOptions<T>>(options?: O): Field<T, Nullable<O>, O>;
  /** Maps of strings: HSTORE in PostgreSQL (the extension hstore), json text in SQLite, documents in MongoDB. */
  hstore<O extends FieldOptions<Record<string, string | null>>>(
    options?: O
  ): Field<Record<string, string | null>, Nullable<O>, O>;
  /** Geometries of PostGIS as GeoJSON: GEOMETRY / GEOGRAPHY columns (of a shape and SRID) in PostgreSQL. */
  geometry<O extends GeometryOptions>(options?: O): Field<GeoJsonGeometry, Nullable<O>, O>;
  geography<O extends GeometryOptions>(options?: O): Field<GeoJsonGeometry, Nullable<O>, O>;
  /** Arrays of the values of a field: native arrays in PostgreSQL, json text in SQLite, arrays in MongoDB. */
  array<T, O extends FieldOptions<Array<T | null>> = FieldOptions<Array<T | null>>>(
    base: Field<T, boolean>,
    options?: O
  ): Field<Array<T | null>, Nullable<O>, O>;
  /**
   * The values of a field kept encrypted (AES-256-GCM) in a TEXT column: conditions only by isnull (and exact and in
   * when deterministic), no orders nor aggregates other than Count.
   */
  encrypted<T, O extends EncryptedOptions<T> = EncryptedOptions<T>>(
    base: Field<T, boolean>,
    options?: O
  ): Field<T, Nullable<O>, O>;
  /** A primary key of uuids is generated when it is not given. */
  uuid<O extends FieldOptions<string>>(
    options?: O
  ): Field<string, Nullable<O>, O extends { primaryKey: true } ? O & { auto: true } : O>;
  /**
   * The body of an object of a blob backend (disk, memory-blob): written as a Buffer, a string, a stream, a Blob or a
   * BlobValue; read as a BlobValue, whose body is read when asked.
   */
  blob<O extends FieldOptions<BlobBody>>(options?: O): Field<BlobValue | BlobBody, Nullable<O>, O & { blob: true }>;
  /**
   * What a blob backend knows of each object, given by it: its size in bytes, etag, the time it was written, and its
   * content type (written with the body when given).
   */
  blobInfo(kind: 'size', options?: { column?: string }): Field<number, true, { auto: true; readOnly: true }>;
  blobInfo(kind: 'etag', options?: { column?: string }): Field<string, true, { auto: true; readOnly: true }>;
  blobInfo(kind: 'updatedAt', options?: { column?: string }): Field<Date, true, { auto: true; readOnly: true }>;
  blobInfo(kind: 'contentType', options?: { column?: string }): Field<string, true, { auto: true }>;
  /**
   * What a mail backend (smtp, memory-mail) gives of a message it sent: its Message-ID, the recipients the server
   * accepted and refused, its answer, when it was sent, and the message as sent (MIME).
   */
  mailInfo(
    kind: 'messageId' | 'response' | 'raw',
    options?: { column?: string }
  ): Field<string, true, { auto: true; readOnly: true }>;
  mailInfo(kind: 'accepted', options?: { column?: string }): Field<string[], true, { auto: true; readOnly: true }>;
  mailInfo(
    kind: 'rejected',
    options?: { column?: string }
  ): Field<MailRejection[], true, { auto: true; readOnly: true }>;
  mailInfo(kind: 'sentAt', options?: { column?: string }): Field<Date, true, { auto: true; readOnly: true }>;
  foreignKey<M extends Model, O extends ForeignKeyOptions = ForeignKeyOptions>(
    to: ModelRef<M>,
    options?: O
  ): ForeignKey<M, Nullable<O>, O>;
  manyToMany<M extends Model>(to: ModelRef<M>, options?: ManyToManyOptions): ManyToManyField<M>;
  /**
   * The fields of a parent model with those of a child (theirs replace those of the same name; null removes one), as
   * the ORM merges them: `static fields = fields.extend(Timestamped, { title: fields.string() })` types the child
   * (Fields<typeof Child.fields>, Child.schema()) with the fields of its parents too.
   */
  extend<P, O extends Record<string, unknown>>(parent: { readonly fields?: P }, own: O): ExtendedFields<P, O>;
  Field: typeof Field;
  ForeignKey: typeof ForeignKey;
  ManyToManyField: typeof ManyToManyField;
};

/** The fields of fields.extend(): those of the parent not given again, and those given (null: removed). */
export type ExtendedFields<P, O> = {
  [K in keyof P as K extends keyof O ? never : K]: P[K];
} & { [K in keyof O as O[K] extends null ? never : K]: O[K] } extends infer R
  ? { [K in keyof R]: R[K] }
  : never;

/** The value of a field in its objects (its type, or null when the field takes null). */
type ValueOf<F> = F extends Field<infer T, infer N> ? (N extends true ? T | null : T) : never;

/**
 * The properties of the objects of a model from its fields: values; for a foreign key `author`, the key in
 * `authorId` and the object (once loaded) in `author`; for many-to-many relations, their QuerySets.
 */
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

/**
 * The properties of Model.schema(): each field as its JSON (dates and bytes are strings, bigints numbers), not
 * required when the database or the ORM can give it (null, default, auto, computed); foreign keys by their keys
 * (`authorId`); an `id` when no field is the primary key; no many-to-many relations nor bodies of blobs.
 */
type JsonValueOf<T> = T extends Date ? string : T extends Buffer ? string : T extends bigint ? number : T;
/** The values of choices given as const (choices: ['draft', 'published'] as const). */
type ChoiceOf<T, O> = O extends { choices: readonly (infer C)[] } ? ([T] extends [C] ? T : C & T) : T;
/**
 * Whether a value of a field may be left out when an object is made: it takes null, has a default, is computed or set
 * by the ORM.
 */
type NotRequired<O> = O extends
  { null: true } | { default: {} | null } | { computed: {} } | { autoNow: true } | { autoNowAdd: true } | { auto: true }
  ? true
  : false;
/**
 * The property of a field in the JSON Schema of a model: optional when it is not required, its type with null when it
 * takes null.
 */
type PropertyOf<T, N, O> =
  NotRequired<O> extends true ? TOptional<N extends true ? T | null : T> : TSchema<N extends true ? T | null : T>;
/** The property of a field in the JSON Schema of a model (a foreign key as its key: a number or a string). */
type SchemaPropertyOf<F> =
  F extends ForeignKey<any, infer N, infer O>
    ? PropertyOf<number | string, N, O>
    : F extends Field<infer T, infer N, infer O>
      ? PropertyOf<JsonValueOf<ChoiceOf<T, O>>, N, O>
      : never;
/**
 * Whether a field is in the JSON Schema of a model: not blobs; not computed fields nor automatic keys in the schemas of
 * input.
 */
type InSchema<F, I> =
  F extends Field<any, any, infer O>
    ? O extends { blob: true }
      ? false
      : I extends true
        ? O extends { computed: {} } | { readOnly: true }
          ? false
          : true
        : true
    : false;
/** Whether the fields of a model have a primary key of their own. */
type PrimaryKeyOf<F> = { [K in keyof F]: F[K] extends Field<any, any, { primaryKey: true }> ? true : false }[keyof F];
/** The properties of a schema, as one object type (for editors). */
type SimplifyProps<T> = { [K in keyof T]: Extract<T[K], TSchema> } & {};
/**
 * An automatic id: when no field is the primary key, and the options of the model (O) do not say primaryKey: false or
 * the fields of a composite key (written as const, or satisfies ModelOptions: { primaryKey: false } alone is a boolean).
 */
type AutoIdOf<F, O> =
  true extends PrimaryKeyOf<F>
    ? {}
    : O extends { primaryKey: false | readonly string[] }
      ? {}
      : { id: TOptional<number | string> };
/**
 * The properties of the JSON Schema of a model (Model.schema()), typed from its fields: those of input (I) without
 * computed fields and automatic keys.
 */
export type ModelSchemaProperties<F, I extends boolean = false, O = unknown> = SimplifyProps<
  {
    [
      K in keyof F as InSchema<F[K], I> extends true
        ? F[K] extends ForeignKey<any, any, any>
          ? `${K & string}Id`
          : K
        : never
    ]: SchemaPropertyOf<F[K]>;
  } & AutoIdOf<F, O>
>;

/** A model class: new Model(data), its meta, its fields, objects (its QuerySets) and its static methods. */
export interface ModelClass<M extends Model = Model> {
  new (data?: Record<string, unknown>): M;
  readonly meta: Meta;
  readonly fields?: Record<string, unknown>;
  readonly options?: ModelOptions;
}

/**
 * The options of a model (static options): table, schema, ordering, indexes (TTL indexes with expireAfter), primaryKey
 * (composite keys), abstract, database (in Databases), rules, cache, audit, strict and fillfactor.
 */
export interface ModelOptions {
  table?: string;
  /** The schema of the table (PostgreSQL; SQLite names the table 'schema.table'). */
  schema?: string;
  /**
   * The fields of a composite primary key (its value is the array of theirs: filter({ pk: [1, 'a'] })), or false for
   * a model without one (its objects are only inserted; querysets update and delete its rows).
   */
  primaryKey?: readonly string[] | false;
  ordering?: string | string[];
  /**
   * Rules of the objects, checked by validate() (save, create, bulkCreate) once their fields are valid: expressions on
   * their fields ('end > start'), functions of the object, or { rule, message, field } (field: whose errors get the
   * message; __all__ otherwise).
   */
  rules?: Array<RuleSpec<any> | { rule: ValidationRule<any>; message?: string; field?: string }>;
  /**
   * expireAfter (seconds, or text as '30d'; 0: at the date): a TTL index of one datetime field. Its objects expire
   * that long after the date: native in MongoDB, deleted by db.expire() / db.startExpiry() in every backend.
   */
  indexes?: Array<
    string[] | { fields: string[]; unique?: boolean; name?: string; condition?: string; expireAfter?: number | string }
  >;
  abstract?: boolean;
  fillfactor?: number;
  /** SQLite: a STRICT table (its columns hold values of their types only). */
  strict?: boolean;
  /**
   * Objects kept in the cache of their database (`cache` of the Database; a MemoryCache when none is given): get() by
   * the primary key, or by a field of `indexes` (unique fields), is answered from it; `ttl` in ms. Saving or deleting
   * an object removes it, update() and delete() of querysets clear the model, and transactions neither read nor fill
   * it.
   */
  cache?: boolean | ModelCacheOptions;
  /** In Databases: the name of the database of the model (before the routes and the default one). */
  database?: string;
  /** false: not in the audit log of its database. */
  audit?: boolean;
  /**
   * Soft deletes: delete() sets the date of a field (deletedAt, added when the model has none; or the name given), and
   * querysets leave those objects out (withDeleted(), onlyDeleted(), restore(), forceDelete()).
   */
  softDelete?: boolean | string;
}

/**
 * The cache of the objects of a model (options.cache): their ttl in ms, and the unique fields they are found by besides
 * the key.
 */
export interface ModelCacheOptions {
  ttl?: number;
  indexes?: string[];
}

/** What the ORM knows of a model (Model.meta): its name, table, fields, primary key and relations. */
export interface Meta {
  readonly name: string;
  readonly table: string;
  readonly fields: Field<unknown, boolean>[];
  readonly pk: Field<unknown, boolean>;
  readonly db: Database | undefined;
  field(name: string): Field<unknown, boolean> | undefined;
}

/** The hooks of a model (Model.on(name, fn)), as Django's signals pre_save, post_save, pre_delete and post_delete. */
export type HookName = 'beforeSave' | 'afterSave' | 'beforeDelete' | 'afterDelete';

/**
 * A model: a class with static fields (and options), whose objects are rows of its table (or documents of its
 * collection). Book.objects gives its QuerySets.
 */
export declare class Model {
  constructor(data?: Record<string, unknown>);
  static readonly meta: Meta;
  static readonly db: Database;
  /** A QuerySet of the objects of the model (typed by Model.query()). */
  static readonly objects: QuerySet<any>;
  static query<M extends Model>(this: ModelClass<M>): QuerySet<M>;
  static create<M extends Model>(this: ModelClass<M>, data: Record<string, unknown>): Promise<M>;
  static on<M extends Model>(
    this: ModelClass<M>,
    event: HookName,
    hook: (instance: M, info: { created?: boolean }) => void | Promise<void>
  ): ModelClass<M>;
  static jsonSchema(options?: { exclude?: string[]; partial?: boolean }): Record<string, unknown>;
  /**
   * The schema of the objects of the model as @xufa/schema makes them, typed from its fields (as JSON: dates and bytes
   * are strings; a foreign key is its key, `authorId`). `input: true`: without what is never given (computed fields).
   * The other options are those of s.object() (additionalProperties, $id, title...).
   */
  static schema<F, I extends boolean = false, O = unknown>(
    this: { readonly fields: F; readonly options?: O },
    options?: { input?: I } & ObjectOptions
  ): TObject<ModelSchemaProperties<F, I, O>>;
  pk: number | string | null;
  validate(): void;
  save(options?: { fields?: string[]; validate?: boolean; db?: Database }): Promise<this>;
  /** Deletes the object (with soft deletes, sets the date it was deleted). */
  delete(): Promise<number>;
  /** Deletes the object for good, also when its model has soft deletes. */
  forceDelete(): Promise<number>;
  /** Takes back an object deleted softly. */
  restore(): Promise<this>;
  /** Whether the object was deleted softly. */
  readonly isDeleted: boolean;
  refresh(): Promise<this>;
  load(name: string): Promise<unknown>;
  toJSON(): Record<string, unknown>;
}

/**
 * The conditions of filter(), exclude() and get(): { field__lookup: value }, Q (and, or, not) or a condition inside
 * json fields.
 */
export type Conditions = Record<string, unknown> | Q | JsonPath;

/**
 * A condition on a value inside a json field, its path a list of keys (any text: also 'in' or 'a__b') and indexes
 * of arrays (numbers up to 2^31 - 1): jsonPath('data', ['owner', 'name'], 'ada'), jsonPath('data', ['tags', 0], 'x').
 */
export declare class JsonPath {
  constructor(field: string, path: Array<string | number>, value: unknown, lookup?: string);
  readonly field: string;
  readonly path: Array<string | number>;
  readonly value: unknown;
  readonly lookup: string;
}
/** A condition on a value inside a json field by a path of keys and indexes: jsonPath('meta', ['a', 0]).gt(1). */
export declare function jsonPath(
  field: string,
  path: Array<string | number>,
  value: unknown,
  lookup?: string
): JsonPath;

/** Conditions combined: new Q({ a: 1 }).or({ b: 2 }), and(), or(), not(), as Django's Q objects. */
export declare class Q {
  constructor(conditions?: Record<string, unknown>, op?: 'and' | 'or' | 'not');
  and(...items: Conditions[]): Q;
  or(...items: Conditions[]): Q;
  not(): Q;
}

/** Conditions that all hold (as Django's Q(a) & Q(b)). */
export declare function and(...items: Conditions[]): Q;
/** Conditions of which one holds, at least (as Django's Q(a) | Q(b)). */
export declare function or(...items: Conditions[]): Q;
/** Conditions that do not hold (as Django's ~Q(a)). */
export declare function not(...items: Conditions[]): Q;

/** An expression of a field (F): its value with add, sub, mul and div of numbers or other fields. */
export interface FExpression {
  add(value: number | FExpression): FExpression;
  sub(value: number | FExpression): FExpression;
  mul(value: number | FExpression): FExpression;
  div(value: number | FExpression): FExpression;
}
/**
 * The value of a field in the database, to compare with (filter({ pages__gt: F('chapters').mul(10) })) or update from
 * (update({ views: F('views').add(1) })), as Django's F.
 */
export declare function F(name: string): FExpression;

/** The parts of dates of Extract: numbers, in UTC (week_day: 1 is Sunday; iso_week_day: 1 is Monday; week: ISO). */
export type DatePart =
  'year' | 'quarter' | 'month' | 'week' | 'day' | 'week_day' | 'iso_week_day' | 'hour' | 'minute' | 'second';
/** The units of Trunc: the start of them, in UTC (week: Monday). */
export type DateUnit = 'year' | 'quarter' | 'month' | 'week' | 'day' | 'hour' | 'minute' | 'second';
export interface ExtractExpression {
  readonly field: string;
  readonly part: DatePart;
}
export interface TruncExpression {
  readonly field: string;
  readonly unit: DateUnit;
}
/** A number of a date of a field in values() (and the groups of annotate()), as Django's ExtractMonth: values({ month: Extract('createdAt', 'month') }). */
export declare const Extract: {
  (field: string, part: DatePart): ExtractExpression;
  new (field: string, part: DatePart): ExtractExpression;
};
/** The start of a unit of a date of a field in values(): a Date (a text YYYY-MM-DD for dates), as Django's TruncMonth. */
export declare const Trunc: {
  (field: string, unit: DateUnit): TruncExpression;
  new (field: string, unit: DateUnit): TruncExpression;
};
/** An item of values(): a name of a field (author__name), or values of dates by key. */
export type ValuesItem = string | Record<string, ExtractExpression | TruncExpression>;

/** An aggregate of a field: Count, Sum, Avg, Min or Max. */
export interface Aggregate<T = number | null> {
  readonly __result?: T;
  fn: string;
  name?: string;
}
/**
 * How many values (non-null) of a field, or how many objects with no field: Count(), Count('books'), Count('tags', {
 * distinct: true }).
 */
export declare function Count(name?: string, options?: { distinct?: boolean }): Aggregate<number>;
/** The sum of the values of a field (null when there are none). */
export declare function Sum(name: string): Aggregate<number | null>;
/** The average of the values of a field (null when there are none). */
export declare function Avg(name: string): Aggregate<number | null>;
/** The least value of a field (null when there are none). */
export declare function Min<T = unknown>(name: string): Aggregate<T | null>;
/** The greatest value of a field (null when there are none). */
export declare function Max<T = unknown>(name: string): Aggregate<T | null>;

/** The values of aggregate(): one for each aggregate, by its name. */
type AggregateResult<A> = { [K in keyof A]: A[K] extends Aggregate<infer T> ? T : never };

/**
 * A query of the objects of a model: lazy (await runs it), chained (filter, exclude, orderBy, selectRelated...), and
 * with its writes (create, update, delete...), as Django's QuerySets.
 */
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
  values<R = Record<string, unknown>>(...names: ValuesItem[]): QuerySet<R>;
  valuesList<R = unknown>(...args: [...ValuesItem[], { flat: true }]): QuerySet<R>;
  valuesList<R extends unknown[] = unknown[]>(...names: ValuesItem[]): QuerySet<R>;
  selectRelated(...names: string[]): QuerySet<T>;
  prefetchRelated(...names: string[]): QuerySet<T>;
  /** Aggregates of Count, Sum... or Raw('SUM(CASE WHEN ... END)') (SQL databases). */
  annotate<A extends Record<string, Aggregate<unknown>>>(
    aggregates: A
  ): QuerySet<Record<string, unknown> & AggregateResult<A>>;
  using(db: Database): QuerySet<T>;
  /** The objects without the fields named (not read), as Django's defer(). */
  defer(...names: string[]): this;
  /**
   * Without names: the rows of values() and valuesList() with the same values once (objects are distinct already).
   * With names: the first object of each group of their values (DISTINCT ON of PostgreSQL), as limitPer(names, 1).
   */
  distinct(...names: string[]): this;
  /**
   * The objects (or values) of this query and of others, each once ({ all: true }: as many times as they come). Of
   * one model without slices: one query, its conditions ORed (a QuerySet); otherwise each runs and they are merged.
   */
  union(...others: (QuerySet<T> | CombinedQuerySet<T> | { all?: boolean })[]): QuerySet<T> | CombinedQuerySet<T>;
  /** The rows that are in every other query too (INTERSECT): one query of objects of one model without slices. */
  intersection(...others: (QuerySet<T> | CombinedQuerySet<T>)[]): QuerySet<T> | CombinedQuerySet<T>;
  /** The rows that are in none of the other queries (EXCEPT): one query of objects of one model without slices. */
  difference(...others: (QuerySet<T> | CombinedQuerySet<T>)[]): QuerySet<T> | CombinedQuerySet<T>;
  /** The objects of these keys (or values of a unique field: { field: 'code' }) by key; every object without keys. */
  inBulk(keys?: unknown[], options?: { field?: string }): Promise<Map<unknown, T>>;
  /** Soft deletes: the objects deleted too. */
  withDeleted(): this;
  /** Soft deletes: the objects deleted alone. */
  onlyDeleted(): this;
  /**
   * Locks the rows selected until the end of the transaction (PostgreSQL).
   * Its reads stop when the signal is aborted: they throw its reason, and PostgreSQL cancels the one that runs.
   */
  signal(signal: AbortSignal | null): QuerySet<T>;
  /**
   * Its results kept in the cache of the database until a model it reads is written (every one needs the option
   * cache); ttl in ms (the ttl of the option cache of the model by default).
   */
  cached(options?: { ttl?: number }): QuerySet<T>;
  selectForUpdate(options?: {
    skipLocked?: boolean;
    noWait?: boolean;
    mode?: 'update' | 'share' | 'noKeyUpdate' | 'keyShare';
    of?: 'self';
  }): QuerySet<T>;
  /** The first `count` objects (after `offset`) of every group of values of the fields, in the order of the query. */
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
  /** Deletes the objects (with soft deletes, sets the date they were deleted): their number. */
  delete(): Promise<number>;
  /** Deletes the objects for good, also when the model has soft deletes. */
  forceDelete(): Promise<number>;
  /** Takes back the objects deleted softly that the query matches. */
  restore(): Promise<number>;
}

/** The QuerySet of a many-to-many relation of an object, with the methods that link and unlink objects. */
export declare class RelatedSet<T> extends QuerySet<T> {
  add(...items: Array<T | number | string | Array<T | number | string>>): Promise<void>;
  remove(...items: Array<T | number | string | Array<T | number | string>>): Promise<void>;
  set(items: Array<T | number | string>): Promise<void>;
  clear(): Promise<void>;
}

/** An operation of a migration: createTable, addField, alterField, renameColumn, sql, run... with its options. */
export interface MigrationOperation {
  op: string;
  [key: string]: unknown;
}

/** What the body of a blob can be written as. */
export type BlobBody = Buffer | Uint8Array | string | NodeJS.ReadableStream | AsyncIterable<Buffer | string> | Blob;

/** The body of an object of a blob backend, read when asked. */
export declare class BlobValue {
  readonly key: string | null;
  readonly table: string | null;
  readonly size: number | null;
  readonly contentType: string | null;
  readonly etag: string | null;
  readonly updatedAt: Date | null;
  stream(): Promise<NodeJS.ReadableStream>;
  buffer(): Promise<Buffer>;
  text(encoding?: BufferEncoding): Promise<string>;
  json<T = unknown>(): Promise<T>;
  /** A URL that reads it without the app (signed, where the store has them; disk: its url option). */
  url(options?: { expiresIn?: string | number }): Promise<string>;
  toJSON(): { size: number | null; contentType: string | null; etag: string | null };
}

/** The options of the audit log of a database (`audit: true` for every model, without redactions or retention). */
export interface AuditOptions {
  /** The models audited (classes or names): all of them by default. */
  models?: ReadonlyArray<ModelClass | string>;
  /** Models not audited. */
  exclude?: ReadonlyArray<ModelClass | string>;
  /** Names of fields whose values are not kept, in any model (encrypted fields are redacted too). */
  redact?: readonly string[];
  /** How long entries are kept (seconds, or text as '365d'): db.expire() deletes older ones. */
  retain?: number | string;
}

/** A change of a field: `from` missing when it was added, `to` when removed, `path` inside json fields. */
export interface AuditChange {
  field: string;
  path?: Array<string>;
  from?: unknown;
  to?: unknown;
  /** Redacted: it changed, its values are not kept. */
  redacted?: true;
}

/** An entry of the audit log (the table xufa_audit of each audited database). */
export declare class AuditEntry extends Model {
  id: number | string;
  at: Date;
  /** create, update, delete, upsert, or the action of log(). */
  action: string;
  model: string | null;
  /** The primary key as text (the JSON of the values of a composite one). */
  key: string | null;
  changes: AuditChange[] | null;
  data: unknown;
  actor: string | null;
  context: Record<string, unknown> | null;
}

/** Who acts and in what context: actor and context may be functions, asked when an entry is made. */
export interface AuditContext {
  actor?: string | number | null | (() => string | number | null | undefined);
  context?: Record<string, unknown> | (() => Record<string, unknown> | undefined);
  [key: string]: unknown;
}

/** The audit log of a database (db.audit, with the option audit). */
export declare class Audit {
  readonly retain: number | null;
  /** Whether the changes of a model are audited. */
  audits(meta: Meta): boolean;
  /** Runs fn with an actor and a context (merged with those of the code that runs it). */
  with<T>(context: AuditContext, fn: () => T): T;
  /**
   * Runs fn, several writes that are one change: one entry for each object (the first value before and the last after of
   * each field; a field back where it was is no change), written when fn ends.
   */
  group<T>(fn: () => Promise<T> | T): Promise<T>;
  /** An event of your own: of the database, or of an object. */
  log(action: string, data?: unknown, options?: { object?: Model }): Promise<void>;
  /** The entries, oldest first. */
  entries(filter?: {
    model?: ModelClass | string;
    key?: unknown;
    action?: string;
    actor?: string | number | null;
    since?: Date;
    until?: Date;
  }): QuerySet<AuditEntry>;
  /** The entries of an object, oldest first. */
  history(object: Model): QuerySet<AuditEntry>;
  /** The entries of this database over HTTP, read only (auditResource() with this database). */
  resource(options: Omit<ResourceOptions<AuditEntry>, 'auth'> & { auth: unknown }): (app: any) => Promise<void>;
  /** Deletes the entries older than retain (db.expire() calls it); their number. */
  expire(now?: Date): Promise<number>;
}

/**
 * The options of a database: backend (sqlite, postgres, mongodb, memory, fs, or stores of objects), and those of each
 * backend (url, filename, dir...), with audit and cache.
 */
export interface DatabaseOptions {
  /** The audit log of the changes of its objects (db.audit): true, or its options. */
  audit?: boolean | AuditOptions;
  backend?:
    | 'memory'
    | 'fs'
    | 'sqlite'
    | 'postgres'
    | 'mongodb'
    | 'disk'
    | 'memory-blob'
    | 's3'
    | 'azure-blob'
    | 'smtp'
    | 'memory-mail'
    | Backend
    | (new (options: Record<string, unknown>) => Backend);
  /** fs: the folder of the files; disk: the folder of the objects (a folder for each model). */
  dir?: string;
  /** disk: the URL of an object where the folder is served (BlobValue.url()). smtp: smtp:// or smtps://. */
  url?: string | ((table: string, key: string) => string);
  /** smtp: the server (localhost); or the url smtp://user:password@host:port (smtps:// for TLS from the start). */
  host?: string;
  /** smtp: its port (587; 465 is TLS from the start). */
  port?: number;
  /** smtp: TLS from the start (true for port 465); otherwise STARTTLS is used when the server offers it. */
  secure?: boolean;
  /** smtp: the credentials (PLAIN or LOGIN), or a user and an OAuth 2 access token (XOAUTH2). */
  auth?: { user: string; pass: string } | { user: string; accessToken: string };
  /** smtp, memory-mail: the sender of the messages whose model has no `from`. */
  from?: string;
  /** smtp: the name of this machine in EHLO (its hostname). */
  clientName?: string;
  /** smtp: options of tls.connect (ca, rejectUnauthorized, servername...). */
  tls?: import('node:tls').ConnectionOptions;
  /** smtp: refuse a server that offers no STARTTLS. */
  requireTLS?: boolean;
  /** smtp: do not use STARTTLS. */
  ignoreTLS?: boolean;
  /** smtp: ms to connect (10 s), and to wait for an answer (60 s). */
  connectionTimeout?: number;
  socketTimeout?: number;
  /** smtp: the connections kept: maxConnections at once (3), maxMessages each (100), closed after idleTimeout ms. */
  pool?: { maxConnections?: number; maxMessages?: number; idleTimeout?: number };
  /** s3: the bucket of the objects (those of a model under <prefix><table>/). */
  bucket?: string;
  /** s3: its region (AWS_REGION, or us-east-1). */
  region?: string;
  /**
   * s3: the URL of a store that is not AWS (R2, MinIO...): the bucket goes in the path. azure-blob: the URL of the
   * blob service (https://<account>.blob.core.windows.net, or Azurite's).
   */
  endpoint?: string;
  /** s3: the bucket in the path on AWS too. */
  forcePathStyle?: boolean;
  /** s3: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN when not given. */
  credentials?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
  /** azure-blob: the container of the blobs (those of a model under <prefix><table>/). */
  container?: string;
  /** azure-blob: the account as a connection string (AZURE_STORAGE_CONNECTION_STRING; UseDevelopmentStorage=true). */
  connectionString?: string;
  /** azure-blob: the name of the account (AZURE_STORAGE_ACCOUNT). */
  account?: string;
  /** azure-blob: the key of the account (AZURE_STORAGE_KEY): it signs the requests and the URLs (Shared Key, SAS). */
  accountKey?: string;
  /** azure-blob: a SAS of the account or the container, instead of the key (sent in the query of every request). */
  sasToken?: string;
  /** azure-blob: the bytes of each block of the uploads of streams (8 MiB). */
  blockSize?: number;
  /** azure-blob: sync() makes the container when it is not there. */
  createContainer?: boolean;
  /** s3, azure-blob: before the keys of every model (''). */
  prefix?: string;
  /** s3: the bytes of each part of the uploads of streams (8 MiB; at least 5 MiB). */
  partSize?: number;
  /** s3, azure-blob: where the objects are public (a CDN): url() gives it, not a signed URL. */
  publicUrl?: string;
  /** s3: sync() makes the bucket when it is not there. */
  createBucket?: boolean;
  /** s3, azure-blob: another fetch. */
  fetch?: typeof fetch;
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
  /** A cache that fails to read or keep (a miss: the database answers): told here (a warning once, else). */
  onCacheError?: (error: unknown, info: { operation: 'get' | 'set' }) => void;
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

/** The options of a cache in memory: max (keys kept) and ttl (ms). */
export interface MemoryCacheOptions {
  /** Keys kept at most; the least recently used go first (10000). */
  max?: number;
  /** ms a value is kept (0: until evicted). */
  ttl?: number;
}

/** In the process: an LRU of `max` keys, whose values expire after `ttl` ms. */
export declare class MemoryCache implements Cache {
  constructor(options?: MemoryCacheOptions);
  /** Its faults: get, set, delete and clear made to fail, wait or hang (a read that fails is a miss). */
  readonly faults: CacheFaults;
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

/**
 * The options of a cache shared by the processes of a cluster (through a bus): a name, and those of the memory cache.
 */
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
  readonly faults: CacheFaults;
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  delete(keys: string | string[]): Promise<void>;
  clear(prefix?: string): Promise<void>;
}

/**
 * The options of a cache of each process, kept right by invalidations sent through a bus: a name, and those of the
 * memory cache.
 */
export interface LocalCacheOptions extends MemoryCacheOptions {
  bus: CacheBus;
  /** Caches of different names do not share their invalidations ('default'). */
  name?: string;
}

/** A copy in each process (reads do not leave it); deletes and clears reach the copies of the others. */
export declare class LocalCache extends MemoryCache {
  constructor(options: LocalCacheOptions);
}

// --- Faults: operations made to fail, wait or hang, for tests of resilience.

/** The operations of a database that faults can affect. */
export type FaultOperation =
  'select' | 'count' | 'aggregate' | 'insert' | 'update' | 'delete' | 'transaction' | 'connect';

/**
 * Which operations a fault affects: operations, models, tenants, a rate, after (the first ones pass), times and for
 * (ms).
 */
export interface FaultOptions {
  /** The operations (read: select, count, aggregate; write: insert, update, delete). All but connect by default. */
  operations?: FaultOperation | 'read' | 'write' | Array<FaultOperation | 'read' | 'write'>;
  /** Models (classes or names). */
  models?: ModelClass<any> | string | Array<ModelClass<any> | string>;
  /** Tenants (of tenants.faults). */
  tenants?: string | string[];
  /** The chance of each match (0 to 1): faults.random() below it. */
  rate?: number;
  /** The first n matches are left alone. */
  after?: number;
  /** Removed after n hits. */
  times?: number;
}

/** The options of fail(): the error thrown (or its message), and those of every fault. */
export interface FailOptions extends FaultOptions {
  /** The error thrown: an error, or a function of the operation (a FaultError by default). */
  error?: Error | ((context: { operation: FaultOperation; model: string | null; tenant: string | null }) => Error);
  message?: string;
}

/**
 * A fault in place (db.faults.fail(), delay(), hang(), down()): its kind, how many operations it affected, and
 * remove().
 */
export interface FaultRule {
  readonly kind: 'fail' | 'delay' | 'hang' | 'down';
  /** The operations it affected. */
  readonly hits: number;
  readonly active: boolean;
  remove(): this;
  /** The operations it holds (hang) go on. */
  release(): this;
}

/** The faults of a database (db.faults), for tests of resilience: operations made to fail, wait or hang on purpose. */
export declare class Faults {
  readonly rules: FaultRule[];
  /** Math.random; a function of your own in tests. */
  random: () => number;
  fail(options?: FailOptions): FaultRule;
  delay(options: FaultOptions & { ms: number; jitter?: number }): FaultRule;
  hang(options?: FaultOptions): FaultRule;
  /** Every operation (connect too) fails until up(). */
  down(options?: FaultOptions): FaultRule;
  up(): this;
  clear(): this;
}

/** The error of a fault: code XUFA_ORM_ERR_FAULT, status 503. */
export declare class FaultError extends Error {
  readonly code: 'XUFA_ORM_ERR_FAULT';
  readonly statusCode: 503;
  readonly operation: FaultOperation;
  readonly model: string | null;
  readonly tenant: string | null;
}

/**
 * A database: its backend, the models registered in it, sync() and migrations, transactions, the audit log, caches and
 * faults.
 */
export declare class Database {
  /** The options of a database from a URL (postgres://, mongodb://, sqlite:path, memory:, fs:folder, smtp://), with options over them. */
  static optionsFromUrl(url: string, options?: DatabaseOptions): DatabaseOptions;
  /** A database from a URL, as DATABASE_URL. */
  static fromUrl(url: string, options?: DatabaseOptions): Database;
  constructor(options?: DatabaseOptions);
  /** Faults of its operations, for tests of resilience. */
  readonly faults: Faults;
  /** The audit log of the changes of its objects (the option audit), or null. */
  readonly audit: Audit | null;
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
  /** A round trip to the database (SELECT 1, MongoDB's ping; nothing for memory and files): its milliseconds. Throws when it does not answer. */
  ping(): Promise<number>;
  /** A check of xufa.health: up with the latency of a ping (degraded above slow), down when it does not answer. Critical. */
  health(options?: { slow?: number | string; critical?: boolean; timeout?: number | string }): DatabaseHealthCheck;
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
  /** Deletes the objects of TTL indexes that expired: the number deleted, by model. */
  expire(options?: { now?: Date }): Promise<Record<string, number>>;
  /** MongoDB: converts the decimals written as strings to Decimal128, in the server; the number of values by model. */
  migrateDecimals(): Promise<Record<string, number>>;
  /** Calls expire() every interval (seconds or text: '1m') until stopExpiry() or close(). */
  startExpiry(options?: { interval?: number | string; onError?: (err: Error) => void }): this;
  stopExpiry(): void;
}

/**
 * Several databases by name, and the models routed to them: the option `database` of a model, its route, or the
 * default one. Relations across them are followed with more queries; a query cannot join them.
 */
export declare class Databases {
  /** Faults of the operations of every database of these. */
  readonly faults: Faults;
  constructor(
    config: Record<string, DatabaseOptions | Database>,
    options?: { routes?: Record<string, string>; defaultName?: string }
  );
  readonly databases: Map<string, Database>;
  readonly models: Map<string, ModelClass>;
  get(name?: string): Database;
  /** The name of the database of a model, and the database it is registered in (null when none). */
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

/**
 * What config(tenantId) gives: the options of one database, a Database, a Databases, or several databases with the
 * routes of the models (over those of the Tenants).
 */
export type TenantConfig =
  | DatabaseOptions
  | Database
  | Databases
  | { databases: Record<string, DatabaseOptions | Database>; routes?: Record<string, string>; defaultName?: string };

/** A database (or several) for each tenant, opened the first time it is used; code run in a tenant uses it. */
export interface CachedOptions<A extends unknown[]> {
  /** A cache that fails to read or keep (the function runs): told here (a warning once, else). */
  onCacheError?: (error: unknown, info: { operation: 'get' | 'set' }) => void;
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

/** A function whose results are cached (orm.cached()), with invalidate() of some arguments or all. */
export type CachedFunction<F extends (...args: any[]) => Promise<any>> = F & {
  /** Forgets the result of some arguments. */
  invalidate(...args: Parameters<F>): Promise<void>;
  /** Forgets every result. */
  clear(): Promise<void>;
};

/**
 * A function whose results are kept: the same arguments give the result kept, and calls made while one runs wait
 * for it. Errors are not kept.
 */
export declare function cached<F extends (...args: any[]) => Promise<any>>(
  fn: F,
  options?: CachedOptions<Parameters<F>>
): CachedFunction<F>;

/** Runs fn with the reads of its queries stopped when the signal is aborted (writes are not stopped). */
export declare function withSignal<R>(signal: AbortSignal, fn: () => R): R;

/**
 * Tenants, each with its own database or databases: config(id) says where, run(id, fn) runs code in one, and the
 * databases of the tenants used last are kept open.
 */
export declare class Tenants {
  /** Faults of the databases of every tenant (rules can name tenants). */
  readonly faults: Faults;
  constructor(options: {
    models?: ModelClass<any>[];
    config: (tenantId: string) => TenantConfig | null | undefined | Promise<TenantConfig | null | undefined>;
    setup?: (db: Database | Databases, tenantId: string) => unknown;
    /** The databases of tenants kept open (the last used). */
    max?: number;
    /** The databases of the models, for the tenants with several. */
    routes?: Record<string, string>;
  });
  database(tenantId: string): Promise<Database | Databases>;
  run<R>(tenantId: string, fn: () => R | Promise<R>): Promise<R>;
  enter(tenantId: string): Promise<Database | Databases>;
  close(): Promise<void>;
}

/**
 * A backend of the ORM: how the queries of the models run on a kind of database. Extend it for a backend of your own
 * (Database.registerBackend()).
 */
export declare class Backend {
  constructor(options?: Record<string, unknown>);
  readonly name: string;
  readonly inTransaction: boolean;
  connect(): Promise<void>;
  close(): Promise<void>;
  ping(): Promise<boolean>;
  transaction<R>(fn: () => R | Promise<R>): Promise<R>;
  raw?(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
}

/** An error of the ORM: its code (XUFA_ORM_ERR_*) and the status of HTTP it gives in a route. */
export interface OrmError extends Error {
  code: string;
  statusCode?: number;
}

/** A validation error: its messages by field (__all__: those of the model), as Django's message_dict. */
export interface ValidationErrorInstance extends OrmError {
  errors: Record<string, string[]>;
}

/** A class of errors of the ORM (instanceof works; it can be called without new). */
type ErrorClass<E = OrmError> = (new (...args: unknown[]) => E) & ((...args: unknown[]) => E);

/** Values that are not valid (400): errors gives the messages by field. */
export declare const ValidationError: ErrorClass<ValidationErrorInstance>;
/** A field that the model does not have (in a query, or in the data of an object). */
export declare const FieldError: ErrorClass;
/** A lookup that a field does not take (filter({ name__gt: ... }) on an encrypted field...). */
export declare const LookupError: ErrorClass;
/** get() found no object (404), as Django's DoesNotExist. */
export declare const NotFoundError: ErrorClass;
/** get() found more than one object, as Django's MultipleObjectsReturned. */
export declare const MultipleObjectsError: ErrorClass;
/** A model used before it is registered in a database. */
export declare const NotRegisteredError: ErrorClass;
/** A model defined wrongly (its fields or options). */
export declare const ModelError: ErrorClass;
/**
 * A query that cannot be made (a reverse relation where it cannot be followed, an option that does not go with
 * another...).
 */
export declare const QueryError: ErrorClass;
/** A delete refused: objects with a foreign key of onDelete: 'protect' point to the objects deleted. */
export declare const ProtectedError: ErrorClass;
/** An error of the database or its driver. */
export declare const BackendError: ErrorClass;
/** What a backend does not do (fragments of SQL in MongoDB...). */
export declare const UnsupportedError: ErrorClass;
/** A write that would duplicate a unique field or key: 409, with the names of the fields and the model. */
export interface UniqueErrorInstance extends OrmError {
  model: string;
  fields: string[];
}
/** A write that breaks a unique field or index (409): the model and the fields. */
export declare const UniqueError: ErrorClass<UniqueErrorInstance>;
/** An encrypted value that cannot be read (its key is not in the keyring, it was changed), or no keys to encrypt. */
export declare const EncryptionError: ErrorClass;
/** A recipient a server of mail refused: its address, the code and the text of the answer. */
export interface MailRejection {
  address: string;
  code: number;
  response: string;
}
/**
 * A message of a mail backend that could not be sent: 400 when the message is wrong (an address, a header), 502 when
 * the server refused it or could not be reached, with its answer.
 */
export interface MailErrorInstance extends OrmError {
  responseCode?: number;
  response?: string;
  rejected?: MailRejection[];
  timeout?: boolean;
}
/** A message that could not be sent (400: the message; 502: the server), with the answer of the server. */
export declare const MailError: ErrorClass<MailErrorInstance>;

/** The keys of encrypted fields: 32 bytes each (Buffers, or base64 or hex text), by id; the current one encrypts. */
export type EncryptionKey = string | Buffer | Uint8Array;

/** The keys of encrypted fields, by id: the first (or current) encrypts, all of them decrypt (setEncryptionKeys()). */
export declare class Keyring {
  constructor(options: EncryptionKey | { current?: string; keys: Record<string, EncryptionKey> });
  current: string;
  seal(plaintext: Buffer, context: string, deterministic?: boolean): string;
  open(text: string, context: string): Buffer;
}

/** Sets the keyring of the process (null: none; then XUFA_ENCRYPTION_KEYS='k2:<base64>,k1:<base64>' is read). */
export declare function setEncryptionKeys(
  options: Keyring | EncryptionKey | { current?: string; keys: Record<string, EncryptionKey> } | null
): Keyring | null;
/** 32 random bytes in base64. */
export declare function generateEncryptionKey(): string;
/** Whether a stored value is encrypted text ($xenc$...). */
export declare function isEncrypted(value: unknown): value is string;
/** Writes the encrypted fields of every object again with the current key: the number of objects written. */
export declare function reencrypt(
  Model: ModelClass,
  options?: { fields?: string[]; batchSize?: number }
): Promise<number>;

/**
 * The options of the plugin of @xufa/http (orm.plugin): the database or tenants (the tenant of each request), connect
 * and close with the app, sync, migrate and expire at start, cancel (reads stopped when the client goes away), the
 * actor and context of the audit log, and the error handler of the errors of the ORM.
 */
export interface PluginOptions {
  /** The database of the app (app.db), or tenants (a database for each). */
  database?: Database;
  /** Each request in its tenant (resolve gives its id); without one, 400 when required (the default), 404 when unknown. */
  tenants?: {
    tenants: Tenants;
    resolve(request: any): string | number | null | undefined;
    required?: boolean;
    /** Whether the request may use the tenant, before it is entered: false is a 403, an error is sent as it is.
     * With @xufa/auth: (request, id, reply) => app.auth.canUseTenant(request, id, reply). false: no check (a tenant
     * taken from the user); without it, a warning says any request may use any tenant. */
    authorize?: ((request: any, tenant: string, reply: any) => boolean | Promise<boolean>) | false;
  };
  /**
   * The reads of a request stop when its client goes away (request.signal): those not started throw, and PostgreSQL
   * cancels the one that runs. Writes are not stopped.
   */
  cancel?: boolean;
  /** The actor (the user) and context (ip, request id...) of the entries of the audit log of each request. */
  audit?: { actor?: (request: any) => unknown; context?: (request: any) => Record<string, unknown> | undefined };
  connect?: boolean;
  close?: boolean;
  migrate?: { dir: string; to?: string };
  sync?: boolean;
  errorHandler?: boolean;
  /** Deletes the objects of TTL indexes that expired while the app runs (true: every minute). */
  expire?: boolean | { interval?: number | string; onError?: (err: Error) => void };
}

/**
 * The routes of a resource: list (GET /), get (GET /:id), create (POST /), update (PUT, PATCH /:id) and delete (DELETE
 * /:id).
 */
export type ResourceAction = 'list' | 'get' | 'create' | 'update' | 'delete';

/**
 * The options of orm.resource(): the actions, the fields given and taken (fields, exclude, writable, readOnly, strict),
 * filters, search and ordering by query string, pagination and page sizes, related objects, the lookup of /:id, auth
 * rules by action, hooks and the OpenAPI document.
 */
export interface ResourceOptions<T extends Model = Model> {
  /**
   * The actions given (all of them by default): list (GET /), get (GET /:id), create (POST /), update (PUT and PATCH
   * /:id) and delete (DELETE /:id).
   */
  actions?: ResourceAction[];
  /**
   * The documentation of its routes for @xufa/openapi (their config openapi): true by default; { tag } names their
   * tag (the name of the model by default), { component } the schema of its object in components/schemas (the name of
   * the model by default; a name taken by another schema keeps the object inline); false leaves it out.
   */
  openapi?: boolean | { tag?: string; component?: string };
  /**
   * Keys of bodies that are not writable (id, createdAt...) are refused instead of ignored, every key refused in one
   * ValidationError (400 with errors by key); in an update, one with the value the object has is taken.
   */
  strict?: boolean;
  /** The objects of a request (all by default): those out of it are not found by any route. */
  queryset?(request: any): QuerySet<T>;
  /** The fields answered (all of them by default), or all but `exclude`. */
  fields?: string[];
  exclude?: string[];
  /** The fields a body sets (every one but the primary key and those set by the ORM by default), or all but readOnly. */
  writable?: string[];
  readOnly?: string[];
  /** The filters of lists, as query parameters: ['author', 'pages__gte'] or { pages: ['gte', 'lte'] }. */
  filters?: string[] | Record<string, string | string[]>;
  /** The fields lists can be ordered by (?ordering=-pages,title). */
  ordering?: string[];
  /** The fields ?search= looks into (icontains, any of them). */
  search?: string[];
  /** Related objects loaded with the objects (selectRelated). */
  related?: string[];
  /** ?limit (pageSize by default, maxPageSize at most) and ?offset; pagination: false answers arrays. */
  pageSize?: number;
  maxPageSize?: number;
  pagination?: boolean;
  /** The field of /:id ('pk' by default). */
  lookup?: string;
  /** The rule of @xufa/auth of every action (config.auth of its routes), or one by action. */
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
  /** How an object is answered (its toJSON() by default). */
  serialize?(object: T, request: any): unknown;
}

/** The routes of the objects of a model, to register with a prefix: app.register(resource(Book), { prefix: '/books' }). */
export declare function resource<T extends Model>(
  model: ModelClass<T>,
  options?: ResourceOptions<T>
): (app: any) => Promise<void>;

/**
 * The entries of the audit log over HTTP, read only (GET / and GET /:id), newest first, filtered by model, key, action,
 * actor and date (?at__gte=, ?at__lt=); with tenants, those of the tenant of the request. auth is required: a rule of
 * @xufa/auth, or false to leave it open. app.register(auditResource({ auth: 'admin' }), { prefix: '/audit' }).
 */
export declare function auditResource(
  options: Omit<ResourceOptions<AuditEntry>, 'auth'> & {
    auth: unknown;
    /** The database whose entries it gives (db.audit.resource() gives its own); the one of each request otherwise. */
    database?: Database;
  }
): (app: any) => Promise<void>;

/** The plugin for @xufa/http (and fastify): app.register(plugin, { database }). */
export declare function plugin(app: any, options: PluginOptions): Promise<void>;

// To type app.db, augment the instance of @xufa/http in your project:
//   declare module '@xufa/http' { interface XufaInstance { db: Database } }

/**
 * A value of a factory: a constant, a function of the number of the object and the values made before it (async too),
 * or another factory (an object of it is made and saved for each).
 */
export type FactoryValue = unknown | ((n: number, values: Record<string, unknown>) => unknown) | Factory<any>;

/** The values of the fields of a factory (or of a state of it). */
export type FactoryDefinition = Record<string, FactoryValue>;

/** Factories of objects for tests and seeds, as Laravel's model factories: factory(Model, values, { states }). */
export declare class Factory<M extends Model> {
  readonly model: ModelClass<M>;
  /** With the values of states (their names) or values given. */
  state(...states: Array<string | FactoryDefinition>): Factory<M>;
  /** Making its objects in another database. */
  using(db: Database): Factory<M>;
  /** An object, not saved (values that are factories left out). */
  make(values?: FactoryDefinition): Promise<M>;
  makeMany(count: number, values?: FactoryDefinition): Promise<M[]>;
  /** An object, saved. */
  create(values?: FactoryDefinition): Promise<M>;
  /** Objects, saved with bulkCreate. */
  createMany(count: number, values?: FactoryDefinition): Promise<M[]>;
}

/** A factory of the objects of a model. */
export declare function factory<M extends Model>(
  model: ModelClass<M> | (abstract new (...args: any[]) => M),
  definition: FactoryDefinition,
  options?: { states?: Record<string, FactoryDefinition> }
): Factory<M>;

/** A value of a factory that goes through a list: sequence(['red', 'green']) gives red, green, red... */
export declare function sequence<T>(items: T[]): (n: number) => T;

/** A check of xufa.health of @xufa/http (checks: { name: x.health() }): what its check gives, and whether it is critical. */
export interface DatabaseHealthCheck {
  check(): Promise<{ status: 'up' | 'degraded' | 'down'; error?: string } & { latency?: number }>;
  critical: boolean;
  timeout?: number | string;
}

/** The state of the maintenance mode of an app (what xufa down writes). */
export interface MaintenanceState {
  message?: string;
  /** Seconds (the header Retry-After). */
  retryAfter?: number;
  /** The path that gives a browser a cookie to go through. */
  secret?: string;
  /** Addresses that go through. */
  allow?: string[];
  redirect?: string;
  since?: string;
}

/**
 * The maintenance mode kept in the database, so every machine of the app sees it (xufa down --everywhere): the store
 * of the plugin xufa.maintenance of @xufa/http. Its model (table xufa_maintenance) is registered in db.
 */
export declare function maintenance(
  db: Database,
  options?: { key?: string; table?: string; model?: string }
): {
  model: ModelClass<Model>;
  /** The state, or null when the app is up. */
  get(): Promise<MaintenanceState | null>;
  set(state?: MaintenanceState): Promise<MaintenanceState>;
  /** Whether it was on. */
  clear(): Promise<boolean>;
};

/** A union(), intersection() or difference() of queries that run each and are combined: ordered, sliced, counted and awaited. */
export declare class CombinedQuerySet<T> implements PromiseLike<T[]>, AsyncIterable<T> {
  readonly op: 'union' | 'intersection' | 'difference';
  orderBy(...names: string[]): CombinedQuerySet<T>;
  limit(count: number): CombinedQuerySet<T>;
  offset(count: number): CombinedQuerySet<T>;
  slice(start: number, end?: number): CombinedQuerySet<T>;
  union(...others: (QuerySet<T> | CombinedQuerySet<T> | { all?: boolean })[]): QuerySet<T> | CombinedQuerySet<T>;
  /** The rows that are in every other query too (INTERSECT): one query of objects of one model without slices. */
  intersection(...others: (QuerySet<T> | CombinedQuerySet<T>)[]): QuerySet<T> | CombinedQuerySet<T>;
  /** The rows that are in none of the other queries (EXCEPT): one query of objects of one model without slices. */
  difference(...others: (QuerySet<T> | CombinedQuerySet<T>)[]): QuerySet<T> | CombinedQuerySet<T>;
  count(): Promise<number>;
  exists(): Promise<boolean>;
  first(): Promise<T | null>;
  then<R1 = T[], R2 = never>(
    onfulfilled?: ((value: T[]) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2>;
  [Symbol.asyncIterator](): AsyncIterator<T>;
}
