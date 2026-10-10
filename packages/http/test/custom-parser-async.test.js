'use strict'


const Fastify = require('..')

describe('contentTypeParser should add a custom async parser', () => {
let fastifyServer;

const fastify = Fastify()
fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })
fastify.options('/', (req, reply) => {
    reply.send(req.body)
  })
fastify.addContentTypeParser('application/jsoff', async function (req, payload) {
    const res = await new Promise((resolve, reject) => resolve(payload))
    return res
  })
afterAll(() => fastify.close())
beforeAll(async () => {
fastifyServer = await fastify.listen({ port: 0 });
})
test('in POST', async () => {
    expect.assertions(3)

    const result = await fetch(fastifyServer, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/jsoff'
      },
      body: '{"hello":"world"}'
    })

    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
    expect(await result.json()).toEqual({ hello: 'world' })
  })
test('in OPTIONS', async () => {
    expect.assertions(3)

    const result = await fetch(fastifyServer, {
      method: 'OPTIONS',
      headers: {
        'Content-Type': 'application/jsoff'
      },
      body: '{"hello":"world"}'
    })

    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
    expect(await result.json()).toEqual({ hello: 'world' })
  })
})
