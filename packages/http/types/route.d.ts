// Ported from fastify (types/route.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { XufaError } from '@xufa/errors';
import { ConstraintStrategy } from '@xufa/router';
import { XufaContextConfig } from './context';
import {
  onErrorHookHandler,
  onRequestAbortHookHandler,
  onRequestHookHandler,
  onResponseHookHandler,
  onSendHookHandler,
  onTimeoutHookHandler,
  preHandlerHookHandler,
  preParsingHookHandler,
  preSerializationHookHandler,
  preValidationHookHandler,
} from './hooks';
import { XufaInstance } from './instance';
import { XufaBaseLogger, XufaChildLoggerFactory, LogLevel } from './logger';
import { XufaReply, ReplyGenericInterface } from './reply';
import { XufaRequest, RequestGenericInterface } from './request';
import { XufaSchema, XufaSchemaCompiler, XufaSerializerCompiler, SchemaErrorFormatter } from './schema';
import { XufaTypeProvider, XufaTypeProviderDefault, ResolveXufaReplyReturnType } from './type-provider';
import {
  ContextConfigDefault,
  HTTPMethods,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerBase,
  RawServerDefault,
} from './utils';

export interface XufaRouteConfig {
  url: string;
  method: HTTPMethods | HTTPMethods[];
}

export interface RouteGenericInterface extends RequestGenericInterface, ReplyGenericInterface {}

export type RouteConstraintType = Omit<ConstraintStrategy<any>, 'deriveConstraint'> & {
  deriveConstraint<Context>(
    req: RawRequestDefaultExpression<RawServerDefault>,
    ctx?: Context,
    done?: (err: Error, ...args: any) => any
  ): any;
};

export interface RouteConstraint {
  version?: string;
  host?: RegExp | string;
  [name: string]: unknown;
}

/**
 * Route shorthand options for the various shorthand methods
 */
type RouteShorthandHook<T extends (this: any, ...args: any) => any> = (
  this: ThisParameterType<T>,
  ...args: Parameters<T>
) => void | Promise<unknown>;

export interface RouteShorthandOptions<
  RawServer extends RawServerBase = RawServerDefault,
  RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
  RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
  RouteGeneric extends RouteGenericInterface = RouteGenericInterface,
  ContextConfig = ContextConfigDefault,
  SchemaCompiler extends XufaSchema = XufaSchema,
  TypeProvider extends XufaTypeProvider = XufaTypeProviderDefault,
  Logger extends XufaBaseLogger = XufaBaseLogger,
