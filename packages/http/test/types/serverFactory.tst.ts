// Ported from fastify (test/types/serverFactory.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import * as http from 'node:http'
import { expect } from 'tstyche'
import xufa, { XufaServerFactory } from '../..'

// Custom Server
type CustomType = void
interface CustomIncomingMessage extends http.IncomingMessage {
  fakeMethod?: () => CustomType;
}

interface CustomServerResponse extends http.ServerResponse {
  fakeMethod?: () => CustomType;
}

const serverFactory: XufaServerFactory<http.Server> = (handler, opts) => {
  const server = http.createServer((req: CustomIncomingMessage, res: CustomServerResponse) => {
    req.fakeMethod = () => {}
    res.fakeMethod = () => {}

    handler(req, res)
  })

  return server
}

// The request and reply objects should have the fakeMethods available (even though they may be undefined)
const customServer = xufa<http.Server, CustomIncomingMessage, CustomServerResponse>({ serverFactory })

customServer.get('/', function (request, reply) {
  if (request.raw.fakeMethod) {
    expect(request.raw.fakeMethod()).type.toBe<CustomType>()
  }

  if (reply.raw.fakeMethod) {
    expect(reply.raw.fakeMethod()).type.toBe<CustomType>()
  }
})
