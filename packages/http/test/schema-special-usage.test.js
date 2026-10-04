'use strict'


const Joi = require('joi')
const yup = require('yup')
const AJV = require('ajv')
const S = require('fluent-json-schema')
const Fastify = require('..')
const ajvMergePatch = require('ajv-merge-patch')
const ajvErrors = require('ajv-errors')
const proxyquire = require('proxyquire')
const { waitForCb } = require('./helper')

// Not applicable to xufa (see port-fastify.js)
test.skip('Ajv plugins array parameter', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify({
    ajv: {
      customOptions: {
        allErrors: true
      },
      plugins: [
        [ajvErrors, { singleError: '@@@@' }]
      ]
    }
  })

  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        properties: {
          foo: {
            type: 'number',
            minimum: 2,
            maximum: 10,
            multipleOf: 2,
            errorMessage: {
              type: 'should be number',
              minimum: 'should be >= 2',
              maximum: 'should be <= 10',
              multipleOf: 'should be multipleOf 2'
            }
          }
        }
      }
    },
    handler (req, reply) { reply.send({ ok: 1 }) }
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    payload: { foo: 99 }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toBe('body/foo should be <= 10@@@@should be multipleOf 2')
    testDone()
  })
})

// Not applicable to xufa (see port-fastify.js)
test.skip('Should handle root $merge keywords in header', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify({
    ajv: {
      plugins: [
        ajvMergePatch
      ]
    }
  })

  fastify.route({
    method: 'GET',
    url: '/',
    schema: {
      headers: {
        $merge: {
          source: {
            type: 'object',
            properties: {
              q: { type: 'string' }
            }
          },
          with: { required: ['q'] }
        }
      }
    },
    handler (req, reply) { reply.send({ ok: 1 }) }
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()

    fastify.inject({
      method: 'GET',
      url: '/'
    }, (err, res) => {
      expect(err).toBeFalsy()
      expect(res.statusCode).toBe(400)
    })

    fastify.inject({
      method: 'GET',
      url: '/',
      headers: { q: 'foo' }
    }, (err, res) => {
      expect(err).toBeFalsy()
      expect(res.statusCode).toBe(200)
      testDone()
    })
  })
})

// Not applicable to xufa (see port-fastify.js)
test.skip('Should handle root $patch keywords in header', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify({
    ajv: {
      plugins: [
        ajvMergePatch
      ]
    }
  })

  fastify.route({
    method: 'GET',
    url: '/',
    schema: {
      headers: {
        $patch: {
          source: {
            type: 'object',
            properties: {
              q: { type: 'string' }
            }
          },
          with: [
            {
              op: 'add',
              path: '/properties/q',
              value: { type: 'number' }
            }
          ]
        }
      }
    },
    handler (req, reply) { reply.send({ ok: 1 }) }
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()

    fastify.inject({
      method: 'GET',
      url: '/',
      headers: {
        q: 'foo'
      }
    }, (err, res) => {
      expect(err).toBeFalsy()
      expect(res.statusCode).toBe(400)
    })

    fastify.inject({
      method: 'GET',
      url: '/',
      headers: { q: 10 }
    }, (err, res) => {
      expect(err).toBeFalsy()
      expect(res.statusCode).toBe(200)
      testDone()
    })
  })
})

// Not applicable to xufa (see port-fastify.js)
test.skip('Should handle $merge keywords in body', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify({
    ajv: {
      plugins: [ajvMergePatch]
    }
  })

  fastify.post('/', {
    schema: {
      body: {
        $merge: {
          source: {
            type: 'object',
            properties: {
              q: {
                type: 'string'
              }
            }
          },
          with: {
            required: ['q']
          }
        }
      }
    },
    handler (req, reply) { reply.send({ ok: 1 }) }
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()

    fastify.inject({
      method: 'POST',
      url: '/'
    }, (err, res) => {
      expect(err).toBeFalsy()
      expect(res.statusCode).toBe(400)
    })

    fastify.inject({
      method: 'POST',
      url: '/',
      payload: { q: 'foo' }
    }, (err, res) => {
      expect(err).toBeFalsy()
      expect(res.statusCode).toBe(200)
      testDone()
    })
  })
})

