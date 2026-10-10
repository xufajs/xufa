'use strict'


const Fastify = require('..')

const AJV = require('ajv')
const Schema = require('fluent-json-schema')
const { waitForCb } = require('./helper')
const { kRequestContentType } = require('../lib/symbols')
const { spyWarning } = require('../lib/warnings')
const { XUFASEC002 } = require('../lib/warnings')

const customSchemaCompilers = {
  body: new AJV({
    coerceTypes: false
  }),
  params: new AJV({
    coerceTypes: true
  }),
  querystring: new AJV({
    coerceTypes: true
  })
}

const customValidatorCompiler = req => {
  if (!req.httpPart) {
    throw new Error('Missing httpPart')
  }

  const compiler = customSchemaCompilers[req.httpPart]

  if (!compiler) {
    throw new Error(`Missing compiler for ${req.httpPart}`)
  }

  return compiler.compile(req.schema)
}

const schemaA = {
  $id: 'urn:schema:foo',
  type: 'object',
  definitions: {
    foo: { type: 'integer' }
  },
  properties: {
    foo: { $ref: '#/definitions/foo' }
  }
}
const schemaBRefToA = {
  $id: 'urn:schema:response',
  type: 'object',
  required: ['foo'],
  properties: {
    foo: { $ref: 'urn:schema:foo#/definitions/foo' }
  }
}

const schemaCRefToB = {
  $id: 'urn:schema:request',
  type: 'object',
  required: ['foo'],
  properties: {
    foo: { $ref: 'urn:schema:response#/properties/foo' }
  }
}

const schemaArtist = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    work: { type: 'string' }
  },
  required: ['name', 'work']
}

