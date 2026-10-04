'use strict'



const fastify = require('..')()

afterAll(() => fastify.close())

const opts = {
  schema: {
    response: {
      '2xx': {
        type: 'object',
        properties: {
          hello: {
            type: 'string'
          }
        }
      }
    }
  }
}

fastify.get('/return', opts, function (req, reply) {
  const promise = new Promise((resolve, reject) => {
    resolve({ hello: 'world' })
  })
  return promise
})

fastify.get('/return-error', opts, function (req, reply) {
  const promise = new Promise((resolve, reject) => {
    reject(new Error('some error'))
  })
  return promise
})

fastify.get('/double', function (req, reply) {
  setTimeout(function () {
    // this should not throw
    reply.send({ hello: 'world' })
  }, 20)
  return Promise.resolve({ hello: '42' })
})

fastify.get('/thenable', opts, function (req, reply) {
  setImmediate(function () {
    reply.send({ hello: 'world' })
  })
  return reply
})

fastify.get('/thenable-error', opts, function (req, reply) {
  setImmediate(function () {
    reply.send(new Error('kaboom'))
  })
  return reply
})

fastify.get('/return-reply', opts, function (req, reply) {
  return reply.send({ hello: 'world' })
})

describe('listening', () => {
let err = null
let fastifyServer
beforeAll(async () => {
try {
fastifyServer = await fastify.listen({ port: 0 })
} catch (error) {
err = error
}
expect(err).toBeFalsy()
})
test('shorthand - fetch return promise es6 get', async () => {
    expect.assertions(4)

    const result = await fetch(`${fastifyServer}/return`)
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
    const body = await result.text()
    expect(result.headers.get('content-length')).toBe('' + body.length)
    expect(JSON.parse(body)).toEqual({ hello: 'world' })
  })
test('shorthand - fetch promise es6 get return error', async () => {
    expect.assertions(2)

    const result = await fetch(`${fastifyServer}/return-error`)
    expect(result.ok).toBeFalsy()
    expect(result.status).toBe(500)
  })
test('fetch promise double send', async () => {
    expect.assertions(3)

    const result = await fetch(`${fastifyServer}/double`)
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
    const body = await result.text()
    expect(JSON.parse(body)).toEqual({ hello: '42' })
  })
test('thenable', async () => {
    expect.assertions(4)

    const result = await fetch(`${fastifyServer}/thenable`)
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
    const body = await result.text()
    expect(result.headers.get('content-length')).toBe('' + body.length)
    expect(JSON.parse(body)).toEqual({ hello: 'world' })
  })
test('thenable (error)', async () => {
    expect.assertions(2)

    const result = await fetch(`${fastifyServer}/thenable-error`)
    expect(result.ok).toBeFalsy()
    expect(result.status).toBe(500)
  })
test('return-reply', async () => {
    expect.assertions(4)

    const result = await fetch(`${fastifyServer}/return-reply`)
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
    const body = await result.text()
    expect(result.headers.get('content-length')).toBe('' + body.length)
    expect(JSON.parse(body)).toEqual({ hello: 'world' })
  })
})
