// Ported from fastify (fastify.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import * as http from 'node:http';
import pluginFunction = require('./types/plugin-function');
import * as http2 from 'node:http2';
import * as https from 'node:https';
import { Socket } from 'node:net';

import { BuildCompilerFromPool, ValidatorFactory } from './types/compilers';
import { XufaError } from '@xufa/errors';
import { SerializerOptions as FJSOptions, SerializerFactory } from './types/compilers';
import { ConstraintStrategy, Config as FindMyWayConfig, HTTPVersion } from '@xufa/router';
import {
  InjectOptions,
  CallbackFunc as LightMyRequestCallback,
  Chain as LightMyRequestChain,
  Response as LightMyRequestResponse,
} from '@xufa/inject';

import {
  AddContentTypeParser,
  ConstructorAction,
  XufaBodyParser,
  XufaContentTypeParser,
  getDefaultJsonParser,
  hasContentTypeParser,
  ProtoAction,
} from './types/content-type-parser';
import { XufaContextConfig } from './types/context';
import { XufaErrorCodes } from './types/errors';
import {
  DoneFuncWithErrOrRes,
  HookHandlerDoneFunction,
  onCloseAsyncHookHandler,
  onCloseHookHandler,
  onErrorAsyncHookHandler,
  onErrorHookHandler,
  onListenAsyncHookHandler,
  onListenHookHandler,
  onReadyAsyncHookHandler,
  onReadyHookHandler,
  onRegisterHookHandler,
  onRequestAbortAsyncHookHandler,
  onRequestAbortHookHandler,
  onRequestAsyncHookHandler,
  onRequestHookHandler,
  onResponseAsyncHookHandler,
  onResponseHookHandler,
  onRouteHookHandler,
  onSendAsyncHookHandler,
  onSendHookHandler,
  onTimeoutAsyncHookHandler,
  onTimeoutHookHandler,
  preCloseAsyncHookHandler,
  preCloseHookHandler,
  preHandlerAsyncHookHandler,
  preHandlerHookHandler,
  preParsingAsyncHookHandler,
  preParsingHookHandler,
  preSerializationAsyncHookHandler,
  preSerializationHookHandler,
  preValidationAsyncHookHandler,
  preValidationHookHandler,
  RequestPayload,
} from './types/hooks';
import { XufaInstance, XufaListenOptions, PrintRoutesOptions } from './types/instance';
import {
  XufaBaseLogger,
  XufaChildLoggerFactory,
  XufaLogFn,
  XufaLoggerOptions,
  LogController as LogControllerClass,
  LogLevel,
  PinoLoggerOptions,
} from './types/logger';
import { XufaPluginAsync, XufaPluginCallback, XufaPluginOptions } from './types/plugin';
import { XufaRegister, XufaRegisterOptions, RegisterOptions } from './types/register';
import { XufaReply } from './types/reply';
import { XufaRequest, RequestGenericInterface } from './types/request';
import {
  RouteGenericInterface,
  RouteHandler,
  RouteHandlerMethod,
  RouteOptions,
  RouteShorthandMethod,
  RouteShorthandOptions,
  RouteShorthandOptionsWithHandler,
} from './types/route';
import {
  XufaSchema,
  XufaSchemaCompiler,
  XufaSchemaValidationError,
  XufaSerializerCompiler,
  SchemaErrorDataVar,
  SchemaErrorFormatter,
} from './types/schema';
import { XufaServerFactory, XufaServerFactoryHandler } from './types/server-factory';
import { XufaTypeProvider, XufaTypeProviderDefault, SafePromiseLike } from './types/type-provider';
import {
  ContextConfigDefault,
  HTTPMethods,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerBase,
  RawServerDefault,
  RequestBodyDefault,
  RequestHeadersDefault,
  RequestParamsDefault,
  RequestQuerystringDefault,
} from './types/utils';

declare module '@xufa/errors' {
  interface XufaError {
    validationContext?: SchemaErrorDataVar;
    validation?: XufaSchemaValidationError[];
  }
}

type Xufa = typeof xufa;

declare namespace xufa {
  export const errorCodes: XufaErrorCodes;
  /** Wraps a plugin so that it is not encapsulated, with its metadata (what fastify-plugin does for fastify). */
  export const plugin: typeof pluginFunction;
  export type PluginMetadata = pluginFunction.PluginMetadata;
  export { LogControllerClass as LogController };

