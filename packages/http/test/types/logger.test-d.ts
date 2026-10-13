// Ported from fastify (test/types/logger.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import * as fs from 'node:fs'
import { IncomingMessage, Server, ServerResponse } from 'node:http'
import P from '@xufa/logger'
import { expectTypeOf } from '@xufa/test';
import xufa, {
  XufaBaseLogger,
  XufaError,
  XufaLogFn,
  XufaReply,
  XufaRequest,
  LogLevel
} from '../..'
import { LogController } from '../../types/logger.js'

expectTypeOf(xufa().log).toEqualTypeOf<XufaBaseLogger>();

class Foo { }

['trace', 'debug', 'info', 'warn', 'error', 'fatal'].forEach(logLevel => {
  expectTypeOf(xufa<Server, IncomingMessage, ServerResponse, XufaBaseLogger>().log[logLevel as LogLevel]).toEqualTypeOf<XufaLogFn>();
  expectTypeOf(xufa<Server, IncomingMessage, ServerResponse, XufaBaseLogger>().log[logLevel as LogLevel]('')).toEqualTypeOf<void>();
  expectTypeOf(xufa<Server, IncomingMessage, ServerResponse, XufaBaseLogger>().log[logLevel as LogLevel]({})).toEqualTypeOf<void>();
  expectTypeOf(xufa<Server, IncomingMessage, ServerResponse, XufaBaseLogger>().log[logLevel as LogLevel]({ foo: 'bar' })).toEqualTypeOf<void>();
  expectTypeOf(xufa<Server, IncomingMessage, ServerResponse, XufaBaseLogger>().log[logLevel as LogLevel](new Error())).toEqualTypeOf<void>();
  expectTypeOf(xufa<Server, IncomingMessage, ServerResponse, XufaBaseLogger>().log[logLevel as LogLevel](new Foo())).toEqualTypeOf<void>();
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

expectTypeOf(serverWithCustomLogger.log).toEqualTypeOf<CustomLoggerImpl>();

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

expectTypeOf(serverWithPino.log).toEqualTypeOf<P.Logger>();

serverWithPino.route({
  method: 'GET',
  url: '/',
  handler (request) {
    expectTypeOf(this.log).toEqualTypeOf<P.Logger>();
    expectTypeOf(request.log).toEqualTypeOf<P.Logger>();
  }
})

serverWithPino.get('/', function (request) {
  expectTypeOf(this.log).toEqualTypeOf<P.Logger>();
  expectTypeOf(request.log).toEqualTypeOf<P.Logger>();
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

expectTypeOf(serverWithLogOptions.log).toEqualTypeOf<XufaBaseLogger>();

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

expectTypeOf(serverWithFileOption.log).toEqualTypeOf<XufaBaseLogger>();

const serverAutoInferringTypes = xufa({
  logger: {
    level: 'info'
  }
})

expectTypeOf(serverAutoInferringTypes.log).toEqualTypeOf<XufaBaseLogger>();

const serverWithLoggerInstance = xufa({
  loggerInstance: P({
    level: 'info',
    redact: ['x-userinfo']
  })
})

expectTypeOf(serverWithLoggerInstance.log).toEqualTypeOf<P.Logger>();

const serverWithPinoConfig = xufa({
  logger: {
    level: 'info',
    serializers: {
      req (request) {
        expectTypeOf(request).toEqualTypeOf<XufaRequest>();
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
        expectTypeOf(reply).toEqualTypeOf<Partial<XufaReply>>();
        expectTypeOf(reply).not.toMatchTypeOf<XufaReply>();
        return {
          statusCode: 'statusCode'
        }
      },
      err (error) {
        expectTypeOf(error).toEqualTypeOf<XufaError>();

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

expectTypeOf(serverWithPinoConfig.log).toEqualTypeOf<XufaBaseLogger>();

const serverAutoInferredFileOption = xufa({
  logger: {
    level: 'info',
    file: '/path/to/file'
  }
})

expectTypeOf(serverAutoInferredFileOption.log).toEqualTypeOf<XufaBaseLogger>();

const serverAutoInferredSerializerResponseObjectOption = xufa({
  logger: {
    serializers: {
      res (reply) {
        expectTypeOf(reply).toEqualTypeOf<Partial<XufaReply>>();
        expectTypeOf(reply).not.toMatchTypeOf<XufaReply>();
        return {
          status: '200'
        }
      }
    }
  }
})

expectTypeOf(serverAutoInferredSerializerResponseObjectOption.log).toEqualTypeOf<XufaBaseLogger>();

const serverAutoInferredSerializerObjectOption = xufa({
  logger: {
    serializers: {
      req (request) {
        expectTypeOf(request).toEqualTypeOf<XufaRequest>();
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
        expectTypeOf(reply).toEqualTypeOf<Partial<XufaReply>>();
        expectTypeOf(reply).not.toMatchTypeOf<XufaReply>();
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

expectTypeOf(serverAutoInferredSerializerObjectOption.log).toEqualTypeOf<XufaBaseLogger>();

const passStreamAsOption = xufa({
  logger: {
    stream: fs.createWriteStream('/tmp/stream.out')
  }
})

expectTypeOf(passStreamAsOption.log).toEqualTypeOf<XufaBaseLogger>();

const passPinoOption = xufa({
  logger: {
    redact: ['custom'],
    messageKey: 'msg',
    nestedKey: 'nested',
    enabled: true
  }
})

expectTypeOf(passPinoOption.log).toEqualTypeOf<XufaBaseLogger>();

const childParent = xufa().log
// we test different option variant here
expectTypeOf(childParent.child({}, { level: 'info' })).toEqualTypeOf<XufaBaseLogger>();
expectTypeOf(childParent.child({}, { level: 'silent' })).toEqualTypeOf<XufaBaseLogger>();
expectTypeOf(childParent.child({}, { redact: ['pass', 'pin'] })).toEqualTypeOf<XufaBaseLogger>();
expectTypeOf(childParent.child({}, { serializers: { key: () => { } } })).toEqualTypeOf<XufaBaseLogger>();
expectTypeOf(childParent.child({}, { level: 'info', redact: ['pass', 'pin'], serializers: { key: () => { } } })).toEqualTypeOf<XufaBaseLogger>();

// @ts-expect-error
childParent.child();

// @ts-expect-error
childParent.child({}, { nonExist: true });

const logController = new LogController()
logController.requestCompleted(undefined, {} as XufaRequest, {} as XufaReply);
logController.requestCompleted(null, {} as XufaRequest, {} as XufaReply);
logController.requestCompleted(new Error(), {} as XufaRequest, {} as XufaReply);
