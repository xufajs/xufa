'use strict'


const handleRequest = require('../../lib/handle-request')
const internals = require('../../lib/handle-request')[Symbol.for('internals')]
const Request = require('../../lib/request')
const Reply = require('../../lib/reply')
const { kRouteContext } = require('../../lib/symbols')
const buildSchema = require('../../lib/validation').compileSchemasForValidation

const Ajv = require('ajv')
const ajv = new Ajv({ coerceTypes: true })

function schemaValidator ({ schema, method, url, httpPart }) {
  const validateFunction = ajv.compile(schema)
  const fn = function (body) {
    const isOk = validateFunction(body)
    if (isOk) return
    return false
  }
  fn.errors = []
  return fn
}

test('handleRequest function - sent reply', async () => {
  expect.assertions(1)
  const request = {}
  const reply = { sent: true }
  const res = handleRequest(null, request, reply)
  expect(res).toBe(undefined)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('handleRequest function - invoke with error', async () => {
  expect.assertions(1)
  const request = {}
  const reply = {}
  reply.send = (err) => expect(err.message).toBe('Kaboom')
  handleRequest(new Error('Kaboom'), request, reply)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('handler function - invalid schema', async () => {
  expect.assertions(1)
  const res = {}
  res.log = { error: () => {}, info: () => {} }
  const context = {
    config: {
      method: 'GET',
      url: '/an-url'
    },
    schema: {
      body: {
        type: 'object',
        properties: {
          hello: { type: 'number' }
        }
      }
    },
    errorHandler: { func: () => { expect('errorHandler called').toBeTruthy() } },
    handler: () => {},
    Reply,
    Request,
    preValidation: [],
    preHandler: [],
    onSend: [],
    onError: [],
    attachValidation: false,
    schemaErrorFormatter: () => new Error()
  }
  buildSchema(context, schemaValidator)
  const request = {
    body: { hello: 'world' },
    [kRouteContext]: context
  }
  internals.handler(request, new Reply(res, request))

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('handler function - reply', async () => {
  expect.assertions(3)
  const res = {}
  res.end = () => {
    expect(res.statusCode).toBe(204)
    expect(true).toBeTruthy()
  }
  res.writeHead = () => {}
  const context = {
    handler: (req, reply) => {
      expect(typeof reply).toBe('object')
      reply.code(204)
      reply.send(undefined)
    },
    Reply,
    Request,
    preValidation: [],
    preHandler: [],
    onSend: [],
    onError: [],
    config: {
      url: '',
      method: ''
    }
  }
  buildSchema(context, schemaValidator)
  internals.handler({ [kRouteContext]: context }, new Reply(res, { [kRouteContext]: context }))

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('handler function - preValidationCallback with finished response', async () => {
  expect.assertions(0)
  const res = {}
  // Be sure to check only `writableEnded` where is available
  res.writableEnded = true
  res.end = () => {
    expect.fail()
  }
  res.writeHead = () => {}
  const context = {
    handler: (req, reply) => {
      expect.fail()
      reply.send(undefined)
    },
    Reply,
    Request,
    preValidation: null,
    preHandler: [],
    onSend: [],
    onError: []
  }
  buildSchema(context, schemaValidator)
  internals.handler({ [kRouteContext]: context }, new Reply(res, { [kRouteContext]: context }))

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('request should be defined in onSend Hook on post request with content type application/json', async () => {
  expect.assertions(6)
  const fastify = require('../..')()

  onTestFinished(() => {
    fastify.close()
  })

  fastify.addHook('onSend', (request, reply, payload, done) => {
    expect(request).toBeTruthy()
    expect(request.raw).toBeTruthy()
    expect(request.id).toBeTruthy()
    expect(request.params).toBeTruthy()
    expect(request.query).toBeTruthy()
    done()
  })
  fastify.post('/', (request, reply) => {
    reply.send(200)
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  const result = await fetch(fastifyServer, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    }
  })

  expect(result.status).toBe(400)
})

test('request should be defined in onSend Hook on post request with content type application/x-www-form-urlencoded', async () => {
  expect.assertions(5)
  const fastify = require('../..')()

  onTestFinished(() => {
    fastify.close()
  })

  fastify.addHook('onSend', (request, reply, payload, done) => {
    expect(request).toBeTruthy()
    expect(request.raw).toBeTruthy()
    expect(request.params).toBeTruthy()
    expect(request.query).toBeTruthy()
    done()
  })
  fastify.post('/', (request, reply) => {
    reply.send(200)
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  const result = await fetch(fastifyServer, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    }
  })

  // a 415 error is expected because of missing content type parser
  expect(result.status).toBe(415)
})

test('request should be defined in onSend Hook on options request with content type application/x-www-form-urlencoded', async () => {
  expect.assertions(15)
  const fastify = require('../..')()

  onTestFinished(() => {
    fastify.close()
  })

  fastify.addHook('onSend', (request, reply, payload, done) => {
    expect(request).toBeTruthy()
    expect(request.raw).toBeTruthy()
    expect(request.params).toBeTruthy()
    expect(request.query).toBeTruthy()
    done()
  })
  fastify.options('/', (request, reply) => {
    reply.send(200)
  })

  // Test 1: OPTIONS with body and content-type header
  const result1 = await fastify.inject({
    method: 'OPTIONS',
    url: '/',
    body: 'first-name=OPTIONS&last-name=METHOD',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    }
  })

  // Content-Type is not supported
  expect(result1.statusCode).toBe(415)

  // Test 2: OPTIONS with content-type header only (no body)
  const result2 = await fastify.inject({
    method: 'OPTIONS',
    url: '/',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    }
  })

  // Content-Type is not supported
  expect(result2.statusCode).toBe(415)

  // Test 3: OPTIONS with body but no content-type header
  const result3 = await fastify.inject({
    method: 'OPTIONS',
    url: '/',
    body: 'first-name=OPTIONS&last-name=METHOD'
  })

  // No content-type with payload
  expect(result3.statusCode).toBe(415)
})

test('request should respond with an error if an unserialized payload is sent inside an async handler', async () => {
  expect.assertions(2)

  const fastify = require('../..')()

  fastify.get('/', (request, reply) => {
    reply.type('text/html')
    return Promise.resolve(request.headers)
  })

  const res = await fastify.inject({
    method: 'GET',
    url: '/'
  })

  expect(res.statusCode).toBe(500)
  expect(JSON.parse(res.payload)).toEqual({
    error: 'Internal Server Error',
    code: 'XUFA_ERR_REP_INVALID_PAYLOAD_TYPE',
    message: 'Attempted to send payload of invalid type \'object\'. Expected a string or Buffer.',
    statusCode: 500
  })
})