test('Basic validation test', (testDone) => {
  expect.assertions(6)

  const fastify = Fastify()
  fastify.post('/', {
    schema: {
      body: schemaArtist
    }
  }, function (req, reply) {
    reply.code(200).send(req.body.name)
  })

  const completion = waitForCb({ steps: 2 })
  fastify.inject({
    method: 'POST',
    payload: {
      name: 'michelangelo',
      work: 'sculptor, painter, architect and poet'
    },
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toEqual('michelangelo')
    expect(res.statusCode).toBe(200)
    completion.stepIn()
  })
  fastify.inject({
    method: 'POST',
    payload: { name: 'michelangelo' },
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.json()).toEqual({ statusCode: 400, code: 'XUFA_ERR_VALIDATION', error: 'Bad Request', message: "body must have required property 'work'" })
    expect(res.statusCode).toBe(400)
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('Different schema per content type', (testDone) => {
  expect.assertions(12)

  const fastify = Fastify()
  fastify.addContentTypeParser('application/octet-stream', {
    parseAs: 'buffer'
  }, async function (_, payload) {
    return payload
  })
  fastify.post('/', {
    schema: {
      body: {
        content: {
          'application/json': {
            schema: schemaArtist
          },
          'application/octet-stream': {
            schema: {} // Skip validation
          },
          'text/plain': {
            schema: { type: 'string' }
          }
        }
      }
    }
  }, async function (req, reply) {
    return reply.send(req.body)
  })

  const completion = waitForCb({ steps: 4 })
  fastify.inject({
    url: '/',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      name: 'michelangelo',
      work: 'sculptor, painter, architect and poet'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload).name).toEqual('michelangelo')
    expect(res.statusCode).toBe(200)
    completion.stepIn()
  })
  fastify.inject({
    url: '/',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { name: 'michelangelo' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.json()).toEqual({ statusCode: 400, code: 'XUFA_ERR_VALIDATION', error: 'Bad Request', message: "body must have required property 'work'" })
    expect(res.statusCode).toBe(400)
    completion.stepIn()
  })
  fastify.inject({
    url: '/',
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: Buffer.from('AAAAAAAA')
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toEqual('AAAAAAAA')
    expect(res.statusCode).toBe(200)
    completion.stepIn()
  })
  fastify.inject({
    url: '/',
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: 'AAAAAAAA'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toEqual('AAAAAAAA')
    expect(res.statusCode).toBe(200)
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('Skip validation if no schema for content type', (testDone) => {
  expect.assertions(3)

  const fastify = Fastify()
  fastify.post('/', {
    schema: {
      body: {
        content: {
          'application/json': {
            schema: schemaArtist
          }
          // No schema for 'text/plain'
        }
      }
    }
  }, async function (req, reply) {
    return reply.send(req.body)
  })
  fastify.inject({
    url: '/',
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: 'AAAAAAAA'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toEqual('AAAAAAAA')
    expect(res.statusCode).toBe(200)
    testDone()
  })
})

test('Skip validation if no content type schemas', (testDone) => {
  expect.assertions(3)

  const fastify = Fastify()
  fastify.post('/', {
    schema: {
      body: {
        content: {
          // No schemas
        }
      }
    }
  }, async function (req, reply) {
    return reply.send(req.body)
  })
  fastify.inject({
    url: '/',
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: 'AAAAAAAA'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toEqual('AAAAAAAA')
    expect(res.statusCode).toBe(200)
    testDone()
  })
})

test('External AJV instance', (testDone) => {
  expect.assertions(5)

  const fastify = Fastify()
  const ajv = new AJV()
  ajv.addSchema(schemaA)
  ajv.addSchema(schemaBRefToA)

  // the user must provide the schemas to fastify also
  fastify.addSchema(schemaA)
  fastify.addSchema(schemaBRefToA)

  fastify.setValidatorCompiler(({ schema, method, url, httpPart }) => {
    expect('custom validator compiler called').toBeTruthy()
    return ajv.compile(schema)
  })

  fastify.post('/', {
    handler (req, reply) { reply.send({ foo: 1 }) },
    schema: {
      body: schemaCRefToB,
      response: {
        '2xx': ajv.getSchema('urn:schema:response').schema
      }
    }
  })

  const completion = waitForCb({ steps: 2 })
  fastify.inject({
    method: 'POST',
    url: '/',
    payload: { foo: 42 }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    completion.stepIn()
  })
  fastify.inject({
    method: 'POST',
    url: '/',
    payload: { foo: 'not a number' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('Encapsulation', (testDone) => {
  expect.assertions(21)

  const fastify = Fastify()
  const ajv = new AJV()
  ajv.addSchema(schemaA)
  ajv.addSchema(schemaBRefToA)

  // the user must provide the schemas to fastify also
  fastify.addSchema(schemaA)
  fastify.addSchema(schemaBRefToA)

  fastify.register((instance, opts, done) => {
    const validator = ({ schema, method, url, httpPart }) => {
      expect('custom validator compiler called').toBeTruthy()
      return ajv.compile(schema)
    }
    instance.setValidatorCompiler(validator)
    instance.post('/one', {
      handler (req, reply) { reply.send({ foo: 'one' }) },
      schema: {
        body: ajv.getSchema('urn:schema:response').schema
      }
    })

    instance.register((instance, opts, done) => {
      instance.post('/two', {
        handler (req, reply) {
          expect(instance.validatorCompiler).toEqual(validator)
          reply.send({ foo: 'two' })
        },
        schema: {
          body: ajv.getSchema('urn:schema:response').schema
        }
      })

      const anotherValidator = ({ schema, method, url, httpPart }) => {
        return () => { return true } // always valid
      }
      instance.post('/three', {
        validatorCompiler: anotherValidator,
        handler (req, reply) {
          expect(instance.validatorCompiler).toEqual(validator)
          reply.send({ foo: 'three' })
        },
        schema: {
          body: ajv.getSchema('urn:schema:response').schema
        }
      })
      done()
    })
    done()
  })

  fastify.register((instance, opts, done) => {
    instance.post('/clean', function (req, reply) {
      expect(instance.validatorCompiler).toBe(undefined)
      reply.send({ foo: 'bar' })
    })
    done()
  })

  const completion = waitForCb({ steps: 6 })
  fastify.inject({
    method: 'POST',
    url: '/one',
    payload: { foo: 1 }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ foo: 'one' })
    completion.stepIn()
  })
  fastify.inject({
    method: 'POST',
    url: '/one',
    payload: { wrongFoo: 'bar' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    completion.stepIn()
  })
  fastify.inject({
    method: 'POST',
    url: '/two',
    payload: { foo: 2 }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ foo: 'two' })
    completion.stepIn()
  })
  fastify.inject({
    method: 'POST',
    url: '/two',
    payload: { wrongFoo: 'bar' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    completion.stepIn()
  })
  fastify.inject({
    method: 'POST',
    url: '/three',
    payload: { wrongFoo: 'but works' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ foo: 'three' })
    completion.stepIn()
  })
  fastify.inject({
    method: 'POST',
    url: '/clean',
    payload: { wrongFoo: 'bar' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ foo: 'bar' })
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('Triple $ref with a simple $id', (testDone) => {
  expect.assertions(7)

  const fastify = Fastify()
  const ajv = new AJV()
  ajv.addSchema(schemaA)
  ajv.addSchema(schemaBRefToA)
  ajv.addSchema(schemaCRefToB)

  // the user must provide the schemas to fastify also
  fastify.addSchema(schemaA)
  fastify.addSchema(schemaBRefToA)
  fastify.addSchema(schemaCRefToB)

  fastify.setValidatorCompiler(({ schema, method, url, httpPart }) => {
    expect('custom validator compiler called').toBeTruthy()
    return ajv.compile(schema)
  })

  fastify.post('/', {
    handler (req, reply) { reply.send({ foo: 105, bar: 'foo' }) },
    schema: {
      body: ajv.getSchema('urn:schema:request').schema,
      response: {
        '2xx': ajv.getSchema('urn:schema:response').schema
      }
    }
  })

  const completion = waitForCb({ steps: 2 })
  fastify.inject({
    method: 'POST',
    url: '/',
    payload: { foo: 43 }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ foo: 105 })
    completion.stepIn()
  })
  fastify.inject({
    method: 'POST',
    url: '/',
    payload: { fool: 'bar' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toEqual("body must have required property 'foo'")
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('Extending schema', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.addSchema({
    $id: 'address.id',
    type: 'object',
    definitions: {
      address: {
        type: 'object',
        properties: {
          city: { type: 'string' },
          state: { type: 'string' }
        },
        required: ['city', 'state']
      }
    }
  })

  fastify.post('/', {
    handler (req, reply) { reply.send('works') },
    schema: {
      body: {
        type: 'object',
        properties: {
          billingAddress: { $ref: 'address.id#/definitions/address' },
          shippingAddress: {
            allOf: [
              { $ref: 'address.id#/definitions/address' },
              {
                type: 'object',
                properties: { type: { enum: ['residential', 'business'] } },
                required: ['type']
              }
            ]
          }
        }
      }
    }
  })
  fastify.inject({
    method: 'POST',
    url: '/',
    payload: {
      shippingAddress: {
        city: 'Forlì',
        state: 'FC'
      }
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
  })
  fastify.inject({
    method: 'POST',
    url: '/',
    payload: {
      shippingAddress: {
        city: 'Forlì',
        state: 'FC',
        type: 'business'
      }
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    testDone()
  })
})

test('Should work with nested ids', (testDone) => {
  expect.assertions(6)
  const fastify = Fastify()

  fastify.addSchema({
    $id: 'test',
    type: 'object',
    properties: {
      id: { type: 'number' }
    }
  })

  fastify.addSchema({
    $id: 'greetings',
    type: 'string'
  })

  fastify.post('/:id', {
    handler (req, reply) { reply.send(typeof req.params.id) },
    schema: {
      params: { $ref: 'test#' },
      body: {
        type: 'object',
        properties: {
          hello: { $ref: 'greetings#' }
        }
      }
    }
  })

  const completion = waitForCb({ steps: 2 })
  fastify.inject({
    method: 'POST',
    url: '/123',
    payload: {
      hello: 'world'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('number')
    completion.stepIn()
  })
  fastify.inject({
    method: 'POST',
    url: '/abc',
    payload: {
      hello: 'world'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toBe('params/id must be number')
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('Use the same schema across multiple routes', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.addSchema({
    $id: 'test',
    type: 'object',
    properties: {
      id: { type: 'number' }
    }
  })

  fastify.get('/first/:id', {
    handler (req, reply) { reply.send(typeof req.params.id) },
    schema: {
      params: { $ref: 'test#' }
    }
  })

  fastify.get('/second/:id', {
    handler (req, reply) { reply.send(typeof req.params.id) },
    schema: {
      params: { $ref: 'test#' }
    }
  })

  const validTestCases = [
    '/first/123',
    '/second/123'
  ]

  for (const url of validTestCases) {
    const res = await fastify.inject({
      url,
      method: 'GET'
    })

    expect(res.payload).toBe('number')
  }

  const invalidTestCases = [
    '/first/abc',
    '/second/abc'
  ]

  for (const url of invalidTestCases) {
    const res = await fastify.inject({
      url,
      method: 'GET'
    })
    expect(res.statusCode).toBe(400)
  }
})

test('JSON Schema validation keywords', (testDone) => {
  expect.assertions(6)
  const fastify = Fastify()

  fastify.addSchema({
    $id: 'test',
    type: 'object',
    properties: {
      ip: {
        type: 'string',
        format: 'ipv4'
      }
    }
  })

  fastify.get('/:ip', {
    handler (req, reply) { reply.send(typeof req.params.ip) },
    schema: {
      params: { $ref: 'test#' }
    }
  })

  const completion = waitForCb({ steps: 2 })
  fastify.inject({
    method: 'GET',
    url: '/127.0.0.1'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('string')
    completion.stepIn()
  })
  fastify.inject({
    method: 'GET',
    url: '/localhost'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({
      statusCode: 400,
      code: 'XUFA_ERR_VALIDATION',
      error: 'Bad Request',
      message: 'params/ip must match format "ipv4"'
    })
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('Nested id calls', (testDone) => {
  expect.assertions(6)
  const fastify = Fastify()

  fastify.addSchema({
    $id: 'test',
    type: 'object',
    properties: {
      ip: {
        type: 'string',
        format: 'ipv4'
      }
    }
  })

  fastify.addSchema({
    $id: 'hello',
    type: 'object',
    properties: {
      host: { $ref: 'test#' }
    }
  })

  fastify.post('/', {
    handler (req, reply) { reply.send(typeof req.body.host.ip) },
    schema: {
      body: { $ref: 'hello#' }
    }
  })

  const completion = waitForCb({ steps: 2 })
  fastify.inject({
    method: 'POST',
    url: '/',
    payload: { host: { ip: '127.0.0.1' } }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('string')
    completion.stepIn()
  })
  fastify.inject({
    method: 'POST',
    url: '/',
    payload: { host: { ip: 'localhost' } }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({
      error: 'Bad Request',
      message: 'body/host/ip must match format "ipv4"',
      statusCode: 400,
      code: 'XUFA_ERR_VALIDATION'
    })
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('Use the same schema id in different places', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.addSchema({
    $id: 'test',
    type: 'object',
    properties: {
      id: { type: 'number' }
    }
  })

  fastify.post('/', {
    handler (req, reply) { reply.send({ id: req.body.id / 2 }) },
    schema: {
      body: { $ref: 'test#' },
      response: {
        200: { $ref: 'test#' }
      }
    }
  })
  fastify.inject({
    method: 'POST',
    url: '/',
    payload: { id: 42 }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.json()).toEqual({ id: 21 })
    testDone()
  })
})

test('Use shared schema and $ref with $id ($ref to $id)', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify()

  fastify.addSchema({
    $id: 'http://foo/test',
    type: 'object',
    properties: {
      id: { type: 'number' }
    }
  })

  const body = {
    $id: 'http://foo/user',
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    definitions: {
      address: {
        $id: '#address',
        type: 'object',
        properties: {
          city: { type: 'string' }
        }
      }
    },
    required: ['address'],
    properties: {
      test: { $ref: 'http://foo/test#' }, // to external
      address: { $ref: '#address' } // to local
    }
  }

  fastify.post('/', {
    handler (req, reply) { reply.send(req.body.test) },
    schema: {
      body,
      response: {
        200: { $ref: 'http://foo/test#' }
      }
    }
  })

  const id = Date.now()
  const completion = waitForCb({ steps: 2 })
  fastify.inject({
    method: 'POST',
    url: '/',
    payload: {
      address: { city: 'New Node' },
      test: { id }
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.json()).toEqual({ id })
    completion.stepIn()
  })
  fastify.inject({
    method: 'POST',
    url: '/',
    payload: { test: { id } }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({
      error: 'Bad Request',
      message: "body must have required property 'address'",
      statusCode: 400,
      code: 'XUFA_ERR_VALIDATION'
    })
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('Use items with $ref', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.addSchema({
    $id: 'http://fastify.test/ref-to-external-validator.json',
    type: 'object',
    properties: {
      hello: { type: 'string' }
    }
  })

  const body = {
    type: 'array',
    items: { $ref: 'http://fastify.test/ref-to-external-validator.json#' }
  }

  fastify.post('/', {
    schema: { body },
    handler: (_, r) => { r.send('ok') }
  })

  const completion = waitForCb({ steps: 2 })
  fastify.inject({
    method: 'POST',
    url: '/',
    payload: [{ hello: 'world' }]
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('ok')
    completion.stepIn()
  })
  fastify.inject({
    method: 'POST',
    url: '/',
    payload: { hello: 'world' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('Use $ref to /definitions', (testDone) => {
  expect.assertions(6)
  const fastify = Fastify()

  fastify.addSchema({
    $id: 'test',
    type: 'object',
    properties: {
      id: { type: 'number' }
    }
  })

  const body = {
    type: 'object',
    definitions: {
      address: {
        $id: '#otherId',
        type: 'object',
        properties: {
          city: { type: 'string' }
        }
      }
    },
    properties: {
      test: { $ref: 'test#' },
      address: { $ref: '#/definitions/address' }
    },
    required: ['address', 'test']
  }

  fastify.post('/', {
    schema: {
      body,
      response: {
        200: body
      }
    },
    handler: (req, reply) => {
      req.body.removeThis = 'it should not be serialized'
      reply.send(req.body)
    }
  })

  const payload = {
    address: { city: 'New Node' },
    test: { id: Date.now() }
  }
  const completion = waitForCb({ steps: 2 })
  fastify.inject({
    method: 'POST',
    url: '/',
    payload
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual(payload)
    completion.stepIn()
  })
  fastify.inject({
    method: 'POST',
    url: '/',
    payload: {
      address: { city: 'New Node' },
      test: { id: 'wrong' }
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({
      error: 'Bad Request',
      message: 'body/test/id must be number',
      statusCode: 400,
      code: 'XUFA_ERR_VALIDATION'
    })
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('Custom AJV settings - pt1', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        properties: {
          num: { type: 'integer' }
        }
      }
    },
    handler: (req, reply) => {
      expect(req.body.num).toBe(12)
      reply.send(req.body)
    }
  })
  fastify.inject({
    method: 'POST',
    url: '/',
    payload: {
      num: '12'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ num: 12 })
    testDone()
  })
})

test('Custom AJV settings - pt2', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify({
    ajv: {
      customOptions: {
        coerceTypes: false
      }
    }
  })

  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        properties: {
          num: { type: 'integer' }
        }
      }
    },
    handler: (req, reply) => {
      expect.fail('the handler is not called because the "12" is not coerced to number')
    }
  })
  fastify.inject({
    method: 'POST',
    url: '/',
    payload: {
      num: '12'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    testDone()
  })
})

test('Custom AJV settings on different parameters - pt1', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.setValidatorCompiler(customValidatorCompiler)

  fastify.post('/api/:id', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          id: { type: 'integer' }
        }
      },
      body: {
        type: 'object',
        properties: {
          num: { type: 'number' }
        },
        required: ['num']
      }
    },
    handler: (req, reply) => {
      expect.fail('the handler is not called because the "12" is not coerced to number')
    }
  })
  fastify.inject({
    method: 'POST',
    url: '/api/42',
    payload: {
      num: '12'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    testDone()
  })
})

test('Custom AJV settings on different parameters - pt2', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.setValidatorCompiler(customValidatorCompiler)

  fastify.post('/api/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          num: { type: 'number' }
        },
        required: ['num']
      }
    },
    handler: (req, reply) => {
      expect(typeof req.params.id).toEqual('number')
      expect(typeof req.body.num).toEqual('number')
      expect(req.params.id).toEqual(42)
      expect(req.body.num).toEqual(12)
      testDone()
    }
  })
  fastify.inject({
    method: 'POST',
    url: '/api/42',
    payload: {
      num: 12
    }
  })
})

test("The same $id in route's schema must not overwrite others", (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()

  const UserSchema = Schema.object()
    .id('http://mydomain.com/user')
    .title('User schema')
    .description('Contains all user fields')
    .prop('id', Schema.integer())
    .prop('username', Schema.string().minLength(4))
    .prop('firstName', Schema.string().minLength(1))
    .prop('lastName', Schema.string().minLength(1))
    .prop('fullName', Schema.string().minLength(1))
    .prop('email', Schema.string())
    .prop('password', Schema.string().minLength(6))
    .prop('bio', Schema.string())

  const userCreateSchema = UserSchema.only([
    'username',
    'firstName',
    'lastName',
    'email',
    'bio',
    'password',
    'password_confirm'
  ])
    .required([
      'username',
      'firstName',
      'lastName',
      'email',
      'bio',
      'password'
    ])

  const userPatchSchema = UserSchema.only([
    'firstName',
    'lastName',
    'bio'
  ])

  fastify
    .patch('/user/:id', {
      schema: { body: userPatchSchema },
      handler: () => { return 'ok' }
    })
    .post('/user', {
      schema: { body: userCreateSchema },
      handler: () => { return 'ok' }
    })

  const completion = waitForCb({ steps: 2 })
  fastify.inject({
    method: 'POST',
    url: '/user',
    body: {}
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.json().message).toEqual("body must have required property 'username'")
    completion.stepIn()
  })
  fastify.inject({
    url: '/user/1',
    method: 'PATCH',
    body: {}
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toEqual('ok')
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('Custom validator compiler should not mutate schema', async () => {
  expect.assertions(2)
  class Headers { }
  const fastify = Fastify()

  fastify.setValidatorCompiler(({ schema, method, url, httpPart }) => {
    expect(schema instanceof Headers).toBeTruthy()
    return () => { }
  })

  fastify.get('/', {
    schema: {
      headers: new Headers()
    }
  }, () => { })

  await fastify.ready()
})

test('Custom validator builder override by custom validator compiler', async () => {
  expect.assertions(3)
  const ajvDefaults = {
    removeAdditional: true,
    coerceTypes: true,
    allErrors: true
  }
  const ajv1 = new AJV(ajvDefaults).addKeyword({ keyword: 'extended_one', type: 'object', validator: () => true })
  const ajv2 = new AJV(ajvDefaults).addKeyword({ keyword: 'extended_two', type: 'object', validator: () => true })
  const fastify = Fastify({
    schemaController: {
      compilersFactory: {
        buildValidator: () => (routeSchemaDef) => ajv1.compile(routeSchemaDef.schema)
      }
    }
  })

  fastify.setValidatorCompiler((routeSchemaDef) => ajv2.compile(routeSchemaDef.schema))

  fastify.post('/two/:id', {
    schema: {
      params: {
        type: 'object',
        extended_two: true,
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      }
    },
    handler: (req, _reply) => {
      expect(typeof req.params.id).toEqual('number')
      expect(req.params.id).toEqual(43)
      return 'ok'
    }
  })

  await fastify.ready()

  const two = await fastify.inject({
    method: 'POST',
    url: '/two/43'
  })
  expect(two.statusCode).toBe(200)
})

test('Custom validator builder override by custom validator compiler in child instance', async () => {
  expect.assertions(6)
  const ajvDefaults = {
    removeAdditional: true,
    coerceTypes: true,
    allErrors: true
  }
  const ajv1 = new AJV(ajvDefaults).addKeyword({ keyword: 'extended_one', type: 'object', validator: () => true })
  const ajv2 = new AJV(ajvDefaults).addKeyword({ keyword: 'extended_two', type: 'object', validator: () => true })
  const fastify = Fastify({
    schemaController: {
      compilersFactory: {
        buildValidator: () => (routeSchemaDef) => ajv1.compile(routeSchemaDef.schema)
      }
    }
  })

  fastify.register((embedded, _opts, done) => {
    embedded.setValidatorCompiler((routeSchemaDef) => ajv2.compile(routeSchemaDef.schema))
    embedded.post('/two/:id', {
      schema: {
        params: {
          type: 'object',
          extended_two: true,
          properties: {
            id: { type: 'number' }
          },
          required: ['id']
        }
      },
      handler: (req, _reply) => {
        expect(typeof req.params.id).toEqual('number')
        expect(req.params.id).toEqual(43)
        return 'ok'
      }
    })
    done()
  })

  fastify.post('/one/:id', {
    schema: {
      params: {
        type: 'object',
        extended_one: true,
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      }
    },
    handler: (req, _reply) => {
      expect(typeof req.params.id).toEqual('number')
      expect(req.params.id).toEqual(42)
      return 'ok'
    }
  })

  await fastify.ready()

  const one = await fastify.inject({
    method: 'POST',
    url: '/one/42'
  })
  expect(one.statusCode).toBe(200)

  const two = await fastify.inject({
    method: 'POST',
    url: '/two/43'
  })
  expect(two.statusCode).toBe(200)
})

test('Schema validation when no content type is provided', async () => {
  // this case should not be happened in normal use-case,
  // it is added for the completeness of code branch
  const fastify = Fastify()

  fastify.post('/', {
    schema: {
      body: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                foo: { type: 'string' }
              },
              required: ['foo'],
              additionalProperties: false
            }
          }
        }
      }
    },
    preValidation: async (request) => {
      request.headers['content-type'] = undefined
      request[kRequestContentType] = undefined
    }
  }, async () => 'ok')

  await fastify.ready()

  const invalid = await fastify.inject({
    method: 'POST',
    url: '/',
    headers: {
      'content-type': 'application/json'
    },
    body: { invalid: 'string' }
  })
  expect(invalid.statusCode).toBe(200)
})

test('Schema validation will not be bypass by different content type', async () => {
  const fastify = Fastify()

  fastify.post('/', {
    schema: {
      body: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                foo: { type: 'string' }
              },
              required: ['foo'],
              additionalProperties: false
            }
          }
        }
      }
    }
  }, async () => 'ok')

  await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())
  const address = fastify.listeningOrigin

  let found = await fetch(address, {
    method: 'POST',
    url: '/',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({ foo: 'string' })
  })
  expect(found.status).toBe(200)
  await found.bytes()

  found = await fetch(address, {
    method: 'POST',
    url: '/',
    headers: {
      'content-type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({ foo: 'string' })
  })
  expect(found.status).toBe(200)
  await found.bytes()

  found = await fetch(address, {
    method: 'POST',
    url: '/',
    headers: {
      'content-type': 'application/json\t; charset=utf-8'
    },
    body: JSON.stringify({ foo: 'string' })
  })
  expect(found.status).toBe(200)
  await found.bytes()

  found = await fetch(address, {
    method: 'POST',
    url: '/',
    headers: {
      'content-type': 'application/json ;'
    },
    body: JSON.stringify({ invalid: 'string' })
  })
  expect(found.status).toBe(400)
  expect((await found.json()).code).toBe('XUFA_ERR_VALIDATION')

  let injected = await fastify.inject({
    method: 'POST',
    url: '/',
    headers: {
      'content-type': ' application/json'
    },
    payload: JSON.stringify({ invalid: 'string' })
  })
  expect(injected.statusCode).toBe(400)
  expect(injected.json().code).toBe('XUFA_ERR_VALIDATION')

  injected = await fastify.inject({
    method: 'POST',
    url: '/',
    headers: {
      'content-type': ' application/json'
    },
    payload: JSON.stringify({ foo: 'string' })
  })
  expect(injected.statusCode).toBe(200)

  found = await fetch(address, {
    method: 'POST',
    url: '/',
    headers: {
      'content-type': 'ApPlIcAtIoN/JsOn;'
    },
    body: JSON.stringify({ invalid: 'string' })
  })
  expect(found.status).toBe(400)
  expect((await found.json()).code).toBe('XUFA_ERR_VALIDATION')

  found = await fetch(address, {
    method: 'POST',
    url: '/',
    headers: {
      'content-type': 'ApPlIcAtIoN/JsOn ;'
    },
    body: JSON.stringify({ invalid: 'string' })
  })
  expect(found.status).toBe(400)
  expect((await found.json()).code).toBe('XUFA_ERR_VALIDATION')

  found = await fetch(address, {
    method: 'POST',
    url: '/',
    headers: {
      'content-type': 'ApPlIcAtIoN/JsOn foo;'
    },
    body: JSON.stringify({ invalid: 'string' })
  })
  expect(found.status).toBe(415)
  expect((await found.json()).code).toBe('XUFA_ERR_CTP_INVALID_MEDIA_TYPE')

  found = await fetch(address, {
    method: 'POST',
    url: '/',
    headers: {
      'content-type': 'ApPlIcAtIoN/JsOn \tfoo;'
    },
    body: JSON.stringify({ invalid: 'string' })
  })
  expect(found.status).toBe(415)
  expect((await found.json()).code).toBe('XUFA_ERR_CTP_INVALID_MEDIA_TYPE')

  found = await fetch(address, {
    method: 'POST',
    url: '/',
    headers: {
      'content-type': 'ApPlIcAtIoN/JsOn\t foo;'
    },
    body: JSON.stringify({ invalid: 'string' })
  })
  expect(found.status).toBe(415)
  expect((await found.json()).code).toBe('XUFA_ERR_CTP_INVALID_MEDIA_TYPE')

  found = await fetch(address, {
    method: 'POST',
    url: '/',
    headers: {
      'content-type': 'ApPlIcAtIoN/JsOn \t'
    },
    body: JSON.stringify({ invalid: 'string' })
  })
  expect(found.status).toBe(400)
  expect((await found.json()).code).toBe('XUFA_ERR_VALIDATION')

  found = await fetch(address, {
    method: 'POST',
    url: '/',
    headers: {
      'content-type': 'ApPlIcAtIoN/JsOn\t'
    },
    body: JSON.stringify({ invalid: 'string' })
  })
  expect(found.status).toBe(400)
  expect((await found.json()).code).toBe('XUFA_ERR_VALIDATION')

  found = await fetch(address, {
    method: 'POST',
    url: '/',
    headers: {
      'content-type': 'ApPlIcAtIoN/JsOn\ta'
    },
    body: JSON.stringify({ invalid: 'string' })
  })
  expect(found.status).toBe(415)
  expect((await found.json()).code).toBe('XUFA_ERR_CTP_INVALID_MEDIA_TYPE')

  found = await fetch(address, {
    method: 'POST',
    url: '/',
    headers: {
      'content-type': 'ApPlIcAtIoN/JsOn\ta; charset=utf-8'
    },
    body: JSON.stringify({ invalid: 'string' })
  })
  expect(found.status).toBe(415)
  expect((await found.json()).code).toBe('XUFA_ERR_CTP_INVALID_MEDIA_TYPE')

  found = await fetch(address, {
    method: 'POST',
    url: '/',
    headers: {
      'content-type': 'application/ json'
    },
    body: JSON.stringify({ invalid: 'string' })
  })
  expect(found.status).toBe(415)
  expect((await found.json()).code).toBe('XUFA_ERR_CTP_INVALID_MEDIA_TYPE')
})
test('coercion of empty string to null with nullable types', async () => {
  const assert = require('node:assert')
  const fastify = Fastify()
  fastify.get('/', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          param: { type: ['integer', 'null'] }
        }
      }
    }
  }, async (req, reply) => {
    return { param: req.query.param }
  })

  const res = await fastify.inject({
    method: 'GET',
    url: '/?param='
  })
  assert.strictEqual(JSON.parse(res.payload).param, null)
})

test('header schema dependencies with canonical-case names are enforced', async () => {
  const fastify = Fastify()

  fastify.get('/', {
    schema: {
      headers: {
        type: 'object',
        properties: {
          'X-Admin': { type: 'string', const: 'true' },
          'X-Admin-Token': { type: 'string', const: 'server-secret' }
        },
        dependencies: {
          'X-Admin': ['X-Admin-Token']
        }
      }
    }
  }, async () => {
    return { adminAction: true }
  })

  await fastify.ready()

  // Missing the token required by the dependency must be rejected even though
  // the dependency trigger is written in canonical case. Node.js stores the
  // received header as `x-admin`, and the normalized schema must lowercase the
  // dependency trigger so Ajv sees it and enforces the token assertion.
  const missingToken = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: { 'X-Admin': 'true' }
  })
  expect(missingToken.statusCode).toBe(400)
  expect(missingToken.json().code).toBe('XUFA_ERR_VALIDATION')

  // Direct property constraints remain active: a wrong token is rejected too.
  const wrongToken = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: { 'X-Admin': 'true', 'X-Admin-Token': 'wrong' }
  })
  expect(wrongToken.statusCode).toBe(400)
  expect(wrongToken.json().code).toBe('XUFA_ERR_VALIDATION')

  const valid = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: { 'X-Admin': 'true', 'X-Admin-Token': 'server-secret' }
  })
  expect(valid.statusCode).toBe(200)
  expect(valid.json()).toEqual({ adminAction: true })
})

test('header schema dependencies: lowercase-equivalent schema behaves identically', async () => {
  const fastify = Fastify()

  fastify.get('/', {
    schema: {
      headers: {
        type: 'object',
        properties: {
          'x-admin': { type: 'string', const: 'true' },
          'x-admin-token': { type: 'string', const: 'server-secret' }
        },
        dependencies: {
          'x-admin': ['x-admin-token']
        }
      }
    }
  }, async () => {
    return { adminAction: true }
  })

  await fastify.ready()

  const missingToken = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: { 'X-Admin': 'true' }
  })
  expect(missingToken.statusCode).toBe(400)
  expect(missingToken.json().code).toBe('XUFA_ERR_VALIDATION')

  const wrongToken = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: { 'X-Admin': 'true', 'X-Admin-Token': 'wrong' }
  })
  expect(wrongToken.statusCode).toBe(400)
  expect(wrongToken.json().code).toBe('XUFA_ERR_VALIDATION')

  const valid = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: { 'X-Admin': 'true', 'X-Admin-Token': 'server-secret' }
  })
  expect(valid.statusCode).toBe(200)
  expect(valid.json()).toEqual({ adminAction: true })
})