// Not applicable to xufa (see port-fastify.js)
test.skip('Should handle $patch keywords in body', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify({
    ajv: {
      plugins: [ajvMergePatch]
    }
  })

  fastify.post('/', {
    schema: {
      body: {
        $patch: {
          source: {
            type: 'object',
            properties: {
              q: {
                type: 'string'
              }
            }
          },
          with: [
            {
              op: 'add',
              path: '/properties/q',
              value: { type: 'number' }
            }
          ]
        }
      }
    },
    handler (req, reply) { reply.send({ ok: 1 }) }
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()

    const completion = waitForCb({ steps: 2 })
    fastify.inject({
      method: 'POST',
      url: '/',
      payload: { q: 'foo' }
    }, (err, res) => {
      expect(err).toBeFalsy()
      expect(res.statusCode).toBe(400)
      completion.stepIn()
    })
    fastify.inject({
      method: 'POST',
      url: '/',
      payload: { q: 10 }
    }, (err, res) => {
      expect(err).toBeFalsy()
      expect(res.statusCode).toBe(200)
      completion.stepIn()
    })
    completion.patience.then(testDone)
  })
})

test("serializer read validator's schemas", (testDone) => {
  expect.assertions(4)
  const ajvInstance = new AJV()

  const baseSchema = {
    $id: 'http://fastify.test/schemas/base',
    definitions: {
      hello: { type: 'string' }
    },
    type: 'object',
    properties: {
      hello: { $ref: '#/definitions/hello' }
    }
  }

  const refSchema = {
    $id: 'http://fastify.test/schemas/ref',
    type: 'object',
    properties: {
      hello: { $ref: 'http://fastify.test/schemas/base#/definitions/hello' }
    }
  }

  ajvInstance.addSchema(baseSchema)
  ajvInstance.addSchema(refSchema)

  const fastify = Fastify({
    schemaController: {
      bucket: function factory (storeInit) {
        expect(storeInit).toBeFalsy()
        return {
          getSchemas () {
            return {
              [baseSchema.$id]: ajvInstance.getSchema(baseSchema.$id).schema,
              [refSchema.$id]: ajvInstance.getSchema(refSchema.$id).schema
            }
          }
        }
      }
    }
  })

  fastify.setValidatorCompiler(function ({ schema }) {
    return ajvInstance.compile(schema)
  })

  fastify.get('/', {
    schema: {
      response: {
        '2xx': ajvInstance.getSchema('http://fastify.test/schemas/ref').schema
      }
    },
    handler (req, res) { res.send({ hello: 'world', evict: 'this' }) }
  })

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ hello: 'world' })
    testDone()
  })
})

test('setSchemaController in a plugin', (testDone) => {
  expect.assertions(5)
  const baseSchema = {
    $id: 'urn:schema:base',
    definitions: {
      hello: { type: 'string' }
    },
    type: 'object',
    properties: {
      hello: { $ref: '#/definitions/hello' }
    }
  }

  const refSchema = {
    $id: 'urn:schema:ref',
    type: 'object',
    properties: {
      hello: { $ref: 'urn:schema:base#/definitions/hello' }
    }
  }

  const ajvInstance = new AJV()
  ajvInstance.addSchema(baseSchema)
  ajvInstance.addSchema(refSchema)

  const fastify = Fastify({ exposeHeadRoutes: false })
  fastify.register(schemaPlugin)
  fastify.get('/', {
    schema: {
      query: ajvInstance.getSchema('urn:schema:ref').schema,
      response: {
        '2xx': ajvInstance.getSchema('urn:schema:ref').schema
      }
    },
    handler (req, res) {
      res.send({ hello: 'world', evict: 'this' })
    }
  })

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ hello: 'world' })
    testDone()
  })

  async function schemaPlugin (server) {
    server.setSchemaController({
      bucket () {
        expect('the bucket is created').toBeTruthy()
        return {
          addSchema (source) {
            ajvInstance.addSchema(source)
          },
          getSchema (id) {
            return ajvInstance.getSchema(id).schema
          },
          getSchemas () {
            return {
              'urn:schema:base': baseSchema,
              'urn:schema:ref': refSchema
            }
          }
        }
      }
    })
    server.setValidatorCompiler(function ({ schema }) {
      expect('the querystring schema is compiled').toBeTruthy()
      return ajvInstance.compile(schema)
    })
  }
  schemaPlugin[Symbol.for('skip-override')] = true
})

