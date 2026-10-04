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

test('diagnostics channel sync events fire in expected order', async () => {
  expect.assertions(10)
  let callOrder = 0
  let firstEncounteredMessage

  subscribeForTest('tracing:xufa.request.handler:start', (msg) => {
    expect(callOrder++).toBe(0)
    firstEncounteredMessage = msg
    expect(msg.request instanceof Request).toBeTruthy()
    expect(msg.reply instanceof Reply).toBeTruthy()
  })

  subscribeForTest('tracing:xufa.request.handler:end', (msg) => {
    expect(msg.request instanceof Request).toBeTruthy()
    expect(msg.reply instanceof Reply).toBeTruthy()
    expect(callOrder++).toBe(1)
    expect(msg).toBe(firstEncounteredMessage)
  })

  subscribeForTest('tracing:xufa.request.handler:error', (msg) => {
    expect.fail('should not trigger error channel')
  })

  const fastify = Fastify()
  fastify.route({
    method: 'GET',
    url: '/',
    handler: function (req, reply) {
      reply.send({ hello: 'world' })
    }
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => { fastify.close() })

  const response = await fetch(fastifyServer, {
    method: 'GET'
  })
  expect(response.ok).toBeTruthy()
  expect(response.status).toBe(200)
  const body = await response.text()
  expect(JSON.parse(body)).toEqual({ hello: 'world' })
})