test('header schema dependencies are normalized in nested subschemas', async () => {
  const fastify = Fastify()

  // The dependency lives inside an `allOf` subschema; its trigger and dependent
  // names must be lowercased the same way as root-level `dependencies`.
  fastify.get('/', {
    schema: {
      headers: {
        type: 'object',
        allOf: [{
          properties: { 'X-Admin': { type: 'string', const: 'true' } },
          dependencies: { 'X-Admin': ['X-Admin-Token'] }
        }]
      }
    }
  }, async () => {
    return { ok: true }
  })

  await fastify.ready()

  const missingToken = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: { 'X-Admin': 'true' }
  })
  expect(missingToken.statusCode).toBe(400)
  expect(missingToken.json().code).toBe('XUFA_ERR_VALIDATION')

  const valid = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: { 'X-Admin': 'true', 'X-Admin-Token': 'server-secret' }
  })
  expect(valid.statusCode).toBe(200)
})

test('header schema dependencies are normalized in local $ref definitions', async () => {
  const fastify = Fastify()

  fastify.get('/', {
    schema: {
      headers: {
        $ref: '#/definitions/Headers',
        definitions: {
          Headers: {
            type: 'object',
            properties: {
              'X-Admin': { type: 'string', const: 'true' },
              'X-Admin-Token': { type: 'string', const: 'server-secret' }
            },
            dependencies: {
              'X-Admin': ['X-Admin-Token']
            }
          }
        }
      }
    }
  }, async () => {
    return { ok: true }
  })

  await fastify.ready()

  const missingToken = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: { 'X-Admin': 'true' }
  })
  expect(missingToken.statusCode).toBe(400)
  expect(missingToken.json().code).toBe('XUFA_ERR_VALIDATION')

  const valid = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: { 'X-Admin': 'true', 'X-Admin-Token': 'server-secret' }
  })
  expect(valid.statusCode).toBe(200)
})