test('side effect on schema let the server crash', async () => {
  const firstSchema = {
    $id: 'example1',
    type: 'object',
    properties: {
      name: {
        type: 'string'
      }
    }
  }

  const reusedSchema = {
    $id: 'example2',
    type: 'object',
    properties: {
      name: {
        oneOf: [
          {
            $ref: 'example1'
          }
        ]
      }
    }
  }

  const fastify = Fastify()
  fastify.addSchema(firstSchema)

  fastify.post('/a', {
    handler: async () => 'OK',
    schema: {
      body: reusedSchema,
      response: { 200: reusedSchema }
    }
  })
  fastify.post('/b', {
    handler: async () => 'OK',
    schema: {
      body: reusedSchema,
      response: { 200: reusedSchema }
    }
  })

  await fastify.ready()
})

test('only response schema trigger AJV pollution', async () => {
  const ShowSchema = S.object().id('ShowSchema').prop('name', S.string())
  const ListSchema = S.array().id('ListSchema').items(S.ref('ShowSchema#'))

  const fastify = Fastify()
  fastify.addSchema(ListSchema)
  fastify.addSchema(ShowSchema)

  const routeResponseSchemas = {
    schema: { response: { 200: S.ref('ListSchema#') } }
  }

  fastify.register(
    async (app) => { app.get('/resource/', routeResponseSchemas, () => ({})) },
    { prefix: '/prefix1' }
  )
  fastify.register(
    async (app) => { app.get('/resource/', routeResponseSchemas, () => ({})) },
    { prefix: '/prefix2' }
  )

  await fastify.ready()
})

test('only response schema trigger AJV pollution #2', async () => {
  const ShowSchema = S.object().id('ShowSchema').prop('name', S.string())
  const ListSchema = S.array().id('ListSchema').items(S.ref('ShowSchema#'))

  const fastify = Fastify()
  fastify.addSchema(ListSchema)
  fastify.addSchema(ShowSchema)

  const routeResponseSchemas = {
    schema: {
      params: S.ref('ListSchema#'),
      response: { 200: S.ref('ListSchema#') }
    }
  }

  fastify.register(
    async (app) => { app.get('/resource/', routeResponseSchemas, () => ({})) },
    { prefix: '/prefix1' }
  )
  fastify.register(
    async (app) => { app.get('/resource/', routeResponseSchemas, () => ({})) },
    { prefix: '/prefix2' }
  )

  await fastify.ready()
})

test('setSchemaController in a plugin with head routes', (testDone) => {
  expect.assertions(6)
  const baseSchema = {
    $id: 'urn:schema:base',
    definitions: {
      hello: { type: 'string' }
    },
    type: 'object',
    properties: {
      hello: { $ref: '#/definitions/hello' }
    }
  }

  const refSchema = {
    $id: 'urn:schema:ref',
    type: 'object',
    properties: {
      hello: { $ref: 'urn:schema:base#/definitions/hello' }
    }
  }

  const ajvInstance = new AJV()
  ajvInstance.addSchema(baseSchema)
  ajvInstance.addSchema(refSchema)

  const fastify = Fastify({ exposeHeadRoutes: true })
  fastify.register(schemaPlugin)
  fastify.get('/', {
    schema: {
      query: ajvInstance.getSchema('urn:schema:ref').schema,
      response: {
        '2xx': ajvInstance.getSchema('urn:schema:ref').schema
      }
    },
    handler (req, res) {
      res.send({ hello: 'world', evict: 'this' })
    }
  })

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ hello: 'world' })
    testDone()
  })

  async function schemaPlugin (server) {
    server.setSchemaController({
      bucket () {
        expect('the bucket is created').toBeTruthy()
        return {
          addSchema (source) {
            ajvInstance.addSchema(source)
          },
          getSchema (id) {
            return ajvInstance.getSchema(id).schema
          },
          getSchemas () {
            return {
              'urn:schema:base': baseSchema,
              'urn:schema:ref': refSchema
            }
          }
        }
      }
    })
    server.setValidatorCompiler(function ({ schema }) {
      if (schema.$id) {
        const stored = ajvInstance.getSchema(schema.$id)
        if (stored) {
          expect('the schema is reused').toBeTruthy()
          return stored
        }
      }
      expect('the schema is compiled').toBeTruthy()

      return ajvInstance.compile(schema)
    })
  }
  schemaPlugin[Symbol.for('skip-override')] = true
})

