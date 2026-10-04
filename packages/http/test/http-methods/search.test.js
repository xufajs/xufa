'use strict'


const fastify = require('@xufa/http')()
fastify.addHttpMethod('SEARCH', { hasBody: true })

const schema = {
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

const querySchema = {
  querystring: {
    type: 'object',
    properties: {
      hello: {
        type: 'integer'
      }
    }
  }
}

const paramsSchema = {
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

const bodySchema = {
  body: {
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

test('search', async () => {
  expect.assertions(1)
  try {
    fastify.route({
      method: 'SEARCH',
      url: '/',
      schema,
      handler: function (request, reply) {
        reply.code(200).send({ hello: 'world' })
      }
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('search, params schema', async () => {
  expect.assertions(1)
  try {
    fastify.route({
      method: 'SEARCH',
      url: '/params/:foo/:test',
      schema: paramsSchema,
      handler: function (request, reply) {
        reply.code(200).send(request.params)
      }
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('search, querystring schema', async () => {
  expect.assertions(1)
  try {
    fastify.route({
      method: 'SEARCH',
      url: '/query',
      schema: querySchema,
      handler: function (request, reply) {
        reply.code(200).send(request.query)
      }
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('search, body schema', async () => {
  expect.assertions(1)
  try {
    fastify.route({
      method: 'SEARCH',
      url: '/body',
      schema: bodySchema,
      handler: function (request, reply) {
        reply.code(200).send(request.body)
      }
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

describe('search test', () => {
let url;
afterAll(() => { fastify.close() })
beforeAll(async () => {
await fastify.listen({ port: 0 })
url = `http://localhost:${fastify.server.address().port}`;
})
test('request - search', async () => {
    expect.assertions(4)
    const result = await fetch(url, {
      method: 'SEARCH'
    })
    const body = await result.text()
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
    expect(result.headers.get('content-length')).toBe('' + body.length)
    expect(JSON.parse(body)).toEqual({ hello: 'world' })
  })
test('request search params schema', async () => {
    expect.assertions(4)
    const result = await fetch(`${url}/params/world/123`, {
      method: 'SEARCH'
    })
    const body = await result.text()
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
    expect(result.headers.get('content-length')).toBe('' + body.length)
    expect(JSON.parse(body)).toEqual({ foo: 'world', test: 123 })
  })
test('request search params schema error', async () => {
    expect.assertions(3)
    const result = await fetch(`${url}/params/world/string`, {
      method: 'SEARCH'
    })
    const body = await result.text()
    expect(result.status).toBe(400)
    expect(result.headers.get('content-length')).toBe('' + body.length)
    expect(JSON.parse(body)).toEqual({
      error: 'Bad Request',
      code: 'XUFA_ERR_VALIDATION',
      message: 'params/test must be integer',
      statusCode: 400
    })
  })
test('request search querystring schema', async () => {
    expect.assertions(4)
    const result = await fetch(`${url}/query?hello=123`, {
      method: 'SEARCH'
    })
    const body = await result.text()
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
    expect(result.headers.get('content-length')).toBe('' + body.length)
    expect(JSON.parse(body)).toEqual({ hello: 123 })
  })
test('request search querystring schema error', async () => {
    expect.assertions(3)
    const result = await fetch(`${url}/query?hello=world`, {
      method: 'SEARCH'
    })
    const body = await result.text()
    expect(result.status).toBe(400)
    expect(result.headers.get('content-length')).toBe('' + body.length)
    expect(JSON.parse(body)).toEqual({
      error: 'Bad Request',
      code: 'XUFA_ERR_VALIDATION',
      message: 'querystring/hello must be integer',
      statusCode: 400
    })
  })
test('request search body schema', async () => {
    expect.assertions(4)
    const replyBody = { foo: 'bar', test: 5 }
    const result = await fetch(`${url}/body`, {
      method: 'SEARCH',
      body: JSON.stringify(replyBody),
      headers: { 'content-type': 'application/json' }
    })
    const body = await result.text()
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
    expect(result.headers.get('content-length')).toBe('' + body.length)
    expect(JSON.parse(body)).toEqual(replyBody)
  })
test('request search body schema error', async () => {
    expect.assertions(4)
    const result = await fetch(`${url}/body`, {
      method: 'SEARCH',
      body: JSON.stringify({ foo: 'bar', test: 'test' }),
      headers: { 'content-type': 'application/json' }
    })
    const body = await result.text()
    expect(result.ok).toBeFalsy()
    expect(result.status).toBe(400)
    expect(result.headers.get('content-length')).toBe('' + body.length)
    expect(JSON.parse(body)).toEqual({
      error: 'Bad Request',
      code: 'XUFA_ERR_VALIDATION',
      message: 'body/test must be integer',
      statusCode: 400
    })
  })
})