  export type XufaHttp2SecureOptions<
    Server extends http2.Http2SecureServer,
    Logger extends XufaBaseLogger = XufaBaseLogger,
  > = XufaServerOptions<Server, Logger> & {
    http2: true;
    https: http2.SecureServerOptions;
    http2SessionTimeout?: number;
  };

  export type XufaHttp2Options<
    Server extends http2.Http2Server,
    Logger extends XufaBaseLogger = XufaBaseLogger,
  > = XufaServerOptions<Server, Logger> & {
    http2: true;
    http2SessionTimeout?: number;
  };

  export type XufaHttpsOptions<
    Server extends https.Server,
    Logger extends XufaBaseLogger = XufaBaseLogger,
  > = XufaServerOptions<Server, Logger> & {
    https: https.ServerOptions | null;
    http2?: false;
  };

  export type XufaHttpOptions<
    Server extends http.Server,
    Logger extends XufaBaseLogger = XufaBaseLogger,
  > = XufaServerOptions<Server, Logger> & {
    http?: http.ServerOptions | null;
    http2?: false;
  };

  type FindMyWayVersion<RawServer extends RawServerBase> = RawServer extends http.Server
    ? HTTPVersion.V1
    : HTTPVersion.V2;
  type FindMyWayConfigForServer<RawServer extends RawServerBase> = FindMyWayConfig<FindMyWayVersion<RawServer>>;

  export interface ConnectionError extends Error {
    code: string;
    bytesParsed: number;
    rawPacket: {
      type: string;
      data: number[];
    };
  }

  type TrustProxyFunction = (address: string, hop: number) => boolean;

  export type XufaRouterOptions<RawServer extends RawServerBase> = Omit<
    FindMyWayConfigForServer<RawServer>,
    'defaultRoute' | 'onBadUrl' | 'onMaxParamLength' | 'querystringParser' | 'constraints'
  > & {
    constraints?: {
      [name: string]: ConstraintStrategy<FindMyWayVersion<RawServer>, unknown>;
    };
    defaultRoute?: (req: RawRequestDefaultExpression<RawServer>, res: RawReplyDefaultExpression<RawServer>) => void;
    onBadUrl?: (
      path: string,
      req: RawRequestDefaultExpression<RawServer>,
      res: RawReplyDefaultExpression<RawServer>
    ) => void;
    onMaxParamLength?: (
      path: string,
      req: RawRequestDefaultExpression<RawServer>,
      res: RawReplyDefaultExpression<RawServer>
    ) => void;
    querystringParser?: (str: string) => { [key: string]: unknown };
  };