test('multiple refs with the same ids', (testDone) => {
  expect.assertions(3)
  const baseSchema = {
    $id: 'urn:schema:base',
    definitions: {
      hello: { type: 'string' }
    },
    type: 'object',
    properties: {
      hello: { $ref: '#/definitions/hello' }
    }
  }

  const refSchema = {
    $id: 'urn:schema:ref',
    type: 'object',
    properties: {
      hello: { $ref: 'urn:schema:base#/definitions/hello' }
    }
  }

  const fastify = Fastify()

  fastify.addSchema(baseSchema)
  fastify.addSchema(refSchema)

  fastify.head('/', {
    schema: {
      query: refSchema,
      response: {
        '2xx': refSchema
      }
    },
    handler (req, res) {
      res.send({ hello: 'world', evict: 'this' })
    }
  })

  fastify.get('/', {
    schema: {
      query: refSchema,
      response: {
        '2xx': refSchema
      }
    },
    handler (req, res) {
      res.send({ hello: 'world', evict: 'this' })
    }
  })

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ hello: 'world' })
    testDone()
  })
})

test('JOI validation overwrite request headers', (testDone) => {
  expect.assertions(3)
  const schemaValidator = ({ schema }) => data => {
    const validationResult = schema.validate(data)
    return validationResult
  }

  const fastify = Fastify()
  fastify.setValidatorCompiler(schemaValidator)

  fastify.get('/', {
    schema: {
      headers: Joi.object({
        'user-agent': Joi.string().required(),
        host: Joi.string().required()
      })
    }
  }, (request, reply) => {
    reply.send(request.headers)
  })

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      'user-agent': 'lightMyRequest',
      host: 'localhost:80'
    })
    testDone()
  })
})

test('Custom schema object should not trigger XUFA_ERR_SCH_DUPLICATE', async () => {
  const fastify = Fastify()
  const handler = () => { }

  fastify.get('/the/url', {
    schema: {
      query: yup.object({
        foo: yup.string()
      })
    },
    validatorCompiler: ({ schema, method, url, httpPart }) => {
      return function (data) {
        // with option strict = false, yup `validateSync` function returns the coerced value if validation was successful, or throws if validation failed
        try {
          const result = schema.validateSync(data, {})
          return { value: result }
        } catch (e) {
          return { error: e }
        }
      }
    },
    handler
  })

  await fastify.ready()
  expect('fastify is ready').toBeTruthy()
})

test('The default schema compilers should not be called when overwritten by the user', async () => {
  const Fastify = proxyquire('../', {
    '@fastify/ajv-compiler': () => {
      expect.fail('The default validator compiler should not be called')
    },
    '@fastify/fast-json-stringify-compiler': () => {
      expect.fail('The default serializer compiler should not be called')
    }
  })

  const fastify = Fastify({
    schemaController: {
      compilersFactory: {
        buildValidator: function factory () {
          expect('The custom validator compiler should be called').toBeTruthy()
          return function validatorCompiler () {
            return () => { return true }
          }
        },
        buildSerializer: function factory () {
          expect('The custom serializer compiler should be called').toBeTruthy()
          return function serializerCompiler () {
            return () => { return true }
          }
        }
      }
    }
  })

  fastify.get('/',
    {
      schema: {
        query: { foo: { type: 'string' } },
        response: {
          200: { type: 'object' }
        }
      }
    }, () => { })

  await fastify.ready()
})

test('Supports async JOI validation', (testDone) => {
  expect.assertions(7)

  const schemaValidator = ({ schema }) => async data => {
    const validationResult = await schema.validateAsync(data)
    return validationResult
  }

  const fastify = Fastify({
    exposeHeadRoutes: false
  })
  fastify.setValidatorCompiler(schemaValidator)

  fastify.get('/', {
    schema: {
      headers: Joi.object({
        'user-agent': Joi.string().external(async (val) => {
          if (val !== 'lightMyRequest') {
            throw new Error('Invalid user-agent')
          }

          expect(val).toBe('lightMyRequest')
          return val
        }),
        host: Joi.string().required()
      })
    }
  }, (request, reply) => {
    reply.send(request.headers)
  })

  const completion = waitForCb({ steps: 2 })
  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      'user-agent': 'lightMyRequest',
      host: 'localhost:80'
    })
    completion.stepIn()
  })
  fastify.inject({
    url: '/',
    headers: {
      'user-agent': 'invalid'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({
      statusCode: 400,
      code: 'XUFA_ERR_VALIDATION',
      error: 'Bad Request',
      message: 'Invalid user-agent (user-agent)'
    })
    completion.stepIn()
  })

  completion.patience.then(testDone)
})

