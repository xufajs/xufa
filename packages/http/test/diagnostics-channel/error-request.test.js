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

test('diagnostics channel events report on errors', async () => {
  expect.assertions(14)
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
    expect(callOrder++).toBe(2)
    expect(msg).toBe(firstEncounteredMessage)
  })

  subscribeForTest('tracing:xufa.request.handler:error', (msg) => {
    expect(msg.request instanceof Request).toBeTruthy()
    expect(msg.reply instanceof Reply).toBeTruthy()
    expect(msg.error instanceof Error).toBeTruthy()
    expect(callOrder++).toBe(1)
    expect(msg.error.message).toBe('borked')
  })

  const fastify = Fastify()
  fastify.route({
    method: 'GET',
    url: '/',
    handler: function (req, reply) {
      throw new Error('borked')
    }
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => { fastify.close() })

  const response = await fetch(fastifyServer, {
    method: 'GET'
  })
  expect(response.ok).toBeFalsy()
  expect(response.status).toBe(500)
})