> {
  schema?: SchemaCompiler; // originally XufaSchema
  attachValidation?: boolean;
  exposeHeadRoute?: boolean;

  validatorCompiler?: XufaSchemaCompiler<NoInfer<SchemaCompiler>>;
  serializerCompiler?: XufaSerializerCompiler<NoInfer<SchemaCompiler>>;
  bodyLimit?: number;
  handlerTimeout?: number;
  logLevel?: LogLevel;
  config?: XufaContextConfig & ContextConfig;
  constraints?: RouteConstraint;
  prefixTrailingSlash?: 'slash' | 'no-slash' | 'both';
  errorHandler?: (
    this: XufaInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider>,
    error: XufaError,
    request: XufaRequest<
      RouteGeneric,
      RawServer,
      RawRequest,
      NoInfer<SchemaCompiler>,
      TypeProvider,
      ContextConfig,
      Logger
    >,
    reply: XufaReply<
      RouteGeneric,
      RawServer,
      RawRequest,
      RawReply,
      ContextConfig,
      NoInfer<SchemaCompiler>,
      TypeProvider
    >
  ) => void;
  childLoggerFactory?: XufaChildLoggerFactory<RawServer, RawRequest, RawReply, XufaBaseLogger, TypeProvider>;
  schemaErrorFormatter?: SchemaErrorFormatter;

  // hooks
  onRequest?:
    | RouteShorthandHook<
        onRequestHookHandler<
          RawServer,
          RawRequest,
          RawReply,
          RouteGeneric,
          ContextConfig,
          NoInfer<SchemaCompiler>,
          TypeProvider,
          Logger
        >
      >
    | RouteShorthandHook<
        onRequestHookHandler<
          RawServer,
          RawRequest,
          RawReply,
          RouteGeneric,
          ContextConfig,
          NoInfer<SchemaCompiler>,
          TypeProvider,
          Logger
        >
      >[];
  preParsing?:
    | RouteShorthandHook<
        preParsingHookHandler<
          RawServer,
          RawRequest,
          RawReply,
          RouteGeneric,
          ContextConfig,
          NoInfer<SchemaCompiler>,
          TypeProvider,
          Logger
        >
      >
    | RouteShorthandHook<
        preParsingHookHandler<
          RawServer,
          RawRequest,
          RawReply,
          RouteGeneric,
          ContextConfig,
          NoInfer<SchemaCompiler>,
          TypeProvider,
          Logger
        >
      >[];
  preValidation?:
    | RouteShorthandHook<
        preValidationHookHandler<
          RawServer,
          RawRequest,
          RawReply,
          RouteGeneric,
          ContextConfig,
          NoInfer<SchemaCompiler>,
          TypeProvider,
          Logger
        >
      >
    | RouteShorthandHook<
        preValidationHookHandler<
          RawServer,
          RawRequest,
          RawReply,
          RouteGeneric,
          ContextConfig,
          NoInfer<SchemaCompiler>,
          TypeProvider,
          Logger
        >
      >[];
  preHandler?:
    | RouteShorthandHook<
        preHandlerHookHandler<
          RawServer,
          RawRequest,
          RawReply,
          RouteGeneric,
          ContextConfig,
          NoInfer<SchemaCompiler>,
          TypeProvider,
          Logger
        >
      >
    | RouteShorthandHook<
        preHandlerHookHandler<
          RawServer,
          RawRequest,
          RawReply,
          RouteGeneric,
          ContextConfig,
          NoInfer<SchemaCompiler>,
          TypeProvider,
          Logger
        >
      >[];
  preSerialization?:
    | RouteShorthandHook<
        preSerializationHookHandler<
          unknown,
          RawServer,
          RawRequest,
          RawReply,
          RouteGeneric,
          ContextConfig,
          NoInfer<SchemaCompiler>,
          TypeProvider,
          Logger
        >
      >
    | RouteShorthandHook<
        preSerializationHookHandler<
          unknown,
          RawServer,
          RawRequest,
          RawReply,
          RouteGeneric,
          ContextConfig,
          NoInfer<SchemaCompiler>,
          TypeProvider,
          Logger
        >
      >[];
  onSend?:
    | RouteShorthandHook<
        onSendHookHandler<
          unknown,
          RawServer,
          RawRequest,
          RawReply,
          RouteGeneric,
          ContextConfig,
          NoInfer<SchemaCompiler>,
          TypeProvider,
          Logger
        >
      >
    | RouteShorthandHook<
        onSendHookHandler<
          unknown,
          RawServer,
          RawRequest,
          RawReply,
          RouteGeneric,
          ContextConfig,
          NoInfer<SchemaCompiler>,
          TypeProvider,
          Logger
        >
      >[];
  onResponse?:
    | RouteShorthandHook<
        onResponseHookHandler<
          RawServer,
          RawRequest,
          RawReply,
          RouteGeneric,
          ContextConfig,
          NoInfer<SchemaCompiler>,
          TypeProvider,
          Logger
        >
      >
    | RouteShorthandHook<
        onResponseHookHandler<
          RawServer,
          RawRequest,
          RawReply,
          RouteGeneric,
          ContextConfig,
          NoInfer<SchemaCompiler>,
          TypeProvider,
          Logger
        >
      >[];
  onTimeout?:
    | RouteShorthandHook<
        onTimeoutHookHandler<
          RawServer,
          RawRequest,
          RawReply,
          RouteGeneric,
          ContextConfig,
          NoInfer<SchemaCompiler>,
          TypeProvider,
          Logger
        >
      >
    | RouteShorthandHook<
        onTimeoutHookHandler<
          RawServer,
          RawRequest,
          RawReply,
          RouteGeneric,
          ContextConfig,
          NoInfer<SchemaCompiler>,
          TypeProvider,
          Logger
        >
      >[];
  onError?:
    | RouteShorthandHook<
        onErrorHookHandler<
          RawServer,
          RawRequest,
          RawReply,
          RouteGeneric,
          ContextConfig,
          XufaError,
          NoInfer<SchemaCompiler>,
          TypeProvider,
          Logger
        >
      >
    | RouteShorthandHook<
        onErrorHookHandler<
          RawServer,
          RawRequest,
          RawReply,
          RouteGeneric,
          ContextConfig,
          XufaError,
          NoInfer<SchemaCompiler>,
          TypeProvider,
          Logger
        >
      >[];
  onRequestAbort?:
    | RouteShorthandHook<
        onRequestAbortHookHandler<
          RawServer,
          RawRequest,
          RawReply,
          RouteGeneric,
          ContextConfig,
          NoInfer<SchemaCompiler>,
          TypeProvider,
          Logger
        >
      >
    | RouteShorthandHook<
        onRequestAbortHookHandler<
          RawServer,
          RawRequest,
          RawReply,
          RouteGeneric,
          ContextConfig,
          NoInfer<SchemaCompiler>,
          TypeProvider,
          Logger
        >
      >[];
}
/**
 * Route handler method declaration.
 */
