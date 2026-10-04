'use strict'


const Fastify = require('..')
const { request, setGlobalDispatcher, Agent } = require('undici')

setGlobalDispatcher(new Agent({
  keepAliveTimeout: 10,
  keepAliveMaxTimeout: 10
}))

test('post empty body', async () => {
  const fastify = Fastify({ forceCloseConnections: true })
  const abortController = new AbortController()
  const { signal } = abortController
  onTestFinished(() => {
    fastify.close()
    abortController.abort()
  })

  fastify.post('/bug', async () => {
    // This function must be async and return nothing
  })

  await fastify.listen({ port: 0 })

  const res = await request(`http://localhost:${fastify.server.address().port}/bug`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ foo: 'bar' }),
    signal
  })

  expect(res.statusCode).toBe(200)
  expect(await res.body.text()).toBe('')
}, 3_000)