// Not applicable to xufa (see port-fastify.js)
test.skip('Supports async AJV validation', (testDone) => {
  expect.assertions(12)

  const fastify = Fastify({
    exposeHeadRoutes: false,
    ajv: {
      customOptions: {
        allErrors: true,
        keywords: [
          {
            keyword: 'idExists',
            async: true,
            type: 'number',
            validate: checkIdExists
          }
        ]
      },
      plugins: [
        [ajvErrors, { singleError: '@@@@' }]
      ]
    }
  })

  async function checkIdExists (schema, data) {
    const res = await Promise.resolve(data)
    switch (res) {
      case 42:
        return true

      case 500:
        throw new Error('custom error')

      default:
        return false
    }
  }

  const schema = {
    $async: true,
    type: 'object',
    properties: {
      userId: {
        type: 'integer',
        idExists: { table: 'users' }
      },
      postId: {
        type: 'integer',
        idExists: { table: 'posts' }
      }
    }
  }

  fastify.post('/', {
    schema: {
      body: schema
    },
    handler (req, reply) { reply.send(req.body) }
  })

  const completion = waitForCb({ steps: 4 })

  fastify.inject({
    method: 'POST',
    url: '/',
    payload: { userId: 99 }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({
      statusCode: 400,
      code: 'XUFA_ERR_VALIDATION',
      error: 'Bad Request',
      message: 'validation failed'
    })
    completion.stepIn()
  })
  fastify.inject({
    method: 'POST',
    url: '/',
    payload: { userId: 500 }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({
      statusCode: 400,
      code: 'XUFA_ERR_VALIDATION',
      error: 'Bad Request',
      message: 'custom error'
    })
    completion.stepIn()
  })
  fastify.inject({
    method: 'POST',
    url: '/',
    payload: { userId: 42 }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ userId: 42 })
    completion.stepIn()
  })
  fastify.inject({
    method: 'POST',
    url: '/',
    payload: { userId: 42, postId: 19 }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({
      statusCode: 400,
      code: 'XUFA_ERR_VALIDATION',
      error: 'Bad Request',
      message: 'validation failed'
    })
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

// @see https://github.com/fastify/fastify/security/advisories/GHSA-667r-xxjv-c9mm
// Not applicable to xufa (see port-fastify.js)
test.skip('async validation result must not replace the request body (value collision)', async () => {
  const fastify = Fastify()
  fastify.post('/', {
    schema: {
      body: {
        $async: true,
        type: 'object',
        additionalProperties: true,
        properties: { hello: { type: 'string' } }
      }
    },
    handler: async (request) => request.body
  })

  const res = await fastify.inject({
    method: 'POST',
    url: '/',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hello: 'world', value: { hello: 'evil' } })
  })

  expect(res.statusCode).toBe(200)
  // The validated body must be preserved; a `value` key must NOT replace it.
  expect(res.json()).toEqual({ hello: 'world', value: { hello: 'evil' } })
})

// @see https://github.com/fastify/fastify/security/advisories/GHSA-667r-xxjv-c9mm
// Not applicable to xufa (see port-fastify.js)
test.skip('async validation result must not be treated as an error (error collision)', async () => {
  const fastify = Fastify()
  fastify.post('/', {
    schema: {
      body: {
        $async: true,
        type: 'object',
        additionalProperties: true,
        properties: { hello: { type: 'string' } }
      }
    },
    handler: async (request) => request.body
  })

  const res = await fastify.inject({
    method: 'POST',
    url: '/',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hello: 'world', error: 'boom' })
  })

  // An `error` key in the payload must NOT be treated as a validation failure.
  expect(res.statusCode).toBe(200)
  expect(res.json()).toEqual({ hello: 'world', error: 'boom' })
})