test('header schema dependencies: subschema-form dependency values are normalized', async () => {
  const fastify = Fastify()

  fastify.get('/', {
    schema: {
      headers: {
        type: 'object',
        properties: { 'X-Admin': { type: 'string', const: 'true' } },
        dependencies: {
          'X-Admin': {
            properties: { 'X-Admin-Token': { type: 'string', const: 'server-secret' } },
            required: ['X-Admin-Token']
          }
        }
      }
    }
  }, async () => {
    return { ok: true }
  })

  await fastify.ready()

  const missingToken = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: { 'X-Admin': 'true' }
  })
  expect(missingToken.statusCode).toBe(400)
  expect(missingToken.json().code).toBe('XUFA_ERR_VALIDATION')

  const valid = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: { 'X-Admin': 'true', 'X-Admin-Token': 'server-secret' }
  })
  expect(valid.statusCode).toBe(200)
})

test('header schema lowercasing does not mutate the input schema', async () => {
  const headers = {
    type: 'object',
    properties: {
      'X-Admin': { type: 'string', const: 'true' },
      'X-Admin-Token': { type: 'string', const: 'server-secret' }
    },
    dependencies: {
      'X-Admin': ['X-Admin-Token']
    }
  }
  const schema = { headers }
  const schemaBefore = JSON.stringify(schema)
  const headersBefore = JSON.stringify(headers)

  const fastify = Fastify()
  fastify.get('/', { schema }, async () => {
    return { ok: true }
  })
  await fastify.ready()

  expect(JSON.stringify(schema)).toBe(schemaBefore)
  expect(JSON.stringify(headers)).toBe(headersBefore)
})

