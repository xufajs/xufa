// Ported from @fastify/error (types/index.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
declare function createError<C extends string, SC extends number, Arg extends unknown[] = [any?, any?, any?]>(
  code: C,
  message: string,
  statusCode: SC,
  Base?: ErrorConstructor,
  captureStackTrace?: boolean
): createError.XufaErrorConstructor<{ code: C; statusCode: SC }, Arg>;

declare function createError<C extends string, Arg extends unknown[] = [any?, any?, any?]>(
  code: C,
  message: string,
  statusCode?: number,
  Base?: ErrorConstructor,
  captureStackTrace?: boolean
): createError.XufaErrorConstructor<{ code: C }, Arg>;

declare function createError<Arg extends unknown[] = [any?, any?, any?]>(
  code: string,
  message: string,
  statusCode?: number,
  Base?: ErrorConstructor,
  captureStackTrace?: boolean
): createError.XufaErrorConstructor<{ code: string }, Arg>;

type CreateError = typeof createError;

declare namespace createError {
  export interface XufaError extends Error {
    code: string;
    name: string;
    statusCode?: number;
  }

  export interface XufaErrorConstructor<
    E extends { code: string; statusCode?: number } = { code: string; statusCode?: number },
    T extends unknown[] = [any?, any?, any?],
  > {
    new (...arg: T): XufaError & E;
    (...arg: T): XufaError & E;
    readonly prototype: XufaError & E;
  }

  export const XufaError: XufaErrorConstructor;

  export const createError: CreateError;

  /** Whether the errors created after this is set capture a stack trace (the default of the fifth argument). */
  export let captureStackTrace: boolean;
  export { createError as default };
}

export = createError;
