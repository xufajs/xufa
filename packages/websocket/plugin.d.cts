// Type definitions for @xufa/websocket/plugin: the ones of @fastify/websocket 11.3.3 (MIT), for @xufa/http.
import * as xufa from '@xufa/http';
import {
  ContextConfigDefault,
  XufaBaseLogger,
  XufaInstance,
  XufaPluginCallback,
  XufaRequest,
  XufaSchema,
  XufaTypeProvider,
  XufaTypeProviderDefault,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerBase,
  RawServerDefault,
  RequestGenericInterface,
  preCloseAsyncHookHandler,
  preCloseHookHandler,
  XufaReply,
  RouteGenericInterface,
} from '@xufa/http';
import { IncomingMessage, Server, ServerResponse } from 'node:http';
import * as WebSocket from './index';

interface WebsocketRouteOptions<
  RawServer extends RawServerBase = RawServerDefault,
  RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
  RequestGeneric extends RequestGenericInterface = RequestGenericInterface,
  ContextConfig = ContextConfigDefault,
  SchemaCompiler extends XufaSchema = XufaSchema,
  TypeProvider extends XufaTypeProvider = XufaTypeProviderDefault,
  Logger extends XufaBaseLogger = XufaBaseLogger,
> {
  wsHandler?: xufaWebsocket.WebsocketHandler<
    RawServer,
    RawRequest,
    RequestGeneric,
    ContextConfig,
    SchemaCompiler,
    TypeProvider,
    Logger
  >;
}

declare module '@xufa/http' {
  interface RouteShorthandOptions<
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    RawServer extends RawServerBase = RawServerDefault,
  > {
    websocket?: boolean;
  }

  interface InjectWSOption {
    onInit?: (ws: WebSocket.WebSocket) => void;
    onOpen?: (ws: WebSocket.WebSocket) => void;
  }

  type InjectWSFn<RawRequest> = (
    path?: string,
    upgradeContext?: Partial<RawRequest>,
    options?: InjectWSOption
  ) => Promise<WebSocket>;

  interface XufaInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider> {
    websocketServer: WebSocket.Server;
    injectWS: InjectWSFn<RawRequest>;

    // When `websocket: true` is set, `handler` is the websocket handler, so type it as such
    route<
      RouteGeneric extends RouteGenericInterface = RouteGenericInterface,
      ContextConfig = ContextConfigDefault,
      const SchemaCompiler extends XufaSchema = XufaSchema,
    >(
      opts: Omit<
        RouteOptions<
          RawServer,
          RawRequest,
          RawReply,
          RouteGeneric,
          ContextConfig,
          SchemaCompiler,
          TypeProvider,
          Logger
        >,
        'handler' | 'websocket'
      > & {
        websocket: true;
        handler: xufaWebsocket.WebsocketHandler<
          RawServer,
          RawRequest,
          RouteGeneric,
          ContextConfig,
          SchemaCompiler,
          TypeProvider,
          Logger
        >;
      }
    ): XufaInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider>;
  }

  interface XufaRequest {
    ws: boolean;
  }

  interface RouteShorthandMethod<
    RawServer extends RawServerBase = RawServerDefault,
    RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
    RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
    TypeProvider extends XufaTypeProvider = XufaTypeProviderDefault,
    Logger extends XufaBaseLogger = XufaBaseLogger,
  > {
    <
      RequestGeneric extends RequestGenericInterface = RequestGenericInterface,
      ContextConfig = ContextConfigDefault,
      SchemaCompiler extends XufaSchema = XufaSchema,
      InnerLogger extends Logger = Logger,
    >(
      path: string,
      opts: RouteShorthandOptions<
        RawServer,
        RawRequest,
        RawReply,
        RequestGeneric,
        ContextConfig,
        SchemaCompiler,
        TypeProvider,
        InnerLogger
      > & { websocket: true }, // this creates an overload that only applies these different types if the handler is for websockets
      handler?: xufaWebsocket.WebsocketHandler<
        RawServer,
        RawRequest,
        RequestGeneric,
        ContextConfig,
        SchemaCompiler,
        TypeProvider,
        InnerLogger
      >
    ): XufaInstance<RawServer, RawRequest, RawReply, InnerLogger, TypeProvider>;
  }

  interface RouteOptions<
    RawServer extends RawServerBase = RawServerDefault,
    RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
    RouteGeneric extends RouteGenericInterface = RouteGenericInterface,
    ContextConfig = ContextConfigDefault,
    SchemaCompiler = xufa.XufaSchema,
    TypeProvider extends XufaTypeProvider = XufaTypeProviderDefault,
    Logger extends XufaBaseLogger = XufaBaseLogger,
  > extends WebsocketRouteOptions<
    RawServer,
    RawRequest,
    RouteGeneric,
    ContextConfig,
    SchemaCompiler,
    TypeProvider,
    Logger
  > {}
}

type XufaWebsocketPlugin = XufaPluginCallback<xufaWebsocket.WebsocketPluginOptions>;

declare namespace xufaWebsocket {
  interface WebSocketServerOptions extends Omit<WebSocket.ServerOptions, 'path'> {}
  export type WebsocketHandler<
    RawServer extends RawServerBase = RawServerDefault,
    RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
    RequestGeneric extends RequestGenericInterface = RequestGenericInterface,
    ContextConfig = ContextConfigDefault,
    SchemaCompiler extends XufaSchema = XufaSchema,
    TypeProvider extends XufaTypeProvider = XufaTypeProviderDefault,
    Logger extends XufaBaseLogger = XufaBaseLogger,
  > = (
    this: XufaInstance<Server, IncomingMessage, ServerResponse>,
    socket: WebSocket.WebSocket,
    request: XufaRequest<RequestGeneric, RawServer, RawRequest, SchemaCompiler, TypeProvider, ContextConfig, Logger>
  ) => void | Promise<any>;

  export interface WebsocketPluginOptions {
    errorHandler?: (
      this: XufaInstance,
      error: Error,
      socket: WebSocket.WebSocket,
      request: XufaRequest,
      reply: XufaReply
    ) => void;
    options?: WebSocketServerOptions;
    preClose?: preCloseHookHandler | preCloseAsyncHookHandler;
  }

  export interface RouteOptions<
    RawServer extends RawServerBase = RawServerDefault,
    RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
    RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
    RouteGeneric extends RouteGenericInterface = RouteGenericInterface,
    ContextConfig = ContextConfigDefault,
    SchemaCompiler extends xufa.XufaSchema = xufa.XufaSchema,
    TypeProvider extends XufaTypeProvider = XufaTypeProviderDefault,
    Logger extends XufaBaseLogger = XufaBaseLogger,
  >
    extends
      xufa.RouteOptions<
        RawServer,
        RawRequest,
        RawReply,
        RouteGeneric,
        ContextConfig,
        SchemaCompiler,
        TypeProvider,
        Logger
      >,
      WebsocketRouteOptions<RawServer, RawRequest, RouteGeneric, ContextConfig, SchemaCompiler, TypeProvider, Logger> {}

  export type WebSocket = WebSocket.WebSocket;

  export const xufaWebsocket: XufaWebsocketPlugin;
  export const fastifyWebsocket: XufaWebsocketPlugin;
  export { xufaWebsocket as default };
}

declare function xufaWebsocket(...params: Parameters<XufaWebsocketPlugin>): ReturnType<XufaWebsocketPlugin>;
export = xufaWebsocket;