test('header schema with an external $ref emits XUFASEC002 (case-normalization does not reach it)', async () => {
  const spyData = spyWarning(XUFASEC002)
  onTestFinished(spyData.restore)

  const fastify = Fastify()
  fastify.addSchema({
    $id: 'http://example.com/admin-headers',
    type: 'object',
    properties: {
      'X-Admin': { type: 'string', const: 'true' },
      'X-Admin-Token': { type: 'string', const: 'server-secret' }
    },
    dependencies: { 'X-Admin': ['X-Admin-Token'] }
  })
  fastify.post('/', {
    schema: { headers: { $ref: 'http://example.com/admin-headers#' } }
  }, async () => ({ ok: true }))

  await fastify.ready()

  expect(spyData.callCount()).toBe(1)
  expect(spyData.calls[0].arguments).toEqual(['POST', '/', 'http://example.com/admin-headers#'])
})

test('inline and local $ref header schemas do not emit XUFASEC002', async () => {
  const spyData = spyWarning(XUFASEC002)
  onTestFinished(spyData.restore)

  const fastify = Fastify()
  // inline header schema
  fastify.get('/inline', {
    schema: {
      headers: {
        type: 'object',
        properties: { 'X-Admin': { type: 'string' } },
        dependencies: { 'X-Admin': ['X-Admin-Token'] }
      }
    }
  }, async () => ({ ok: true }))
  // local same-document $ref header schema
  fastify.get('/local', {
    schema: {
      headers: {
        type: 'object',
        $ref: '#/definitions/h',
        definitions: {
          h: {
            type: 'object',
            properties: { 'X-Admin': { type: 'string' } },
            dependencies: { 'X-Admin': ['X-Admin-Token'] }
          }
        }
      }
    }
  }, async () => ({ ok: true }))

  await fastify.ready()

  expect(spyData.callCount()).toBe(0)
})

