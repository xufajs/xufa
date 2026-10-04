// Ported from fastify (types/logger.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { XufaError } from '@xufa/errors';
import { XufaInstance } from './instance';
import { XufaReply } from './reply';
import { XufaRequest } from './request';
import { RouteGenericInterface } from './route';
import { XufaSchema } from './schema';
import { XufaTypeProvider, XufaTypeProviderDefault } from './type-provider';
import {
  ContextConfigDefault,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerBase,
  RawServerDefault,
} from './utils';

import type {
  BaseLogger,
  LogFn as XufaLogFn,
  LevelWithSilent as LogLevel,
  Bindings,
  ChildLoggerOptions,
  LoggerOptions as PinoLoggerOptions,
} from '@xufa/logger';

export type { XufaLogFn, LogLevel, Bindings, ChildLoggerOptions, PinoLoggerOptions };

export interface XufaBaseLogger extends Pick<
  BaseLogger,
  'level' | 'info' | 'error' | 'debug' | 'fatal' | 'warn' | 'trace' | 'silent'
> {
  child(bindings: Bindings, options?: ChildLoggerOptions): XufaBaseLogger;
}

export interface XufaLoggerStreamDestination {
  write(msg: string): void;
}

/**
 * Xufa Custom Logger options.
 */
export interface XufaLoggerOptions<
  RawServer extends RawServerBase = RawServerDefault,
  RawRequest extends XufaRequest<
    RouteGenericInterface,
    RawServer,
    RawRequestDefaultExpression<RawServer>,
    XufaSchema,
    XufaTypeProvider
  > = XufaRequest<
    RouteGenericInterface,
    RawServer,
    RawRequestDefaultExpression<RawServer>,
    XufaSchema,
    XufaTypeProviderDefault
  >,
  RawReply extends XufaReply<
    RouteGenericInterface,
    RawServer,
    RawRequestDefaultExpression<RawServer>,
    RawReplyDefaultExpression<RawServer>,
    ContextConfigDefault,
    XufaSchema,
    XufaTypeProvider
  > = XufaReply<
    RouteGenericInterface,
    RawServer,
    RawRequestDefaultExpression<RawServer>,
    RawReplyDefaultExpression<RawServer>,
    ContextConfigDefault,
    XufaSchema,
    XufaTypeProviderDefault
  >,
> {
  serializers?: {
    req?: (req: RawRequest) => {
      method?: string;
      url?: string;
      version?: string;
      host?: string;
      remoteAddress?: string;
      remotePort?: number;
      [key: string]: unknown;
    };
    err?: (err: XufaError) => {
      type: string;
      message: string;
      stack: string;
      [key: string]: unknown;
    };
    res?: (res: Partial<RawReply>) => {
      statusCode?: string | number;
      [key: string]: unknown;
    };
  };
  level?: string;
  file?: string;
  genReqId?: (req: RawRequest) => string;
  stream?: XufaLoggerStreamDestination;
}

export interface LogControllerOptions {
  disableRequestLogging?: boolean | ((req: XufaRequest) => boolean);
  requestIdLogLabel?: string;
}

export declare class LogController {
  disableRequestLogging: boolean | ((req: XufaRequest) => boolean);
  requestIdLogLabel: string;

  constructor(options?: LogControllerOptions);

  isLogDisabled(request: XufaRequest): boolean;
  incomingRequest(request: XufaRequest, reply: XufaReply, metadata?: Record<string, unknown>): void;
  requestCompleted(
    error: Error | null | undefined,
    request: XufaRequest,
    reply: XufaReply,
    metadata?: Record<string, unknown>
  ): void;
  defaultErrorLog(error: Error, request: XufaRequest, reply: XufaReply, metadata?: Record<string, unknown>): void;
  streamError(error: Error, request: XufaRequest, reply: XufaReply, metadata?: Record<string, unknown>): void;
  routeNotFound(request: XufaRequest, reply: XufaReply, metadata?: Record<string, unknown>): void;
  writeHeadError(error: Error, request: XufaRequest, reply: XufaReply, metadata?: Record<string, unknown>): void;
  serializerError(error: Error, request: XufaRequest, reply: XufaReply, metadata: { statusCode: number }): void;
  serviceUnavailable(logger: XufaBaseLogger, server: XufaInstance): void;
}

export interface XufaChildLoggerFactory<
  RawServer extends RawServerBase = RawServerDefault,
  RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
  RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
  Logger extends XufaBaseLogger = XufaBaseLogger,
  TypeProvider extends XufaTypeProvider = XufaTypeProviderDefault,
> {
  /**
   * @param logger The parent logger
   * @param bindings The bindings object that will be passed to the child logger
   * @param childLoggerOpts The logger options that will be passed to the child logger
   * @param rawReq The raw request
   * @this The xufa instance
   * @returns The child logger instance
   */
  (
    this: XufaInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider>,
    logger: Logger,
    bindings: Bindings,
    childLoggerOpts: ChildLoggerOptions,
    rawReq: RawRequest
  ): Logger;
}
