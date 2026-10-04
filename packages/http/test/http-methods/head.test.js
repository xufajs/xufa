'use strict'


const fastify = require('@xufa/http')()

const schema = {
  schema: {
    response: {
      '2xx': {
        type: 'null'
      }
    }
  }
}

const querySchema = {
  schema: {
    querystring: {
      type: 'object',
      properties: {
        hello: {
          type: 'integer'
        }
      }
    }
  }
}

const paramsSchema = {
  schema: {
    params: {
      type: 'object',
      properties: {
        foo: {
          type: 'string'
        },
        test: {
          type: 'integer'
        }
      }
    }
  }
}

test('shorthand - head', async () => {
  expect.assertions(1)
  try {
    fastify.head('/', schema, function (req, reply) {
      reply.code(200).send(null)
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('shorthand - custom head', async () => {
  expect.assertions(1)
  try {
    fastify.head('/proxy/*', function (req, reply) {
      reply.headers({ 'x-foo': 'bar' })
      reply.code(200).send(null)
    })

    fastify.get('/proxy/*', function (req, reply) {
      reply.code(200).send(null)
    })

    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('shorthand - custom head with constraints', async () => {
  expect.assertions(1)
  try {
    fastify.head('/proxy/*', { constraints: { version: '1.0.0' } }, function (req, reply) {
      reply.headers({ 'x-foo': 'bar' })
      reply.code(200).send(null)
    })

    fastify.get('/proxy/*', { constraints: { version: '1.0.0' } }, function (req, reply) {
      reply.code(200).send(null)
    })

    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('shorthand - should not reset a head route', async () => {
  expect.assertions(1)
  try {
    fastify.get('/query1', function (req, reply) {
      reply.code(200).send(null)
    })

    fastify.put('/query1', function (req, reply) {
      reply.code(200).send(null)
    })

    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('shorthand - should set get and head route in the same api call', async () => {
  expect.assertions(1)
  try {
    fastify.route({
      method: ['HEAD', 'GET'],
      url: '/query4',
      handler: function (req, reply) {
        reply.headers({ 'x-foo': 'bar' })
        reply.code(200).send(null)
      }
    })

    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('shorthand - head params', async () => {
  expect.assertions(1)
  try {
    fastify.head('/params/:foo/:test', paramsSchema, function (req, reply) {
      reply.send(null)
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('shorthand - head, querystring schema', async () => {
  expect.assertions(1)
  try {
    fastify.head('/query', querySchema, function (req, reply) {
      reply.code(200).send(null)
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('missing schema - head', async () => {
  expect.assertions(1)
  try {
    fastify.head('/missing', function (req, reply) {
      reply.code(200).send(null)
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

describe('head test', () => {
let fastifyServer;
afterAll(() => { fastify.close() })
beforeAll(async () => {
fastifyServer = await fastify.listen({ port: 0 });
})
test('shorthand - request head', async () => {
    expect.assertions(2)
    const result = await fetch(fastifyServer, {
      method: 'HEAD'
    })
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
  })
test('shorthand - request head params schema', async () => {
    expect.assertions(2)
    const result = await fetch(`${fastifyServer}/params/world/123`, {
      method: 'HEAD'
    })
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
  })
test('shorthand - request head params schema error', async () => {
    expect.assertions(2)
    const result = await fetch(`${fastifyServer}/params/world/string`, {
      method: 'HEAD'
    })
    expect(result.ok).toBeFalsy()
    expect(result.status).toBe(400)
  })
test('shorthand - request head querystring schema', async () => {
    expect.assertions(2)
    const result = await fetch(`${fastifyServer}/query?hello=123`, {
      method: 'HEAD'
    })
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
  })
test('shorthand - request head querystring schema error', async () => {
    expect.assertions(2)
    const result = await fetch(`${fastifyServer}/query?hello=world`, {
      method: 'HEAD'
    })
    expect(result.ok).toBeFalsy()
    expect(result.status).toBe(400)
  })
test('shorthand - request head missing schema', async () => {
    expect.assertions(2)
    const result = await fetch(`${fastifyServer}/missing`, {
      method: 'HEAD'
    })
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
  })
test('shorthand - request head custom head', async () => {
    expect.assertions(3)
    const result = await fetch(`${fastifyServer}/proxy/test`, {
      method: 'HEAD'
    })
    expect(result.ok).toBeTruthy()
    expect(result.headers.get('x-foo')).toBe('bar')
    expect(result.status).toBe(200)
  })
test('shorthand - request head custom head with constraints', async () => {
    expect.assertions(3)
    const result = await fetch(`${fastifyServer}/proxy/test`, {
      method: 'HEAD',
      headers: {
        version: '1.0.0'
      }
    })
    expect(result.ok).toBeTruthy()
    expect(result.headers.get('x-foo')).toBe('bar')
    expect(result.status).toBe(200)
  })
test('shorthand - should not reset a head route', async () => {
    expect.assertions(2)
    const result = await fetch(`${fastifyServer}/query1`, {
      method: 'HEAD'
    })
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
  })
test('shorthand - should set get and head route in the same api call', async () => {
    expect.assertions(3)
    const result = await fetch(`${fastifyServer}/query4`, {
      method: 'HEAD'
    })
    expect(result.ok).toBeTruthy()
    expect(result.headers.get('x-foo')).toBe('bar')
    expect(result.status).toBe(200)
  })
})