test('header schema normalization traverses dependent schema keywords', async () => {
  const fastify = Fastify({
    ajv: { customOptions: { strictSchema: false } }
  })

  fastify.get('/', {
    schema: {
      headers: {
        type: 'object',
        dependentSchemas: {
          'X-Admin': {
            properties: { 'X-Admin-Token': { type: 'string' } }
          }
        },
        dependentRequired: {
          'X-Admin': ['X-Admin-Token']
        }
      }
    }
  }, async () => ({ ok: true }))

  await fastify.ready()
  expect(true).toBeTruthy()
})

test('header schema normalization preserves malformed keyword values for validation errors', async () => {
  const fastify = Fastify()

  fastify.get('/', {
    schema: {
      headers: {
        type: 'object',
        properties: null,
        required: null,
        dependencies: null,
        dependentSchemas: null,
        dependentRequired: null,
        definitions: null
      }
    }
  }, async () => ({ ok: true }))

  await expect(fastify.ready()).rejects.toThrow()
})

test('header schema detects an external $ref nested in an array', async () => {
  const spyData = spyWarning(XUFASEC002)
  onTestFinished(spyData.restore)

  const fastify = Fastify()
  fastify.addSchema({
    $id: 'http://example.com/nested-admin-headers',
    type: 'object',
    properties: { 'X-Admin': { type: 'string' } }
  })
  fastify.post('/', {
    schema: {
      headers: {
        allOf: [{ $ref: 'http://example.com/nested-admin-headers#' }]
      }
    }
  }, async () => ({ ok: true }))

  await fastify.ready()

  expect(spyData.callCount()).toBe(1)
  expect(spyData.calls[0].arguments).toEqual([
    'POST',
    '/',
    'http://example.com/nested-admin-headers#'
  ])
})
