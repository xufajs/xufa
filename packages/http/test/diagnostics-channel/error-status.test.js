'use strict'


const Fastify = require('../..')
const statusCodes = require('node:http').STATUS_CODES
const diagnostics = require('node:diagnostics_channel')

const subscriptions = []
function subscribeForTest (name, fn) {
  subscriptions.push([name, fn])
  diagnostics.subscribe(name, fn)
}
afterEach(() => {
  for (const [name, fn] of subscriptions.splice(0)) diagnostics.unsubscribe(name, fn)
})

test('diagnostics channel error event should report correct status code', async () => {
  expect.assertions(3)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  let diagnosticsStatusCode

  const channel = diagnostics.channel('tracing:xufa.request.handler:error')
  const handler = (msg) => {
    diagnosticsStatusCode = msg.reply.statusCode
  }
  channel.subscribe(handler)
  onTestFinished(() => channel.unsubscribe(handler))

  fastify.get('/', async () => {
    const err = new Error('test error')
    err.statusCode = 503
    throw err
  })

  const res = await fastify.inject('/')

  expect(res.statusCode).toBe(503)
  expect(diagnosticsStatusCode).toBe(503)
  expect(diagnosticsStatusCode).toBe(res.statusCode)
})

test('diagnostics channel error event should report 500 for errors without status', async () => {
  expect.assertions(3)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  let diagnosticsStatusCode

  const channel = diagnostics.channel('tracing:xufa.request.handler:error')
  const handler = (msg) => {
    diagnosticsStatusCode = msg.reply.statusCode
  }
  channel.subscribe(handler)
  onTestFinished(() => channel.unsubscribe(handler))

  fastify.get('/', async () => {
    throw new Error('plain error without status')
  })

  const res = await fastify.inject('/')

  expect(res.statusCode).toBe(500)
  expect(diagnosticsStatusCode).toBe(500)
  expect(diagnosticsStatusCode).toBe(res.statusCode)
})

test('diagnostics channel error event should report correct status with custom error handler', async () => {
  expect.assertions(3)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  let diagnosticsStatusCode

  const channel = diagnostics.channel('tracing:xufa.request.handler:error')
  const handler = (msg) => {
    diagnosticsStatusCode = msg.reply.statusCode
  }
  channel.subscribe(handler)
  onTestFinished(() => channel.unsubscribe(handler))

  fastify.setErrorHandler((error, request, reply) => {
    reply.status(503).send({ error: error.message })
  })

  fastify.get('/', async () => {
    throw new Error('handler error')
  })

  const res = await fastify.inject('/')

  // Note: The diagnostics channel fires before the custom error handler runs,
  // so it reports 500 (default) rather than 503 (set by custom handler).
  // This is expected behavior - the error channel reports the initial error state.
  expect(res.statusCode).toBe(503)
  expect(diagnosticsStatusCode).toBe(500)
  expect(diagnosticsStatusCode).not.toBe(res.statusCode)
})

test('Error.status property support', (done) => {
  expect.assertions(4)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  const err = new Error('winter is coming')
  err.status = 418

  subscribeForTest('tracing:xufa.request.handler:error', (msg) => {
    expect(msg.error.message).toBe('winter is coming')
  })

  fastify.get('/', () => {
    return Promise.reject(err)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(418)
    expect({
        error: statusCodes['418'],
        message: err.message,
        statusCode: 418
      }).toEqual(JSON.parse(res.payload))
    done()
  })
})
