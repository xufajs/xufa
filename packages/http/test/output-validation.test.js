'use strict'


const fastify = require('..')()

const opts = {
  schema: {
    response: {
      200: {
        type: 'object',
        properties: {
          hello: {
            type: 'string'
          }
        }
      },
      '2xx': {
        type: 'object',
        properties: {
          hello: {
            type: 'number'
          }
        }
      }
    }
  }
}

test('shorthand - output string', async () => {
  expect.assertions(1)
  try {
    fastify.get('/string', opts, function (req, reply) {
      reply.code(200).send({ hello: 'world' })
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('shorthand - output number', async () => {
  expect.assertions(1)
  try {
    fastify.get('/number', opts, function (req, reply) {
      reply.code(201).send({ hello: 55 })
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('wrong object for schema - output', async () => {
  expect.assertions(1)
  try {
    fastify.get('/wrong-object-for-schema', opts, function (req, reply) {
      // will send { }
      reply.code(201).send({ hello: 'world' })
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('empty response', async () => {
  expect.assertions(1)
  try {
    // no checks
    fastify.get('/empty', opts, function (req, reply) {
      reply.code(204).send()
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('unlisted response code', async () => {
  expect.assertions(1)
  try {
    fastify.get('/400', opts, function (req, reply) {
      reply.code(400).send({ hello: 'DOOM' })
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

describe('start server and run tests', () => {
let fastifyServer;
afterAll(() => fastify.close())
beforeAll(async () => {
fastifyServer = await fastify.listen({ port: 0 });
})
test('shorthand - string get ok', async () => {
    const result = await fetch(fastifyServer + '/string')
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
    const body = await result.text()
    expect(result.headers.get('content-length')).toBe('' + body.length)
    expect(JSON.parse(body)).toEqual({ hello: 'world' })
  })
test('shorthand - number get ok', async () => {
    const result = await fetch(fastifyServer + '/number')
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(201)
    const body = await result.text()
    expect(result.headers.get('content-length')).toBe('' + body.length)
    expect(JSON.parse(body)).toEqual({ hello: 55 })
  })
test('shorthand - wrong-object-for-schema', async () => {
    const result = await fetch(fastifyServer + '/wrong-object-for-schema')
    expect(result.ok).toBeFalsy()
    expect(result.status).toBe(500)
    const body = await result.text()
    expect(result.headers.get('content-length')).toBe('' + body.length)
    expect(JSON.parse(body)).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'The value "world" cannot be converted to a number.'
    })
  })
test('shorthand - empty', async () => {
    const result = await fetch(fastifyServer + '/empty')
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(204)
  })
test('shorthand - 400', async () => {
    const result = await fetch(fastifyServer + '/400')
    expect(result.ok).toBeFalsy()
    expect(result.status).toBe(400)
    const body = await result.text()
    expect(result.headers.get('content-length')).toBe('' + body.length)
    expect(JSON.parse(body)).toEqual({ hello: 'DOOM' })
  })
})
