'use strict'


const Fastify = require('../..')
const loggerUtils = require('../../lib/logger')
const { createLogController, LogController } = require('../../lib/logger')
const { serializers } = require('../../lib/logger')

test('time resolution', async () => {
  expect.assertions(2)
  expect(typeof loggerUtils.now).toBe('function')
  expect(typeof loggerUtils.now()).toBe('number')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('The logger should add a unique id for every request', (done) => {
  const ids = []

  const fastify = Fastify()
  fastify.get('/', (req, reply) => {
    expect(req.id).toBeTruthy()
    reply.send({ id: req.id })
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    const queue = new Queue()
    for (let i = 0; i < 10; i++) {
      queue.add(checkId)
    }
    queue.add(() => {
      fastify.close()
      done()
    })
  })

  function checkId (done) {
    fastify.inject({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port
    }, (err, res) => {
      expect(err).toBeFalsy()
      const payload = JSON.parse(res.payload)
      expect(ids.indexOf(payload.id) === -1).toBeTruthy()
      ids.push(payload.id)
      done()
    })
  }
})

test('The logger should not reuse request id header for req.id', (done) => {
  const fastify = Fastify()
  fastify.get('/', (req, reply) => {
    expect(req.id).toBeTruthy()
    reply.send({ id: req.id })
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    fastify.inject({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port,
      headers: {
        'Request-Id': 'request-id-1'
      }
    }, (err, res) => {
      expect(err).toBeFalsy()
      const payload = JSON.parse(res.payload)
      expect(payload.id !== 'request-id-1').toBeTruthy()
      expect(payload.id === 'req-1').toBeTruthy() // first request id when using the default configuration
      fastify.close()
      done()
    })
  })
})

test('The logger should reuse request id header for req.id if requestIdHeader is set', (done) => {
  const fastify = Fastify({
    requestIdHeader: 'request-id'
  })
  fastify.get('/', (req, reply) => {
    expect(req.id).toBeTruthy()
    reply.send({ id: req.id })
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    fastify.inject({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port,
      headers: {
        'Request-Id': 'request-id-1'
      }
    }, (err, res) => {
      expect(err).toBeFalsy()
      const payload = JSON.parse(res.payload)
      expect(payload.id === 'request-id-1').toBeTruthy()
      fastify.close()
      done()
    })
  })
})

function Queue () {
  this.q = []
  this.running = false
}

Queue.prototype.add = function add (job) {
  this.q.push(job)
  if (!this.running) this.run()
}

Queue.prototype.run = function run () {
  this.running = true
  const job = this.q.shift()
  job(() => {
    if (this.q.length) {
      this.run()
    } else {
      this.running = false
    }
  })
}

test('The logger should error if both stream and file destination are given', async () => {
  expect.assertions(2)

  const stream = require('node:stream').Writable

  try {
    Fastify({
      logger: {
        level: 'info',
        stream,
        file: '/test'
      }
    })
  } catch (err) {
    expect(err.code).toBe('XUFA_ERR_LOG_INVALID_DESTINATION')
    expect(err.message).toBe('Cannot specify both logger.stream and logger.file options')
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('LogController defaults', async () => {
  expect.assertions(3)
  const dispatcher = new LogController()
  expect(dispatcher.disableRequestLogging).toBe(false)
  expect(dispatcher.requestIdLogLabel).toBe('reqId')
  expect(dispatcher.isLogDisabled({})).toBe(false)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('LogController with custom options', async () => {
  expect.assertions(2)
  const dispatcher = new LogController({
    disableRequestLogging: true,
    requestIdLogLabel: 'traceId'
  })
  expect(dispatcher.disableRequestLogging).toBe(true)
  expect(dispatcher.requestIdLogLabel).toBe('traceId')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('LogController with function disableRequestLogging', async () => {
  expect.assertions(2)
  const dispatcher = new LogController({
    disableRequestLogging: (req) => req.skip === true
  })
  expect(dispatcher.isLogDisabled({ skip: true })).toBe(true)
  expect(dispatcher.isLogDisabled({ skip: false })).toBe(false)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('requestCompleted should not log when logging is disabled (boolean)', async () => {
  expect.assertions(1)
  const logController = new LogController({ disableRequestLogging: true })
  const log = {
    error: () => { expect.fail('error should not be called') },
    info: () => { expect.fail('info should not be called') }
  }
  const request = {}
  const reply = { request, log }
  logController.requestCompleted(new Error('test'), request, reply)
  expect(true).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('requestCompleted should not log when logging is disabled (function)', async () => {
  expect.assertions(1)
  const logController = new LogController({ disableRequestLogging: () => true })
  const log = {
    error: () => { expect.fail('error should not be called') },
    info: () => { expect.fail('info should not be called') }
  }
  const request = {}
  const reply = { request, log }
  logController.requestCompleted(new Error('test'), request, reply)
  expect(true).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('requestCompleted should log error when err is present', async () => {
  expect.assertions(1)
  const logController = new LogController({ disableRequestLogging: false })
  const err = new Error('test')
  const log = {
    error: (data, msg) => {
      expect(msg).toBe('request errored')
    }
  }
  const request = {}
  const reply = { request, log, elapsedTime: 42 }
  logController.requestCompleted(err, request, reply)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('requestCompleted should log info when no error', async () => {
  expect.assertions(1)
  const logController = new LogController({ disableRequestLogging: false })
  const log = {
    info: (data, msg) => {
      expect(msg).toBe('request completed')
    }
  }
  const request = {}
  const reply = { request, log, elapsedTime: 42 }
  logController.requestCompleted(null, request, reply)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('defaultErrorLog should not log when logging is disabled (boolean)', async () => {
  expect.assertions(1)
  const logController = new LogController({ disableRequestLogging: true })
  const log = {
    info: () => { expect.fail('info should not be called') },
    error: () => { expect.fail('error should not be called') }
  }
  const request = {}
  const reply = { request, log, statusCode: 404 }
  logController.defaultErrorLog(new Error('not found'), request, reply)
  expect(true).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('defaultErrorLog should not log when logging is disabled (function)', async () => {
  expect.assertions(1)
  const logController = new LogController({ disableRequestLogging: () => true })
  const log = {
    info: () => { expect.fail('info should not be called') },
    error: () => { expect.fail('error should not be called') }
  }
  const request = {}
  const reply = { request, log, statusCode: 404 }
  logController.defaultErrorLog(new Error('not found'), request, reply)
  expect(true).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('defaultErrorLog should log info for 4xx errors', async () => {
  expect.assertions(1)
  const logController = new LogController({ disableRequestLogging: false })
  const err = new Error('not found')
  const log = {
    info: (data, msg) => {
      expect(msg).toBe('not found')
    }
  }
  const request = {}
  const reply = { request, log, statusCode: 404 }
  logController.defaultErrorLog(err, request, reply)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('defaultErrorLog should log error for 5xx errors', async () => {
  expect.assertions(1)
  const logController = new LogController({ disableRequestLogging: false })
  const err = new Error('internal error')
  const log = {
    error: (data, msg) => {
      expect(msg).toBe('internal error')
    }
  }
  const request = {}
  const reply = { request, log, statusCode: 500 }
  logController.defaultErrorLog(err, request, reply)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('routeNotFound should not log when logging is disabled', async () => {
  expect.assertions(1)
  const logController = new LogController({ disableRequestLogging: request => request.skipLogging })
  const request = {
    skipLogging: true,
    log: {
      info: () => { expect.fail('info should not be called') }
    }
  }
  logController.routeNotFound(request, {})
  expect(true).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('writeHeadError should not log when logging is disabled (boolean)', async () => {
  expect.assertions(1)
  const logController = new LogController({ disableRequestLogging: true })
  const log = {
    warn: () => { expect.fail('warn should not be called') }
  }
  const request = {}
  const reply = { request, log }
  logController.writeHeadError(new Error('write head failed'), request, reply)
  expect(true).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('writeHeadError should not log when logging is disabled (function)', async () => {
  expect.assertions(1)
  const logController = new LogController({ disableRequestLogging: () => true })
  const log = {
    warn: () => { expect.fail('warn should not be called') }
  }
  const request = {}
  const reply = { request, log }
  logController.writeHeadError(new Error('write head failed'), request, reply)
  expect(true).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('writeHeadError should log warn with error message', async () => {
  expect.assertions(2)
  const logController = new LogController({ disableRequestLogging: false })
  const error = new Error('write head failed')
  const request = {}
  const reply = {
    request,
    log: {
      warn: (data, msg) => {
        expect(msg).toBe('write head failed')
        expect(data.err).toBe(error)
      }
    }
  }
  logController.writeHeadError(error, request, reply)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('serializerError should not log when logging is disabled (boolean)', async () => {
  expect.assertions(1)
  const logController = new LogController({ disableRequestLogging: true })
  const log = {
    error: () => { expect.fail('error should not be called') }
  }
  const request = {}
  const reply = { request, log }
  logController.serializerError(new Error('serializer failed'), request, reply, { statusCode: 500 })
  expect(true).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('serializerError should not log when logging is disabled (function)', async () => {
  expect.assertions(1)
  const logController = new LogController({ disableRequestLogging: () => true })
  const log = {
    error: () => { expect.fail('error should not be called') }
  }
  const request = {}
  const reply = { request, log }
  logController.serializerError(new Error('serializer failed'), request, reply, { statusCode: 500 })
  expect(true).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('serializerError should log error with status code', async () => {
  expect.assertions(2)
  const logController = new LogController({ disableRequestLogging: false })
  const err = new Error('serializer failed')
  const request = {}
  const reply = {
    request,
    log: {
      error: (data, msg) => {
        expect(msg).toBe('The serializer for the given status code failed')
        expect(data.statusCode).toBe(500)
      }
    }
  }
  logController.serializerError(err, request, reply, { statusCode: 500 })

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('createLogController should use LogController instance directly', async () => {
  expect.assertions(2)
  const custom = new LogController({ disableRequestLogging: true, requestIdLogLabel: 'traceId' })
  const dispatcher = createLogController({ logController: custom })
  expect(dispatcher).toBe(custom)
  expect(dispatcher.requestIdLogLabel).toBe('traceId')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('createLogController should create default when no instance provided', async () => {
  expect.assertions(2)
  const dispatcher = createLogController({})
  expect(dispatcher instanceof LogController).toBeTruthy()
  expect(dispatcher.requestIdLogLabel).toBe('reqId')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('createLogController should throw on invalid type', async () => {
  expect.assertions(1)
  expect(() => {
    createLogController({ logController: 'bad' })
  }).toThrow(expect.objectContaining({ code: 'XUFA_ERR_LOG_INVALID_LOG_CONTROLLER' }))

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('createLogController should throw when plain object is provided', async () => {
  expect.assertions(1)
  expect(() => {
    createLogController({ logController: { incomingRequest: () => { } } })
  }).toThrow(expect.objectContaining({ code: 'XUFA_ERR_LOG_INVALID_LOG_CONTROLLER' }))

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('createLogController should accept null', async () => {
  expect.assertions(1)
  const logController = createLogController({ logController: null })
  expect(logController).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('LogController subclass should work', async () => {
  expect.assertions(2)

  class MyDispatcher extends LogController {
    constructor () {
      super({ requestIdLogLabel: 'traceId' })
    }

    incomingRequest (request, reply, metadata) {
      expect(true).toBeTruthy()
    }
  }

  const dispatcher = new MyDispatcher()
  expect(dispatcher.requestIdLogLabel).toBe('traceId')
  dispatcher.incomingRequest({})

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('LogController subclass keeps defaults for non-overridden methods', async () => {
  expect.assertions(1)

  class MyDispatcher extends LogController {
    incomingRequest () { }
  }

  const dispatcher = new MyDispatcher()
  const log = {
    info: (data, msg) => {
      expect(msg).toBe('request completed')
    }
  }
  const request = {}
  const reply = { request, log, elapsedTime: 42 }
  dispatcher.requestCompleted(null, request, reply)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('serviceUnavailable should log with logger and receive server', async () => {
  expect.assertions(2)
  const dispatcher = new LogController()
  const fakeLogger = {
    info: (data, msg) => {
      expect(data).toEqual({ res: { statusCode: 503 } })
      expect(msg).toBe('request aborted - refusing to accept new requests as server is closing')
    }
  }
  const fakeServer = { name: 'test-server' }
  dispatcher.serviceUnavailable(fakeLogger, fakeServer)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('serviceUnavailable subclass can use server', async () => {
  expect.assertions(1)

  const fakeServer = { name: 'test-server' }

  class MyDispatcher extends LogController {
    serviceUnavailable (logger, server) {
      expect(server).toBe(fakeServer)
    }
  }

  const dispatcher = new MyDispatcher()
  dispatcher.serviceUnavailable({}, fakeServer)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('LogController is exported from fastify', async () => {
  expect.assertions(2)
  expect(Fastify.LogController).toBeTruthy()
  expect(Fastify.LogController).toBe(LogController)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('The serializer prevent fails if the request socket is undefined', async () => {
  expect.assertions(1)

  const serialized = serializers.req({
    method: 'GET',
    url: '/',
    socket: undefined,
    headers: {}
  })

  expect(serialized).toEqual({
    method: 'GET',
    url: '/',
    version: undefined,
    host: undefined,
    remoteAddress: undefined,
    remotePort: undefined
  })

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
