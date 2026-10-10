// Ported from fastify (types/schema.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { ValidatorFactory } from './compilers';
import { SerializerFactory } from './compilers';
import { XufaInstance, SafePromiseLike } from '../index.cjs';
/**
 * Schemas in Xufa follow the JSON-Schema standard. For this reason
 * we have opted to not ship strict schema based types. Instead we provide
 * an example in our documentation on how to solve this problem. Check it
 * out here: https://github.com/fastify/fastify/blob/main/docs/Reference/TypeScript.md#json-schema
 */
export interface XufaSchema {
  body?: unknown;
  querystring?: unknown;
  params?: unknown;
  headers?: unknown;
  response?: unknown;
}

export interface XufaRouteSchemaDef<T> {
  schema: T;
  method: string;
  url: string;
  httpPart?: string;
  httpStatus?: string;
  contentType?: string;
}

export interface XufaSchemaValidationError {
  keyword: string;
  instancePath: string;
  schemaPath: string;
  params: Record<string, unknown>;
  message?: string;
}

export interface XufaValidationResult {
  (data: any): boolean | SafePromiseLike<any> | { error?: Error | XufaSchemaValidationError[]; value?: any };
  errors?: XufaSchemaValidationError[] | null;
}

/**
 * Compiler for XufaSchema Type
 */
export type XufaSchemaCompiler<T> = (routeSchema: XufaRouteSchemaDef<T>) => XufaValidationResult;

export type XufaSerializerCompiler<T> = (routeSchema: XufaRouteSchemaDef<T>) => (data: any) => string;

export interface XufaSchemaControllerOptions {
  bucket?: (parentSchemas?: unknown) => {
    add(schema: unknown): XufaInstance;
    getSchema(schemaId: string): unknown;
    getSchemas(): Record<string, unknown>;
  };
  compilersFactory?: {
    buildValidator?: ValidatorFactory;
    buildSerializer?: SerializerFactory;
  };
}

export type SchemaErrorDataVar = 'body' | 'headers' | 'params' | 'querystring';

export type SchemaErrorFormatter = (errors: XufaSchemaValidationError[], dataVar: SchemaErrorDataVar) => Error;
