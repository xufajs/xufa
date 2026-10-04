'use strict'


const fs = require('node:fs')
const Fastify = require('@xufa/http')

test('should respond with a stream', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.get('/', function (req, reply) {
    const stream = fs.createReadStream(__filename, 'utf8')
    reply.code(200).send(stream)
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => { fastify.close() })

  const response = await fetch(fastifyServer)
  expect(response.ok).toBeTruthy()
  expect(response.headers.get('content-type')).toBe(null)
  expect(response.status).toBe(200)

  const data = await response.text()
  const expected = await fs.promises.readFile(__filename, 'utf8')
  expect(expected.toString()).toBe(data.toString())
})

test('should respond with a stream (error)', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.get('/error', function (req, reply) {
    const stream = fs.createReadStream('not-existing-file', 'utf8')
    reply.code(200).send(stream)
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const response = await fetch(`${fastifyServer}/error`)
  expect(response.ok).toBeFalsy()
  expect(response.status).toBe(500)
})

test('should trigger the onSend hook', async () => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.get('/', (req, reply) => {
    reply.send(fs.createReadStream(__filename, 'utf8'))
  })

  fastify.addHook('onSend', (req, reply, payload, done) => {
    expect(payload._readableState).toBeTruthy()
    reply.header('Content-Type', 'application/javascript')
    done()
  })

  const res = await fastify.inject({
    url: '/'
  })
  expect(res.headers['content-type']).toBe('application/javascript')
  expect(res.payload).toBe(fs.readFileSync(__filename, 'utf8'))
  return fastify.close()
})

test('should trigger the onSend hook only twice if pumping the stream fails, first with the stream, second with the serialized error', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.get('/', (req, reply) => {
    reply.send(fs.createReadStream('not-existing-file', 'utf8'))
  })

  let counter = 0
  fastify.addHook('onSend', (req, reply, payload, done) => {
    if (counter === 0) {
      expect(payload._readableState).toBeTruthy()
    } else if (counter === 1) {
      const error = JSON.parse(payload)
      expect(error.statusCode).toBe(500)
    }
    counter++
    done()
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => { fastify.close() })

  const response = await fetch(fastifyServer)
  expect(response.ok).toBeFalsy()
  expect(response.status).toBe(500)
})
