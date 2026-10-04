// Ported from fastify (test/types/logger.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import * as fs from 'node:fs'
import { IncomingMessage, Server, ServerResponse } from 'node:http'
import P from '@xufa/logger'
import { expect } from 'tstyche'
import xufa, {
  XufaBaseLogger,
  XufaError,
  XufaLogFn,
  XufaReply,
  XufaRequest,
  LogLevel
} from '../..'
import { LogController } from '../../types/logger.js'

expect(xufa().log).type.toBe<XufaBaseLogger>()

class Foo { }

['trace', 'debug', 'info', 'warn', 'error', 'fatal'].forEach(logLevel => {
  expect(
    xufa<Server, IncomingMessage, ServerResponse, XufaBaseLogger>().log[logLevel as LogLevel]
  ).type.toBe<XufaLogFn>()
  expect(
    xufa<Server, IncomingMessage, ServerResponse, XufaBaseLogger>().log[logLevel as LogLevel]('')
  ).type.toBe<void>()
  expect(
    xufa<Server, IncomingMessage, ServerResponse, XufaBaseLogger>().log[logLevel as LogLevel]({})
  ).type.toBe<void>()
  expect(
    xufa<Server, IncomingMessage, ServerResponse, XufaBaseLogger>().log[logLevel as LogLevel]({ foo: 'bar' })
  ).type.toBe<void>()
  expect(
    xufa<Server, IncomingMessage, ServerResponse, XufaBaseLogger>().log[logLevel as LogLevel](new Error())
  ).type.toBe<void>()
  expect(
    xufa<Server, IncomingMessage, ServerResponse, XufaBaseLogger>().log[logLevel as LogLevel](new Foo())
  ).type.toBe<void>()
})

interface CustomLogger extends XufaBaseLogger {
  customMethod(msg: string, ...args: unknown[]): void;
}

class CustomLoggerImpl implements CustomLogger {
  level = 'info'
  customMethod (msg: string, ...args: unknown[]) { console.log(msg, args) }

  // Implementation signature must be compatible with all overloads of XufaLogFn
  info (arg1: unknown, arg2?: unknown, ...args: unknown[]): void {
    console.log(arg1, arg2, ...args)
  }

  warn (...args: unknown[]) { console.log(args) }
  error (...args: unknown[]) { console.log(args) }
  fatal (...args: unknown[]) { console.log(args) }
  trace (...args: unknown[]) { console.log(args) }
  debug (...args: unknown[]) { console.log(args) }
  silent (...args: unknown[]) { }

  child (bindings: P.Bindings, options?: P.ChildLoggerOptions): CustomLoggerImpl { return new CustomLoggerImpl() }
}

const customLogger = new CustomLoggerImpl()

const serverWithCustomLogger = xufa<
  Server,
  IncomingMessage,
  ServerResponse,
  CustomLoggerImpl
>({ logger: customLogger })

expect(serverWithCustomLogger.log).type.toBe<CustomLoggerImpl>()

const serverWithPino = xufa<
  Server,
  IncomingMessage,
  ServerResponse,
  P.Logger
>({
  logger: P({
    level: 'info',
    redact: ['x-userinfo']
  })
})

expect(serverWithPino.log).type.toBe<P.Logger>()

serverWithPino.route({
  method: 'GET',
  url: '/',
  handler (request) {
    expect(this.log).type.toBe<P.Logger>()
    expect(request.log).type.toBe<P.Logger>()
  }
})

serverWithPino.get('/', function (request) {
  expect(this.log).type.toBe<P.Logger>()
  expect(request.log).type.toBe<P.Logger>()
})

const serverWithLogOptions = xufa<
  Server,
  IncomingMessage,
  ServerResponse
>({
  logger: {
    level: 'info'
  }
})

expect(serverWithLogOptions.log).type.toBe<XufaBaseLogger>()

const serverWithFileOption = xufa<
  Server,
  IncomingMessage,
  ServerResponse
>({
  logger: {
    level: 'info',
    file: '/path/to/file'
  }
})

expect(serverWithFileOption.log).type.toBe<XufaBaseLogger>()

const serverAutoInferringTypes = xufa({
  logger: {
    level: 'info'
  }
})