test('async custom validator resolving false uses its validation errors', async () => {
  const fastify = Fastify()
  fastify.setValidatorCompiler(() => {
    const validate = () => Promise.resolve(false)
    validate.errors = [{
      instancePath: '',
      schemaPath: '#/custom',
      keyword: 'custom',
      params: {},
      message: 'must pass custom validation'
    }]
    return validate
  })
  fastify.post('/', {
    schema: { body: { type: 'object' } }
  }, async () => ({ ok: true }))

  const res = await fastify.inject({
    method: 'POST',
    url: '/',
    payload: {}
  })

  expect(res.statusCode).toBe(400)
  expect(res.json().code).toBe('XUFA_ERR_VALIDATION')
})

// Not applicable to xufa (see port-fastify.js)
test.skip('Check all the async AJV validation paths', async () => {
  const fastify = Fastify({
    exposeHeadRoutes: false,
    ajv: {
      customOptions: {
        allErrors: true,
        keywords: [
          {
            keyword: 'idExists',
            async: true,
            type: 'number',
            validate: checkIdExists
          }
        ]
      }
    }
  })

  async function checkIdExists (schema, data) {
    const res = await Promise.resolve(data)
    switch (res) {
      case 200:
        return true

      default:
        return false
    }
  }

  const schema = {
    $async: true,
    type: 'object',
    properties: {
      id: {
        type: 'integer',
        idExists: { table: 'posts' }
      }
    }
  }

  fastify.post('/:id', {
    schema: {
      params: schema,
      body: schema,
      query: schema,
      headers: schema
    },
    handler (req, reply) { reply.send(req.body) }
  })

  const testCases = [
    {
      params: 400,
      body: 200,
      querystring: 200,
      headers: 200,
      response: 400
    },
    {
      params: 200,
      body: 400,
      querystring: 200,
      headers: 200,
      response: 400
    },
    {
      params: 200,
      body: 200,
      querystring: 400,
      headers: 200,
      response: 400
    },
    {
      params: 200,
      body: 200,
      querystring: 200,
      headers: 400,
      response: 400
    },
    {
      params: 200,
      body: 200,
      querystring: 200,
      headers: 200,
      response: 200
    }
  ]
  expect.assertions(testCases.length)
  for (const testCase of testCases) {
    await validate(testCase)
  }

  async function validate ({
    params,
    body,
    querystring,
    headers,
    response
  }) {
    try {
      const res = await fastify.inject({
        method: 'POST',
        url: `/${params}`,
        headers: { id: headers },
        query: { id: querystring },
        payload: { id: body }
      })
      expect(res.statusCode).toBe(response)
    } catch (error) {
      expect.fail('should not throw')
    }
  }
})

