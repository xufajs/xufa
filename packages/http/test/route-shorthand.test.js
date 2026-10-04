'use strict'


const { Client } = require('undici')
const Fastify = require('..')

describe('route-shorthand', () => {
const methodsReader = new Fastify()
const supportedMethods = methodsReader.supportedMethods
for (const method of supportedMethods) {
    test(`route-shorthand - ${method.toLowerCase()}`, async () => {
      expect.assertions(2)
      const fastify = new Fastify()
      fastify[method.toLowerCase()]('/', (req, reply) => {
        expect(req.method).toBe(method)
        reply.send()
      })
      await fastify.listen({ port: 0 })
      onTestFinished(() => fastify.close())

      const instance = new Client(`http://localhost:${fastify.server.address().port}`)

      if (method === 'QUERY') {
        const response = await instance.request({ path: '/', method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hello: 'world' }) })
        expect(response.statusCode).toBe(200)
      } else {
        const response = await instance.request({ path: '/', method })
        expect(response.statusCode).toBe(200)
      }
    })
  }
test('route-shorthand - all', async () => {
    expect.assertions(2 * supportedMethods.length)
    const fastify = new Fastify()
    let currentMethod = ''
    fastify.all('/', function (req, reply) {
      expect(req.method).toBe(currentMethod)
      reply.send()
    })
    await fastify.listen({ port: 0 })
    onTestFinished(() => fastify.close())

    for (const method of supportedMethods) {
      currentMethod = method
      const instance = new Client(`http://localhost:${fastify.server.address().port}`)

      if (method === 'QUERY') {
        const response = await instance.request({ path: '/', method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hello: 'world' }) })
        expect(response.statusCode).toBe(200)
      } else {
        const response = await instance.request({ path: '/', method })
        expect(response.statusCode).toBe(200)
      }
    }
  })
})