expect(serverAutoInferringTypes.log).type.toBe<XufaBaseLogger>()

const serverWithLoggerInstance = xufa({
  loggerInstance: P({
    level: 'info',
    redact: ['x-userinfo']
  })
})

expect(serverWithLoggerInstance.log).type.toBe<P.Logger>()

const serverWithPinoConfig = xufa({
  logger: {
    level: 'info',
    serializers: {
      req (request) {
        expect(request).type.toBe<XufaRequest>()
        return {
          method: 'method',
          url: 'url',
          version: 'version',
          host: 'xufa.test',
          remoteAddress: 'remoteAddress',
          remotePort: 80,
          other: ''
        }
      },
      res (reply) {
        expect(reply).type.toBe<Partial<XufaReply>>()
        expect(reply).type.not.toBeAssignableTo<XufaReply>()
        return {
          statusCode: 'statusCode'
        }
      },
      err (error) {
        expect(error).type.toBe<XufaError>()

        return {
          other: '',
          type: 'type',
          message: 'msg',
          stack: 'stack'
        }
      }
    }
  }
})

expect(serverWithPinoConfig.log).type.toBe<XufaBaseLogger>()

const serverAutoInferredFileOption = xufa({
  logger: {
    level: 'info',
    file: '/path/to/file'
  }
})

expect(serverAutoInferredFileOption.log).type.toBe<XufaBaseLogger>()

const serverAutoInferredSerializerResponseObjectOption = xufa({
  logger: {
    serializers: {
      res (reply) {
        expect(reply).type.toBe<Partial<XufaReply>>()
        expect(reply).type.not.toBeAssignableTo<XufaReply>()
        return {
          status: '200'
        }
      }
    }
  }
})

expect(serverAutoInferredSerializerResponseObjectOption.log).type.toBe<XufaBaseLogger>()

const serverAutoInferredSerializerObjectOption = xufa({
  logger: {
    serializers: {
      req (request) {
        expect(request).type.toBe<XufaRequest>()
        return {
          method: 'method',
          url: 'url',
          version: 'version',
          host: 'xufa.test',
          remoteAddress: 'remoteAddress',
          remotePort: 80,
          other: ''
        }
      },
      res (reply) {
        expect(reply).type.toBe<Partial<XufaReply>>()
        expect(reply).type.not.toBeAssignableTo<XufaReply>()
        return {
          statusCode: 'statusCode'
        }
      },
      err (XufaError) {
        return {
          other: '',
          type: 'type',
          message: 'msg',
          stack: 'stack'
        }
      }
    }
  }
})

expect(serverAutoInferredSerializerObjectOption.log).type.toBe<XufaBaseLogger>()

const passStreamAsOption = xufa({
  logger: {
    stream: fs.createWriteStream('/tmp/stream.out')
  }
})

expect(passStreamAsOption.log).type.toBe<XufaBaseLogger>()

const passPinoOption = xufa({
  logger: {
    redact: ['custom'],
    messageKey: 'msg',
    nestedKey: 'nested',
    enabled: true
  }
})

expect(passPinoOption.log).type.toBe<XufaBaseLogger>()

const childParent = xufa().log
// we test different option variant here
expect(childParent.child({}, { level: 'info' })).type.toBe<XufaBaseLogger>()
expect(childParent.child({}, { level: 'silent' })).type.toBe<XufaBaseLogger>()
expect(childParent.child({}, { redact: ['pass', 'pin'] })).type.toBe<XufaBaseLogger>()
expect(childParent.child({}, { serializers: { key: () => { } } })).type.toBe<XufaBaseLogger>()
expect(childParent.child({}, { level: 'info', redact: ['pass', 'pin'], serializers: { key: () => { } } })).type.toBe<XufaBaseLogger>()

expect(childParent.child).type.not.toBeCallableWith()

expect(childParent.child).type.not.toBeCallableWith({}, { nonExist: true })

const logController = new LogController()
expect(logController.requestCompleted).type.toBeCallableWith(undefined, {} as XufaRequest, {} as XufaReply)
expect(logController.requestCompleted).type.toBeCallableWith(null, {} as XufaRequest, {} as XufaReply)
expect(logController.requestCompleted).type.toBeCallableWith(new Error(), {} as XufaRequest, {} as XufaReply)
