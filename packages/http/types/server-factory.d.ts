// Ported from fastify (types/server-factory.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { RawServerBase, RawServerDefault, RawReplyDefaultExpression, RawRequestDefaultExpression } from './utils';
import * as http from 'node:http';
import * as https from 'node:https';
import * as http2 from 'node:http2';

export type XufaServerFactoryHandler<
  RawServer extends RawServerBase = RawServerDefault,
  RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
  RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
> = RawServer extends http.Server | https.Server
  ? (request: http.IncomingMessage & RawRequest, response: http.ServerResponse & RawReply) => void
  : (request: http2.Http2ServerRequest & RawRequest, response: http2.Http2ServerResponse & RawReply) => void;

export interface XufaServerFactory<RawServer extends RawServerBase = RawServerDefault> {
  (handler: XufaServerFactoryHandler<RawServer>, opts: Record<string, unknown>): RawServer;
}
