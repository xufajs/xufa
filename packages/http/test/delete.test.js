'use strict'


const fastify = require('..')()

const schema = {
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

const headersSchema = {
  schema: {
    headers: {
      type: 'object',
      properties: {
        'x-test': {
          type: 'number'
        }
      }
    }
  }
}

const bodySchema = {
  schema: {
    body: {
      type: 'object',
      properties: {
        hello: {
          type: 'string'
        }
      }
    },
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

test('shorthand - delete', (done) => {
  expect.assertions(1)
  try {
    fastify.delete('/', schema, function (req, reply) {
      reply.code(200).send({ hello: 'world' })
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  } finally {
    done()
  }
})

test('shorthand - delete params', async () => {
  expect.assertions(1)
  try {
    fastify.delete('/params/:foo/:test', paramsSchema, function (req, reply) {
      reply.code(200).send(req.params)
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('shorthand - delete, querystring schema', async () => {
  expect.assertions(1)
  try {
    fastify.delete('/query', querySchema, function (req, reply) {
      reply.send(req.query)
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('shorthand - get, headers schema', async () => {
  expect.assertions(1)
  try {
    fastify.delete('/headers', headersSchema, function (req, reply) {
      reply.code(200).send(req.headers)
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('missing schema - delete', async () => {
  expect.assertions(1)
  try {
    fastify.delete('/missing', function (req, reply) {
      reply.code(200).send({ hello: 'world' })
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('body - delete', async () => {
  expect.assertions(1)
  try {
    fastify.delete('/body', bodySchema, function (req, reply) {
      reply.send(req.body)
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

describe('delete tests', () => {
let fastifyServer;
afterAll(() => { fastify.close() })
beforeAll(async () => {
fastifyServer = await fastify.listen({ port: 0 });
})
test('shorthand - request delete', async () => {
    expect.assertions(4)

    const response = await fetch(fastifyServer, {
      method: 'DELETE'
    })
    expect(response.ok).toBeTruthy()
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(response.headers.get('content-length')).toBe('' + body.length)
    expect(JSON.parse(body)).toEqual({ hello: 'world' })
  })
test('shorthand - request delete params schema', async () => {
    expect.assertions(4)

    const response = await fetch(fastifyServer + '/params/world/123', {
      method: 'DELETE'
    })
    expect(response.ok).toBeTruthy()
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(response.headers.get('content-length')).toBe('' + body.length)
    expect(JSON.parse(body)).toEqual({ foo: 'world', test: 123 })
  })
test('shorthand - request delete params schema error', async () => {
    expect.assertions(3)

    const response = await fetch(fastifyServer + '/params/world/string', {
      method: 'DELETE'
    })

    expect(response.ok).toBeFalsy()
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Bad Request',
      code: 'XUFA_ERR_VALIDATION',
      message: 'params/test must be integer',
      statusCode: 400
    })
  })
test('shorthand - request delete headers schema', async () => {
    expect.assertions(4)

    const response = await fetch(fastifyServer + '/headers', {
      method: 'DELETE',
      headers: {
        'x-test': '1'
      }
    })
    expect(response.ok).toBeTruthy()
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(response.headers.get('content-length')).toBe('' + body.length)
    expect(JSON.parse(body)['x-test']).toBe(1)
  })
test('shorthand - request delete headers schema error', async () => {
    expect.assertions(3)

    const response = await fetch(fastifyServer + '/headers', {
      method: 'DELETE',
      headers: {
        'x-test': 'abc'
      }
    })

    expect(response.ok).toBeFalsy()
    expect(response.status).toBe(400)
    const body = await response.text()
    expect(JSON.parse(body)).toEqual({
      error: 'Bad Request',
      code: 'XUFA_ERR_VALIDATION',
      message: 'headers/x-test must be number',
      statusCode: 400
    })
  })
test('shorthand - request delete querystring schema', async () => {
    expect.assertions(4)

    const response = await fetch(fastifyServer + '/query?hello=123', {
      method: 'DELETE'
    })
    expect(response.ok).toBeTruthy()
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(response.headers.get('content-length')).toBe('' + body.length)
    expect(JSON.parse(body)).toEqual({ hello: 123 })
  })
test('shorthand - request delete querystring schema error', async () => {
    expect.assertions(3)

    const response = await fetch(fastifyServer + '/query?hello=world', {
      method: 'DELETE'
    })

    expect(response.ok).toBeFalsy()
    expect(response.status).toBe(400)
    const body = await response.text()
    expect(JSON.parse(body)).toEqual({
      error: 'Bad Request',
      code: 'XUFA_ERR_VALIDATION',
      message: 'querystring/hello must be integer',
      statusCode: 400
    })
  })
test('shorthand - request delete missing schema', async () => {
    expect.assertions(4)

    const response = await fetch(fastifyServer + '/missing', {
      method: 'DELETE'
    })
    expect(response.ok).toBeTruthy()
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(response.headers.get('content-length')).toBe('' + body.length)
    expect(JSON.parse(body)).toEqual({ hello: 'world' })
  })
test('shorthand - delete with body', async () => {
    expect.assertions(3)

    const response = await fetch(fastifyServer + '/body', {
      method: 'DELETE',
      body: JSON.stringify({ hello: 'world' }),
      headers: {
        'Content-Type': 'application/json'
      }
    })
    expect(response.ok).toBeTruthy()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ hello: 'world' })
  })
})

test('shorthand - delete with application/json Content-Type header and null body', (done) => {
  expect.assertions(4)
  const fastify = require('..')()
  fastify.delete('/', {}, (req, reply) => {
    expect(req.body).toBe(null)
    reply.send(req.body)
  })
  fastify.inject({
    method: 'DELETE',
    url: '/',
    headers: { 'Content-Type': 'application/json' },
    body: 'null'
  }, (err, response) => {
    expect(err).toBeFalsy()
    expect(response.statusCode).toBe(200)
    expect(response.payload.toString()).toBe('null')
    done()
  })
})

// https://github.com/fastify/fastify/issues/936
// Skip this test because this is an invalid request
test.skip('shorthand - delete with application/json Content-Type header and without body', async () => {
  expect.assertions(4)
  const fastify = require('..')()
  fastify.delete('/', {}, (req, reply) => {
    expect(req.body).toBe(undefined)
    reply.send(req.body)
  })
  fastify.inject({
    method: 'DELETE',
    url: '/',
    headers: { 'Content-Type': 'application/json' },
    body: null
  }, (err, response) => {
    expect(err).toBeFalsy()
    expect(response.statusCode).toBe(200)
    expect(response.payload.toString()).toBe('')
  })

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