// Not applicable to xufa (see port-fastify.js)
test.skip('Check mixed sync and async AJV validations', async () => {
  const fastify = Fastify({
    exposeHeadRoutes: false,
    ajv: {
      customOptions: {
        allErrors: true,
        keywords: [
          {
            keyword: 'idExists',
            async: true,
            type: 'number',
            validate: checkIdExists
          }
        ]
      }
    }
  })

  async function checkIdExists (schema, data) {
    const res = await Promise.resolve(data)
    switch (res) {
      case 200:
        return true

      default:
        return false
    }
  }

  const schemaSync = {
    type: 'object',
    properties: {
      id: { type: 'integer' }
    }
  }

  const schemaAsync = {
    $async: true,
    type: 'object',
    properties: {
      id: {
        type: 'integer',
        idExists: { table: 'posts' }
      }
    }
  }

  fastify.post('/queryAsync/:id', {
    schema: {
      params: schemaSync,
      body: schemaSync,
      query: schemaAsync,
      headers: schemaSync
    },
    handler (req, reply) { reply.send(req.body) }
  })

  fastify.post('/paramsAsync/:id', {
    schema: {
      params: schemaAsync,
      body: schemaSync
    },
    handler (req, reply) { reply.send(req.body) }
  })

  fastify.post('/bodyAsync/:id', {
    schema: {
      params: schemaAsync,
      body: schemaAsync,
      query: schemaSync
    },
    handler (req, reply) { reply.send(req.body) }
  })

  fastify.post('/headersSync/:id', {
    schema: {
      params: schemaSync,
      body: schemaSync,
      query: schemaAsync,
      headers: schemaSync
    },
    handler (req, reply) { reply.send(req.body) }
  })

  fastify.post('/noHeader/:id', {
    schema: {
      params: schemaSync,
      body: schemaSync,
      query: schemaAsync
    },
    handler (req, reply) { reply.send(req.body) }
  })

  fastify.post('/noBody/:id', {
    schema: {
      params: schemaSync,
      query: schemaAsync,
      headers: schemaSync
    },
    handler (req, reply) { reply.send(req.body) }
  })

  const testCases = [
    {
      url: '/queryAsync',
      params: 200,
      body: 200,
      querystring: 200,
      headers: 'not a number sync',
      response: 400
    },
    {
      url: '/paramsAsync',
      params: 200,
      body: 'not a number sync',
      querystring: 200,
      headers: 200,
      response: 400
    },
    {
      url: '/bodyAsync',
      params: 200,
      body: 200,
      querystring: 'not a number sync',
      headers: 200,
      response: 400
    },
    {
      url: '/headersSync',
      params: 200,
      body: 200,
      querystring: 200,
      headers: 'not a number sync',
      response: 400
    },
    {
      url: '/noHeader',
      params: 200,
      body: 200,
      querystring: 200,
      headers: 'not a number sync, but not validated',
      response: 200
    },
    {
      url: '/noBody',
      params: 200,
      body: 'not a number sync, but not validated',
      querystring: 200,
      headers: 'not a number sync',
      response: 400
    }
  ]
  expect.assertions(testCases.length)
  for (const testCase of testCases) {
    await validate(testCase)
  }

  async function validate ({
    url,
    params,
    body,
    querystring,
    headers,
    response
  }) {
    try {
      const res = await fastify.inject({
        method: 'POST',
        url: `${url}/${params || ''}`,
        headers: { id: headers },
        query: { id: querystring },
        payload: { id: body }
      })
      expect(res.statusCode).toBe(response)
    } catch (error) {
      expect.fail('should not fail')
    }
  }
})

// Not applicable to xufa (see port-fastify.js)
test.skip('Check if hooks and attachValidation work with AJV validations', async () => {
  const fastify = Fastify({
    exposeHeadRoutes: false,
    ajv: {
      customOptions: {
        allErrors: true,
        keywords: [
          {
            keyword: 'idExists',
            async: true,
            type: 'number',
            validate: checkIdExists
          }
        ]
      }
    }
  })

  async function checkIdExists (schema, data) {
    const res = await Promise.resolve(data)
    switch (res) {
      case 200:
        return true

      default:
        return false
    }
  }

  const schemaAsync = {
    $async: true,
    type: 'object',
    properties: {
      id: {
        type: 'integer',
        idExists: { table: 'posts' }
      }
    }
  }

  fastify.post('/:id', {
    preHandler: function hook (request, reply, done) {
      expect(request.validationError.message).toBe('validation failed')
      expect('preHandler called').toBeTruthy()

      reply.code(400).send(request.body)
    },
    attachValidation: true,
    schema: {
      params: schemaAsync,
      body: schemaAsync,
      query: schemaAsync,
      headers: schemaAsync
    },
    handler (req, reply) { reply.send(req.body) }
  })

  const testCases = [
    {
      params: 200,
      body: 200,
      querystring: 200,
      headers: 400,
      response: 400
    },
    {
      params: 200,
      body: 400,
      querystring: 200,
      headers: 200,
      response: 400
    },
    {
      params: 200,
      body: 200,
      querystring: 400,
      headers: 200,
      response: 400
    },
    {
      params: 200,
      body: 200,
      querystring: 200,
      headers: 400,
      response: 400
    }
  ]
  expect.assertions(testCases.length * 3)
  for (const testCase of testCases) {
    await validate(testCase)
  }

  async function validate ({
    params,
    body,
    querystring,
    headers,
    response
  }) {
    try {
      const res = await fastify.inject({
        method: 'POST',
        url: `/${params}`,
        headers: { id: headers },
        query: { id: querystring },
        payload: { id: body }
      })
      expect(res.statusCode).toBe(response)
    } catch (error) {
      expect.fail('should not fail')
    }
  }
})