export type RouteHandlerMethod<
  RawServer extends RawServerBase = RawServerDefault,
  RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
  RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
  RouteGeneric extends RouteGenericInterface = RouteGenericInterface,
  ContextConfig = ContextConfigDefault,
  SchemaCompiler extends XufaSchema = XufaSchema,
  TypeProvider extends XufaTypeProvider = XufaTypeProviderDefault,
  Logger extends XufaBaseLogger = XufaBaseLogger,
> = (
  this: XufaInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider>,
  request: XufaRequest<RouteGeneric, RawServer, RawRequest, SchemaCompiler, TypeProvider, ContextConfig, Logger>,
  reply: XufaReply<RouteGeneric, RawServer, RawRequest, RawReply, ContextConfig, SchemaCompiler, TypeProvider>
  // This return type used to be a generic type argument. Due to TypeScript's inference of return types, this rendered returns unchecked.
) => ResolveXufaReplyReturnType<TypeProvider, SchemaCompiler, RouteGeneric>;

/**
 * Shorthand options including the handler function property
 */
export interface RouteShorthandOptionsWithHandler<
  RawServer extends RawServerBase = RawServerDefault,
  RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
  RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
  RouteGeneric extends RouteGenericInterface = RouteGenericInterface,
  ContextConfig = ContextConfigDefault,
  SchemaCompiler extends XufaSchema = XufaSchema,
  TypeProvider extends XufaTypeProvider = XufaTypeProviderDefault,
  Logger extends XufaBaseLogger = XufaBaseLogger,
> extends RouteShorthandOptions<
  RawServer,
  RawRequest,
  RawReply,
  RouteGeneric,
  ContextConfig,
  SchemaCompiler,
  TypeProvider,
  Logger
> {
  handler: RouteHandlerMethod<
    RawServer,
    RawRequest,
    RawReply,
    RouteGeneric,
    ContextConfig,
    NoInfer<SchemaCompiler>,
    TypeProvider,
    Logger
  >;
}

/**
 * Xufa Router Shorthand method type that is similar to the Express/Restify approach
 */
