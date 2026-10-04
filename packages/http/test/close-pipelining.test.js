'use strict'


const Fastify = require('..')
const { Client } = require('undici')

test('Should return 503 while closing - pipelining', async () => {
  const fastify = Fastify({
    return503OnClosing: true,
    forceCloseConnections: false
  })

  fastify.get('/', async (req, reply) => {
    // Simulate a delay to allow pipelining to kick in
    await new Promise(resolve => setTimeout(resolve, 5))
    reply.send({ hello: 'world' })
    fastify.close()
  })

  await fastify.listen({ port: 0 })

  const instance = new Client('http://localhost:' + fastify.server.address().port, {
    pipelining: 2
  })

  const [firstRequest, secondRequest, thirdRequest] = await Promise.allSettled([
    instance.request({ path: '/', method: 'GET', blocking: false }),
    instance.request({ path: '/', method: 'GET', blocking: false }),
    instance.request({ path: '/', method: 'GET', blocking: false })
  ])
  expect(firstRequest.status).toBe('fulfilled')
  expect(secondRequest.status).toBe('fulfilled')

  expect(firstRequest.value.statusCode).toBe(200)
  expect(secondRequest.value.statusCode).toBe(200)

  expect(thirdRequest.status).toBe('fulfilled')
  expect(thirdRequest.value.statusCode).toBe(503)

  await instance.close()
})

test('Should close the socket abruptly - pipelining - return503OnClosing: false', async () => {
  // Node.js will always invoke server.closeIdleConnections() therefore our socket will be closed
  const fastify = Fastify({
    return503OnClosing: false,
    forceCloseConnections: false
  })

  fastify.get('/', async (req, reply) => {
    // Simulate a delay to allow pipelining to kick in
    await new Promise(resolve => setTimeout(resolve, 5))
    reply.send({ hello: 'world' })
    fastify.close()
  })

  await fastify.listen({ port: 0 })

  const instance = new Client('http://localhost:' + fastify.server.address().port, {
    pipelining: 1
  })

  const responses = await Promise.allSettled([
    instance.request({ path: '/', method: 'GET', blocking: false }),
    instance.request({ path: '/', method: 'GET', blocking: false }),
    instance.request({ path: '/', method: 'GET', blocking: false }),
    instance.request({ path: '/', method: 'GET', blocking: false })
  ])

  const fulfilled = responses.filter(r => r.status === 'fulfilled')
  const rejected = responses.filter(r => r.status === 'rejected')

  expect(fulfilled.length).toBe(1)
  expect(rejected.length).toBe(3)

  await instance.close()
})
