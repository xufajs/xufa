'use strict'


const { Client, fetch } = require('undici')
const fastify = require('@xufa/http')()

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

const nullSchema = {
  schema: {
    response: {
      '2xx': {
        type: 'null'
      }
    }
  }
}

const numberSchema = {
  schema: {
    response: {
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
        },
        'Y-Test': {
          type: 'number'
        }
      }
    }
  }
}

test('shorthand - get', async () => {
  expect.assertions(1)
  try {
    fastify.get('/', schema, function (req, reply) {
      reply.code(200).send({ hello: 'world' })
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('shorthand - get (return null)', async () => {
  expect.assertions(1)
  try {
    fastify.get('/null', nullSchema, function (req, reply) {
      reply.code(200).send(null)
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('shorthand - get params', async () => {
  expect.assertions(1)
  try {
    fastify.get('/params/:foo/:test', paramsSchema, function (req, reply) {
      reply.code(200).send(req.params)
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('shorthand - get, querystring schema', async () => {
  expect.assertions(1)
  try {
    fastify.get('/query', querySchema, function (req, reply) {
      reply.code(200).send(req.query)
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
    fastify.get('/headers', headersSchema, function (req, reply) {
      reply.code(200).send(req.headers)
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('missing schema - get', async () => {
  expect.assertions(1)
  try {
    fastify.get('/missing', function (req, reply) {
      reply.code(200).send({ hello: 'world' })
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('custom serializer - get', async () => {
  expect.assertions(1)

  function customSerializer (data) {
    return JSON.stringify(data)
  }

  try {
    fastify.get('/custom-serializer', numberSchema, function (req, reply) {
      reply.code(200).serializer(customSerializer).send({ hello: 'world' })
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
    fastify.get('/empty', function (req, reply) {
      reply.code(200).send()
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('send a falsy boolean', async () => {
  expect.assertions(1)
  try {
    fastify.get('/boolean', function (req, reply) {
      reply.code(200).send(false)
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('shorthand - get, set port', async () => {
  expect.assertions(1)
  try {
    fastify.get('/port', headersSchema, function (req, reply) {
      reply.code(200).send({ port: req.port })
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

describe('get test', () => {
afterAll(() => { fastify.close() })
beforeAll(async () => {
await fastify.listen({ port: 0 })
})
test('shorthand - request get', async () => {
    expect.assertions(4)

    const response = await fetch('http://localhost:' + fastify.server.address().port, {
      method: 'GET'
    })
    expect(response.ok).toBeTruthy()
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(response.headers.get('content-length')).toBe('' + body.length)
    expect(JSON.parse(body)).toEqual({ hello: 'world' })
  })
test('shorthand - request get params schema', async () => {
    expect.assertions(4)

    const response = await fetch('http://localhost:' + fastify.server.address().port + '/params/world/123', {
      method: 'GET'
    })
    expect(response.ok).toBeTruthy()
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(response.headers.get('content-length')).toBe('' + body.length)
    expect(JSON.parse(body)).toEqual({ foo: 'world', test: 123 })
  })
test('shorthand - request get params schema error', async () => {
    expect.assertions(3)

    const response = await fetch('http://localhost:' + fastify.server.address().port + '/params/world/string', {
      method: 'GET'
    })
    expect(response.ok).toBeFalsy()
    expect(response.status).toBe(400)
    const body = await response.text()
    expect(JSON.parse(body)).toEqual({
      error: 'Bad Request',
      code: 'XUFA_ERR_VALIDATION',
      message: 'params/test must be integer',
      statusCode: 400
    })
  })
test('shorthand - request get headers schema', async () => {
    expect.assertions(4)

    const response = await fetch('http://localhost:' + fastify.server.address().port + '/headers', {
      method: 'GET',
      headers: {
        'x-test': '1',
        'Y-Test': '3'
      }
    })
    expect(response.ok).toBeTruthy()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body['x-test']).toBe(1)
    expect(body['y-test']).toBe(3)
  })
test('shorthand - request get headers schema error', async () => {
    expect.assertions(3)

    const response = await fetch('http://localhost:' + fastify.server.address().port + '/headers', {
      method: 'GET',
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
test('shorthand - request get querystring schema', async () => {
    expect.assertions(4)

    const response = await fetch('http://localhost:' + fastify.server.address().port + '/query?hello=123', {
      method: 'GET'
    })
    expect(response.ok).toBeTruthy()
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(response.headers.get('content-length')).toBe('' + body.length)
    expect(JSON.parse(body)).toEqual({ hello: 123 })
  })
test('shorthand - request get querystring schema error', async () => {
    expect.assertions(3)

    const response = await fetch('http://localhost:' + fastify.server.address().port + '/query?hello=world', {
      method: 'GET'
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
test('shorthand - request get missing schema', async () => {
    expect.assertions(4)

    const response = await fetch('http://localhost:' + fastify.server.address().port + '/missing', {
      method: 'GET'
    })
    expect(response.ok).toBeTruthy()
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(response.headers.get('content-length')).toBe('' + body.length)
    expect(JSON.parse(body)).toEqual({ hello: 'world' })
  })
test('shorthand - custom serializer', async () => {
    expect.assertions(4)

    const response = await fetch('http://localhost:' + fastify.server.address().port + '/custom-serializer', {
      method: 'GET'
    })
    expect(response.ok).toBeTruthy()
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(response.headers.get('content-length')).toBe('' + body.length)
    expect(JSON.parse(body)).toEqual({ hello: 'world' })
  })
test('shorthand - empty response', async () => {
    expect.assertions(4)

    const response = await fetch('http://localhost:' + fastify.server.address().port + '/empty', {
      method: 'GET'
    })
    expect(response.ok).toBeTruthy()
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(response.headers.get('content-length')).toBe('0')
    expect(body.toString()).toEqual('')
  })
test('shorthand - send a falsy boolean', async () => {
    expect.assertions(3)

    const response = await fetch('http://localhost:' + fastify.server.address().port + '/boolean', {
      method: 'GET'
    })
    expect(response.ok).toBeTruthy()
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body.toString()).toEqual('false')
  })
test('shorthand - send null value', async () => {
    expect.assertions(3)

    const response = await fetch('http://localhost:' + fastify.server.address().port + '/null', {
      method: 'GET'
    })
    expect(response.ok).toBeTruthy()
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body.toString()).toEqual('null')
  })
test('shorthand - request get headers - test fall back port', async () => {
    expect.assertions(2)

    const instance = new Client('http://localhost:' + fastify.server.address().port)

    const response = await instance.request({
      path: '/port',
      method: 'GET',
      headers: {
        host: 'fastify.test'
      }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(await response.body.text())
    expect(body.port).toBe(null)
  })
})