export interface RouteShorthandMethod<
  RawServer extends RawServerBase = RawServerDefault,
  RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
  RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
  TypeProvider extends XufaTypeProvider = XufaTypeProviderDefault,
  Logger extends XufaBaseLogger = XufaBaseLogger,
> {
  <
    RouteGeneric extends RouteGenericInterface = RouteGenericInterface,
    ContextConfig = ContextConfigDefault,
    const SchemaCompiler extends XufaSchema = XufaSchema,
  >(
    path: string,
    opts: RouteShorthandOptions<
      RawServer,
      RawRequest,
      RawReply,
      RouteGeneric,
      ContextConfig,
      SchemaCompiler,
      TypeProvider,
      Logger
    >,
    handler: RouteHandlerMethod<
      RawServer,
      RawRequest,
      RawReply,
      RouteGeneric,
      ContextConfig,
      SchemaCompiler,
      TypeProvider,
      Logger
    >
  ): XufaInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider>;
  <
    RouteGeneric extends RouteGenericInterface = RouteGenericInterface,
    ContextConfig = ContextConfigDefault,
    const SchemaCompiler extends XufaSchema = XufaSchema,
  >(
    path: string,
    handler: RouteHandlerMethod<
      RawServer,
      RawRequest,
      RawReply,
      RouteGeneric,
      ContextConfig,
      SchemaCompiler,
      TypeProvider,
      Logger
    >
  ): XufaInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider>;
  <
    RouteGeneric extends RouteGenericInterface = RouteGenericInterface,
    ContextConfig = ContextConfigDefault,
    const SchemaCompiler extends XufaSchema = XufaSchema,
  >(
    path: string,
    opts: RouteShorthandOptionsWithHandler<
      RawServer,
      RawRequest,
      RawReply,
      RouteGeneric,
      ContextConfig,
      SchemaCompiler,
      TypeProvider,
      Logger
    >
  ): XufaInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider>;
}

/**
 * Xufa route method options.
 */
export interface RouteOptions<
  RawServer extends RawServerBase = RawServerDefault,
  RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
  RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
  RouteGeneric extends RouteGenericInterface = RouteGenericInterface,
  ContextConfig = ContextConfigDefault,
  SchemaCompiler extends XufaSchema = XufaSchema,
  TypeProvider extends XufaTypeProvider = XufaTypeProviderDefault,
  Logger extends XufaBaseLogger = XufaBaseLogger,
> extends RouteShorthandOptions<
  RawServer,
  RawRequest,
  RawReply,
  RouteGeneric,
  ContextConfig,
  SchemaCompiler,
  TypeProvider,
  Logger
> {
  method: HTTPMethods | HTTPMethods[];
  url: string;
  handler: RouteHandlerMethod<
    RawServer,
    RawRequest,
    RawReply,
    RouteGeneric,
    ContextConfig,
    SchemaCompiler,
    TypeProvider,
    Logger
  >;
}

export type RouteHandler<
  RouteGeneric extends RouteGenericInterface = RouteGenericInterface,
  RawServer extends RawServerBase = RawServerDefault,
  RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
  RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
  ContextConfig = ContextConfigDefault,
  SchemaCompiler extends XufaSchema = XufaSchema,
  TypeProvider extends XufaTypeProvider = XufaTypeProviderDefault,
  Logger extends XufaBaseLogger = XufaBaseLogger,
> = (
  this: XufaInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider>,
  request: XufaRequest<RouteGeneric, RawServer, RawRequest, SchemaCompiler, TypeProvider, ContextConfig, Logger>,
  reply: XufaReply<RouteGeneric, RawServer, RawRequest, RawReply, ContextConfig, SchemaCompiler, TypeProvider>
) => RouteGeneric['Reply'] | void | Promise<RouteGeneric['Reply'] | void>;

export type DefaultRoute<Request, Reply> = (req: Request, res: Reply) => void;
