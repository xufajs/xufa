// The default compilers of xufa (lib/validator-compiler.js, on @xufa/schema, and lib/serializer-compiler.js, on
// @xufa/serializer): what @fastify/ajv-compiler and @fastify/fast-json-stringify-compiler declare for fastify, without
// ajv. Written for xufa (not ported).
import type { Options as SerializerOptions } from '@xufa/serializer';

/** An error of validation, as ajv reports them (the default validator gives these objects for its errors). */
export interface ErrorObject<K extends string = string, P = Record<string, any>> {
  keyword: K;
  instancePath: string;
  schemaPath: string;
  params: P;
  propertyName?: string;
  message?: string;
  schema?: unknown;
  parentSchema?: object;
  data?: unknown;
}

/**
 * The options of the default validator, given as `ajv.customOptions` (the names of ajv's options it shares with
 * @xufa/schema). Options of the validator itself go in `ajv.validatorOptions`.
 */
export interface ValidatorOptions {
  /** Converts values to the types of their schemas (fastify's default: 'array'). */
  coerceTypes?: boolean | 'array';
  /** Sets the defaults of the schemas (default: true). */
  useDefaults?: boolean | 'empty';
  /** Removes the properties a schema does not allow (default: true). */
  removeAdditional?: boolean | 'all' | 'failing';
  /** Reports every error, not only the first one (default: false). */
  allErrors?: boolean;
  /** Unknown keywords throw (true) or are ignored (false). */
  strict?: boolean;
  strictSchema?: boolean;
  /** Checks the "format" keyword (default: true). */
  formats?: boolean | Record<string, unknown>;
  /** Keywords of your own. */
  keywords?: unknown[];
  [option: string]: unknown;
}

export type HttpPart = 'body' | 'headers' | 'params' | 'querystring';

export interface RouteDefinition {
  method: string;
  url: string;
  httpPart: HttpPart;
  schema?: unknown;
}

/**
 * A validation function: true when the data is valid (or { value } when the value itself was converted), with
 * the errors in `errors` when it is not.
 */
export interface ValidateFunction {
  (data: any): boolean | { value: unknown } | Promise<unknown>;
  errors?: null | ErrorObject[];
  schema?: unknown;
}

export type ValidatorCompiler = (routeDefinition: RouteDefinition) => ValidateFunction;

export interface ValidatorBuildOptions {
  customOptions?: ValidatorOptions;
  /** Options given to @xufa/schema as they are. */
  validatorOptions?: Record<string, unknown>;
  /**
   * Ajv's plugins have no effect in xufa, which validates with @xufa/schema: only an empty list is accepted (as fastify's
   * default). Keywords of your own go in `customOptions.keywords`, or set a validatorCompiler of your own.
   */
  plugins?: [];
}

/** Builds the validator compiler of a set of shared schemas (fastify's buildValidator). */
export type BuildCompilerFromPool = (
  externalSchemas: { [key: string]: unknown },
  options?: ValidatorBuildOptions
) => ValidatorCompiler;

export type ValidatorFactory = BuildCompilerFromPool;

export type { SerializerOptions };

export interface SerializerRouteDefinition {
  method: string;
  url: string;
  httpStatus: string;
  schema?: unknown;
}

/** A response serializer; the ones that write bytes (for arrays and maps) have toBuffer() too. */
export interface Serializer {
  (doc: any): string;
  toBuffer?: (doc: any) => Buffer;
}

export type SerializerCompiler = (routeDefinition: SerializerRouteDefinition) => Serializer;

/** Builds the serializer compiler of a set of shared schemas (fastify's buildSerializer). */
export type SerializerFactory = (externalSchemas?: unknown, options?: SerializerOptions) => SerializerCompiler;
