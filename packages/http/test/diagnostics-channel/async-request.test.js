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

test('diagnostics channel async events fire in expected order', async () => {
  expect.assertions(18)
  let callOrder = 0
  let firstEncounteredMessage

  subscribeForTest('tracing:xufa.request.handler:start', (msg) => {
    expect(callOrder++).toBe(0)
    firstEncounteredMessage = msg
    expect(msg.request instanceof Request).toBeTruthy()
    expect(msg.reply instanceof Reply).toBeTruthy()
  })

  subscribeForTest('tracing:xufa.request.handler:end', (msg) => {
    expect(callOrder++).toBe(1)
    expect(msg.request instanceof Request).toBeTruthy()
    expect(msg.reply instanceof Reply).toBeTruthy()
    expect(msg).toBe(firstEncounteredMessage)
  })

  subscribeForTest('tracing:xufa.request.handler:asyncStart', (msg) => {
    expect(callOrder++).toBe(2)
    expect(msg.request instanceof Request).toBeTruthy()
    expect(msg.reply instanceof Reply).toBeTruthy()
    expect(msg).toBe(firstEncounteredMessage)
  })

  subscribeForTest('tracing:xufa.request.handler:asyncEnd', (msg) => {
    expect(callOrder++).toBe(3)
    expect(msg.request instanceof Request).toBeTruthy()
    expect(msg.reply instanceof Reply).toBeTruthy()
    expect(msg).toBe(firstEncounteredMessage)
  })

  subscribeForTest('tracing:xufa.request.handler:error', (msg) => {
    expect.fail('should not trigger error channel')
  })

  const fastify = Fastify()
  fastify.route({
    method: 'GET',
    url: '/',
    handler: async function (req, reply) {
      return { hello: 'world' }
    }
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  onTestFinished(() => { fastify.close() })

  const response = await fetch(fastifyServer)
  expect(response.ok).toBeTruthy()
  expect(response.status).toBe(200)
  const body = await response.text()
  expect(JSON.parse(body)).toEqual({ hello: 'world' })
})
