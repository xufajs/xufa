'use strict'


const diagnostics = require('node:diagnostics_channel')

const subscriptions = []
function subscribeForTest (name, fn) {
  subscriptions.push([name, fn])
  diagnostics.subscribe(name, fn)
}
afterEach(() => {
  for (const [name, fn] of subscriptions.splice(0)) diagnostics.unsubscribe(name, fn)
})
const Fastify = require('../..')
const Request = require('../../lib/request')
const Reply = require('../../lib/reply')

test('diagnostics channel tracks async operations in async error handlers', async () => {
  expect.assertions(17)
  let callOrder = 0
  let firstEncounteredMessage
  let asyncStartFired = false
  let asyncEndFired = false

  const fastify = Fastify()

  function subscribe (name, handler) {
    const wrapped = (msg) => {
      if (msg.request.server === fastify) handler(msg)
    }
    subscribeForTest(name, wrapped)
    onTestFinished(() => diagnostics.unsubscribe(name, wrapped))
  }

  subscribe('tracing:xufa.request.handler:start', (msg) => {
    expect(callOrder++).toBe(0)
    firstEncounteredMessage = msg
    expect(msg.request instanceof Request).toBeTruthy()
    expect(msg.reply instanceof Reply).toBeTruthy()
  })

  subscribe('tracing:xufa.request.handler:error', (msg) => {
    expect(callOrder++).toBe(1)
    expect(msg.error instanceof Error).toBeTruthy()
    expect(msg.error.message).toBe('handler error')
  })

  subscribe('tracing:xufa.request.handler:end', (msg) => {
    expect(callOrder++).toBe(2)
    expect(msg).toBe(firstEncounteredMessage)
    expect(msg.async).toBe(true)
  })

  subscribe('tracing:xufa.request.handler:asyncStart', (msg) => {
    expect(callOrder++).toBe(3)
    expect(msg).toBe(firstEncounteredMessage)
    asyncStartFired = true
  })

  subscribe('tracing:xufa.request.handler:asyncEnd', (msg) => {
    expect(callOrder++).toBe(4)
    expect(msg).toBe(firstEncounteredMessage)
    asyncEndFired = true
  })

  fastify.setErrorHandler(async (error, request, reply) => {
    await new Promise(resolve => setImmediate(resolve))
    reply.status(503).send({ error: error.message })
  })

  fastify.get('/', () => {
    throw new Error('handler error')
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const response = await fetch(fastifyServer)
  expect(response.ok).toBeFalsy()
  expect(response.status).toBe(503)
  expect(asyncStartFired).toBeTruthy()
  expect(asyncEndFired).toBeTruthy()
})
