// The types of the builder (s): each schema made carries the type of its values (Infer), and SchemaTypeProvider types
// the routes of @xufa/http and fastify by their schemas.

declare const kType: unique symbol;
declare const kOptional: unique symbol;

/** A JSON Schema of values of type T. */
export interface TSchema<T = unknown> {
  readonly [kType]?: T;
  [keyword: string]: any;
}

/** A schema of a property that is not required (s.optional()). */
export interface TOptional<T = unknown> extends TSchema<T> {
  readonly [kOptional]: true;
}

/** The type of the values of a schema made by s (Infer, of the package, takes every kind of schema). */
export type InferBuilt<S> = S extends TSchema<infer T> ? T : unknown;

/** Whether a type is a schema made by s (it has the mark of its type). */
export type IsBuilt<S> = typeof kType extends keyof S ? true : false;

type Simplify<T> = { [K in keyof T]: T[K] } & {};
type OptionalKeys<P> = { [K in keyof P]: P[K] extends TOptional<any> ? K : never }[keyof P];
type RequiredKeys<P> = Exclude<keyof P, OptionalKeys<P>>;
type ObjectOf<P> = Simplify<
  { [K in RequiredKeys<P>]: InferBuilt<P[K]> } & { [K in OptionalKeys<P>]?: InferBuilt<P[K]> }
>;
type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (x: infer I) => void ? I : never;
type PartialProps<P> = { [K in keyof P]: P[K] extends TSchema<infer T> ? TOptional<T> : P[K] };
type RequiredProps<P> = { [K in keyof P]: P[K] extends TSchema<infer T> ? TSchema<T> : P[K] };

/** The schema of an object (s.object()), with its properties. */
export interface TObject<P extends Record<string, TSchema> = Record<string, TSchema>> extends TSchema<ObjectOf<P>> {
  type: 'object';
  properties: P;
  required?: string[];
}

/** Keywords of every schema. */
export interface JsonSchemaOptions {
  $id?: string;
  title?: string;
  description?: string;
  default?: unknown;
  examples?: unknown[];
  readOnly?: boolean;
  writeOnly?: boolean;
  deprecated?: boolean;
  [keyword: string]: unknown;
}
export interface JsonStringOptions extends JsonSchemaOptions {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
}
export interface JsonNumberOptions extends JsonSchemaOptions {
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
}
export interface ArrayOptions extends JsonSchemaOptions {
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
}
export interface ObjectOptions extends JsonSchemaOptions {
  /** false: keys that are not properties are refused (or removed, as removeAdditional does). */
  additionalProperties?: boolean | TSchema;
  minProperties?: number;
  maxProperties?: number;
}

type Literal = string | number | boolean | null;

export interface SchemaBuilder {
  string(options?: JsonStringOptions): TSchema<string>;
  number(options?: JsonNumberOptions): TSchema<number>;
  integer(options?: JsonNumberOptions): TSchema<number>;
  boolean(options?: JsonSchemaOptions): TSchema<boolean>;
  null(options?: JsonSchemaOptions): TSchema<null>;
  /** Texts of formats: a date is its text in JSON. */
  dateTime(options?: JsonStringOptions): TSchema<string>;
  date(options?: JsonStringOptions): TSchema<string>;
  email(options?: JsonStringOptions): TSchema<string>;
  uuid(options?: JsonStringOptions): TSchema<string>;
  uri(options?: JsonStringOptions): TSchema<string>;
  literal<const V extends Literal>(value: V, options?: JsonSchemaOptions): TSchema<V>;
  enum<const V extends readonly (string | number | boolean)[]>(
    values: V,
    options?: JsonSchemaOptions
  ): TSchema<V[number]>;
  array<S extends TSchema>(items: S, options?: ArrayOptions): TSchema<InferBuilt<S>[]>;
  tuple<const S extends readonly TSchema[]>(
    items: S,
    options?: JsonSchemaOptions
  ): TSchema<{ -readonly [I in keyof S]: InferBuilt<S[I]> }>;
  object<P extends Record<string, TSchema>>(properties: P, options?: ObjectOptions): TObject<P>;
  record<S extends TSchema>(values: S, options?: ObjectOptions): TSchema<Record<string, InferBuilt<S>>>;
  union<const S extends readonly TSchema[]>(schemas: S, options?: JsonSchemaOptions): TSchema<InferBuilt<S[number]>>;
  intersect<const S extends readonly TSchema[]>(
    schemas: S,
    options?: JsonSchemaOptions
  ): TSchema<Simplify<UnionToIntersection<InferBuilt<S[number]>>>>;
  /** A property that is not required (in s.object()). */
  optional<S extends TSchema>(schema: S): S & TOptional<InferBuilt<S>>;
  /** Values that can be null too. */
  nullable<S extends TSchema>(
    schema: S
  ): S extends TOptional<any> ? TOptional<InferBuilt<S> | null> : TSchema<InferBuilt<S> | null>;
  pick<P extends Record<string, TSchema>, const K extends keyof P>(
    schema: TObject<P>,
    keys: readonly K[]
  ): TObject<Pick<P, K>>;
  omit<P extends Record<string, TSchema>, const K extends keyof P>(
    schema: TObject<P>,
    keys: readonly K[]
  ): TObject<Omit<P, K>>;
  /** All the properties not required (the body of an update). */
  partial<P extends Record<string, TSchema>>(schema: TObject<P>): TObject<PartialProps<P>>;
  /** All the properties required. */
  required<P extends Record<string, TSchema>>(schema: TObject<P>): TObject<RequiredProps<P>>;
  /** More properties (those given replace those of the same name). */
  extend<P extends Record<string, TSchema>, Q extends Record<string, TSchema>>(
    schema: TObject<P>,
    properties: Q,
    options?: ObjectOptions
  ): TObject<Simplify<Omit<P, keyof Q> & Q>>;
  /** A shared schema (app.addSchema of one with its $id): its type is the one given. */
  ref<T = unknown>(id: string, options?: JsonSchemaOptions): TSchema<T>;
  any(options?: JsonSchemaOptions): TSchema<any>;
  unknown(options?: JsonSchemaOptions): TSchema<unknown>;
  never(options?: JsonSchemaOptions): TSchema<never>;
}

export declare const s: SchemaBuilder;

/** Whether a schema was given to s.optional(). */
export function isOptional(schema: unknown): boolean;
export declare const OPTIONAL: unique symbol;

/**
 * The type provider of @xufa/http (and fastify): routes typed by their schemas of @xufa/schema.
 *
 *   const app = xufa().withTypeProvider<SchemaTypeProvider>();
 *   app.post('/books', { schema: { body: NewBook } }, async (request) => request.body.title); // string
 */
export interface SchemaTypeProvider {
  readonly schema: unknown;
  readonly validator: this['schema'] extends TSchema ? InferBuilt<this['schema']> : unknown;
  readonly serializer: this['schema'] extends TSchema ? InferBuilt<this['schema']> : unknown;
}