  /**
   * Options for a xufa server instance. Utilizes conditional logic on the generic server parameter to enforce certain https and http2
   */
  export type XufaServerOptions<
    RawServer extends RawServerBase = RawServerDefault,
    Logger extends XufaBaseLogger = XufaBaseLogger,
  > = {
    ignoreTrailingSlash?: boolean;
    ignoreDuplicateSlashes?: boolean;
    connectionTimeout?: number;
    keepAliveTimeout?: number;
    maxRequestsPerSocket?: number;
    forceCloseConnections?: boolean | 'idle';
    requestTimeout?: number;
    pluginTimeout?: number;
    bodyLimit?: number;
    handlerTimeout?: number;
    maxParamLength?: number;
    logController?: LogControllerClass;
    exposeHeadRoutes?: boolean;
    onProtoPoisoning?: ProtoAction;
    onConstructorPoisoning?: ConstructorAction;
    logger?: boolean | (XufaLoggerOptions<RawServer> & PinoLoggerOptions);
    loggerInstance?: Logger;
    serializerOpts?: FJSOptions | Record<string, unknown>;
    serverFactory?: XufaServerFactory<RawServer>;
    requestIdHeader?: string | false;
    genReqId?: (req: RawRequestDefaultExpression<RawServer>) => string;
    trustProxy?: boolean | string | string[] | TrustProxyFunction;
    schemaController?: {
      bucket?: (parentSchemas?: unknown) => {
        add(schema: unknown): XufaInstance;
        getSchema(schemaId: string): unknown;
        getSchemas(): Record<string, unknown>;
      };
      compilersFactory?: {
        buildValidator?: ValidatorFactory;
        buildSerializer?: SerializerFactory;
      };
    };
    return503OnClosing?: boolean;
    /**
     * xufa writes the head of common HTTP/1.1 responses itself instead of res.writeHead() (faster; on by default).
     * false leaves every head to Node.
     */
    fastHead?: boolean;
    ajv?: Parameters<BuildCompilerFromPool>[1];
    frameworkErrors?: <
      RequestGeneric extends RequestGenericInterface = RequestGenericInterface,
      TypeProvider extends XufaTypeProvider = XufaTypeProviderDefault,
      SchemaCompiler extends XufaSchema = XufaSchema,
    >(
      error: XufaError,
      req: XufaRequest<RequestGeneric, RawServer, RawRequestDefaultExpression<RawServer>, XufaSchema, TypeProvider>,
      res: XufaReply<
        RequestGeneric,
        RawServer,
        RawRequestDefaultExpression<RawServer>,
        RawReplyDefaultExpression<RawServer>,
        XufaContextConfig,
        SchemaCompiler,
        TypeProvider
      >
    ) => void;
    rewriteUrl?: (
      // The RawRequestDefaultExpression, RawReplyDefaultExpression, and XufaTypeProviderDefault parameters
      // should be narrowed further but those generic parameters are not passed to this XufaServerOptions type
      this: XufaInstance<
        RawServer,
        RawRequestDefaultExpression<RawServer>,
        RawReplyDefaultExpression<RawServer>,
        Logger,
        XufaTypeProviderDefault
      >,
      req: RawRequestDefaultExpression<RawServer>
    ) => string;
    schemaErrorFormatter?: SchemaErrorFormatter;
    /**
     * listener to error events emitted by client connections
     */
    clientErrorHandler?: (error: ConnectionError, socket: Socket) => void;
    childLoggerFactory?: XufaChildLoggerFactory;
    allowErrorHandlerOverride?: boolean;
    routerOptions?: XufaRouterOptions<RawServer>;
  };

  /* Export additional types */
  export type {
    LightMyRequestChain,
    InjectOptions,
    LightMyRequestResponse,
    LightMyRequestCallback, // '@xufa/inject'
    XufaRequest,
    RequestGenericInterface, // './types/request'
    XufaReply, // './types/reply'
    XufaPluginCallback,
    XufaPluginAsync,
    XufaPluginOptions, // './types/plugin'
    XufaListenOptions,
    XufaInstance,
    PrintRoutesOptions, // './types/instance'
    XufaLoggerOptions,
    XufaBaseLogger,
    XufaLogFn,
    LogLevel, // './types/logger'
    XufaContextConfig, // './types/context'
    RouteHandler,
    RouteHandlerMethod,
    RouteOptions,
    RouteShorthandMethod,
    RouteShorthandOptions,
    RouteShorthandOptionsWithHandler,
    RouteGenericInterface, // './types/route'
    XufaRegister,
    XufaRegisterOptions,
    RegisterOptions, // './types/register'
    XufaBodyParser,
    XufaContentTypeParser,
    AddContentTypeParser,
    hasContentTypeParser,
    getDefaultJsonParser,
    ProtoAction,
    ConstructorAction, // './types/content-type-parser'
    XufaError, // '@xufa/errors'
    XufaSchema,
    XufaSchemaValidationError,
    XufaSchemaCompiler,
    XufaSerializerCompiler, // './types/schema'
    HTTPMethods,
    RawServerBase,
    RawRequestDefaultExpression,
    RawReplyDefaultExpression,
    RawServerDefault,
    ContextConfigDefault,
    RequestBodyDefault,
    RequestQuerystringDefault,
    RequestParamsDefault,
    RequestHeadersDefault,
    // './types/utils'
    DoneFuncWithErrOrRes,
    HookHandlerDoneFunction,
    RequestPayload,
    onCloseAsyncHookHandler,
    onCloseHookHandler,
    onErrorAsyncHookHandler,
    onErrorHookHandler,
    onReadyAsyncHookHandler,
    onReadyHookHandler,
    onListenAsyncHookHandler,
    onListenHookHandler,
    onRegisterHookHandler,
    onRequestAsyncHookHandler,
    onRequestHookHandler,
    onResponseAsyncHookHandler,
    onResponseHookHandler,
    onRouteHookHandler,
    onSendAsyncHookHandler,
    onSendHookHandler,
    onTimeoutAsyncHookHandler,
    onTimeoutHookHandler,
    preHandlerAsyncHookHandler,
    preHandlerHookHandler,
    preParsingAsyncHookHandler,
    preParsingHookHandler,
    preSerializationAsyncHookHandler,
    preSerializationHookHandler,
    preValidationAsyncHookHandler,
    preValidationHookHandler,
    onRequestAbortHookHandler,
    onRequestAbortAsyncHookHandler,
    preCloseAsyncHookHandler,
    preCloseHookHandler, // './types/hooks'
    XufaServerFactory,
    XufaServerFactoryHandler, // './types/serverFactory'
    XufaTypeProvider,
    XufaTypeProviderDefault,
    SafePromiseLike, // './types/type-provider'
    XufaErrorCodes, // './types/errors'
  };
  // named export
  // import { plugin } from 'plugin'
  // const { plugin } = require('plugin')
  export const xufa: Xufa;
  // default export
  // import plugin from 'plugin'
  export { xufa as default };
}

/**
 * Xufa factory function for the standard xufa http, https, or http2 server instance.
 *
 * The default function utilizes http
 *
 * @param opts Xufa server options
 * @returns Xufa server instance
 */
declare function xufa<
  Server extends http2.Http2SecureServer,
  Request extends RawRequestDefaultExpression<Server> = RawRequestDefaultExpression<Server>,
  Reply extends RawReplyDefaultExpression<Server> = RawReplyDefaultExpression<Server>,
  Logger extends XufaBaseLogger = XufaBaseLogger,
  TypeProvider extends XufaTypeProvider = XufaTypeProviderDefault,
>(
  opts: xufa.XufaHttp2SecureOptions<Server, Logger>
): XufaInstance<Server, Request, Reply, Logger, TypeProvider> &
  SafePromiseLike<XufaInstance<Server, Request, Reply, Logger, TypeProvider>>;

declare function xufa<
  Server extends http2.Http2Server,
  Request extends RawRequestDefaultExpression<Server> = RawRequestDefaultExpression<Server>,
  Reply extends RawReplyDefaultExpression<Server> = RawReplyDefaultExpression<Server>,
  Logger extends XufaBaseLogger = XufaBaseLogger,
  TypeProvider extends XufaTypeProvider = XufaTypeProviderDefault,
>(
  opts: xufa.XufaHttp2Options<Server, Logger>
): XufaInstance<Server, Request, Reply, Logger, TypeProvider> &
  SafePromiseLike<XufaInstance<Server, Request, Reply, Logger, TypeProvider>>;

declare function xufa<
  Server extends https.Server,
  Request extends RawRequestDefaultExpression<Server> = RawRequestDefaultExpression<Server>,
  Reply extends RawReplyDefaultExpression<Server> = RawReplyDefaultExpression<Server>,
  Logger extends XufaBaseLogger = XufaBaseLogger,
  TypeProvider extends XufaTypeProvider = XufaTypeProviderDefault,
>(
  opts: xufa.XufaHttpsOptions<Server, Logger>
): XufaInstance<Server, Request, Reply, Logger, TypeProvider> &
  SafePromiseLike<XufaInstance<Server, Request, Reply, Logger, TypeProvider>>;

declare function xufa<
  Server extends http.Server,
  Request extends RawRequestDefaultExpression<Server> = RawRequestDefaultExpression<Server>,
  Reply extends RawReplyDefaultExpression<Server> = RawReplyDefaultExpression<Server>,
  Logger extends XufaBaseLogger = XufaBaseLogger,
  TypeProvider extends XufaTypeProvider = XufaTypeProviderDefault,
>(
  opts?: xufa.XufaHttpOptions<Server, Logger>
): XufaInstance<Server, Request, Reply, Logger, TypeProvider> &
  SafePromiseLike<XufaInstance<Server, Request, Reply, Logger, TypeProvider>>;

// CJS export
// const xufa = require('xufa')
export = xufa;
