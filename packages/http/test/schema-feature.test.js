'use strict'


const fp = require('@xufa/http').plugin
const { spyWarning } = require('@xufa/http/lib/warnings')
const Fastify = require('..')
const deepClone = require('rfdc')({ circles: true, proto: false })
const Ajv = require('ajv')
const { kSchemaController } = require('../lib/symbols')
const { XUFAWRN001 } = require('../lib/warnings')
const { waitForCb } = require('./helper')

const echoParams = (req, reply) => { reply.send(req.params) }
const echoBody = (req, reply) => { reply.send(req.body) }

  ;['addSchema', 'getSchema', 'getSchemas', 'setValidatorCompiler', 'setSerializerCompiler'].forEach(f => {
  test(`Should expose ${f} function`, async () => {
    expect.assertions(1)
    const fastify = Fastify()
    expect(typeof fastify[f]).toBe('function')
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
})

;['setValidatorCompiler', 'setSerializerCompiler'].forEach(f => {
  test(`cannot call ${f} after binding`, (testDone) => {
    expect.assertions(2)
    const fastify = Fastify()
    onTestFinished(() => fastify.close())
    fastify.listen({ port: 0 }, err => {
      expect(err).toBeFalsy()
      try {
        fastify[f](() => { })
        expect.fail()
      } catch (e) {
        expect(true).toBeTruthy()
        testDone()
      }
    })
  })
})

test('The schemas should be added to an internal storage', async () => {
  expect.assertions(1)
  const fastify = Fastify()
  const schema = { $id: 'id', my: 'schema' }
  fastify.addSchema(schema)
  expect(fastify[kSchemaController].schemaBucket.store).toEqual({ id: schema })

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('The schemas should be accessible via getSchemas', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  const schemas = {
    id: { $id: 'id', my: 'schema' },
    abc: { $id: 'abc', my: 'schema' },
    bcd: { $id: 'bcd', my: 'schema', properties: { a: 'a', b: 1 } }
  }

  Object.values(schemas).forEach(schema => { fastify.addSchema(schema) })
  expect(fastify.getSchemas()).toEqual(schemas)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('The schema should be accessible by id via getSchema', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify()

  const schemas = [
    { $id: 'id', my: 'schema' },
    { $id: 'abc', my: 'schema' },
    { $id: 'bcd', my: 'schema', properties: { a: 'a', b: 1 } }
  ]
  schemas.forEach(schema => { fastify.addSchema(schema) })
  expect(fastify.getSchema('abc')).toEqual(schemas[1])
  expect(fastify.getSchema('id')).toEqual(schemas[0])
  expect(fastify.getSchema('foo')).toEqual(undefined)

  fastify.register((instance, opts, done) => {
    const pluginSchema = { $id: 'cde', my: 'schema' }
    instance.addSchema(pluginSchema)
    expect(instance.getSchema('cde')).toEqual(pluginSchema)
    done()
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('Get validatorCompiler after setValidatorCompiler', (testDone) => {
  expect.assertions(2)
  const myCompiler = () => { }
  const fastify = Fastify()
  fastify.setValidatorCompiler(myCompiler)
  const sc = fastify.validatorCompiler
  expect(Object.is(myCompiler, sc)).toBeTruthy()
  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('Get serializerCompiler after setSerializerCompiler', (testDone) => {
  expect.assertions(2)
  const myCompiler = () => { }
  const fastify = Fastify()
  fastify.setSerializerCompiler(myCompiler)
  const sc = fastify.serializerCompiler
  expect(Object.is(myCompiler, sc)).toBeTruthy()
  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('Get compilers is empty when settle on routes', (testDone) => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.post('/', {
    schema: {
      body: { type: 'object', properties: { hello: { type: 'string' } } },
      response: {
        '2xx': {
          type: 'object',
          properties: {
            foo: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    },
    validatorCompiler: ({ schema, method, url, httpPart }) => { },
    serializerCompiler: ({ schema, method, url, httpPart }) => { }
  }, function (req, reply) {
    reply.send('ok')
  })

  fastify.inject({
    method: 'POST',
    payload: {},
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(fastify.validatorCompiler).toBe(undefined)
    expect(fastify.serializerCompiler).toBe(undefined)
    testDone()
  })
})

test('Should throw if the $id property is missing', async () => {
  expect.assertions(1)
  const fastify = Fastify()
  try {
    fastify.addSchema({ type: 'string' })
    expect.fail()
  } catch (err) {
    expect(err.code).toBe('XUFA_ERR_SCH_MISSING_ID')
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Cannot add multiple times the same id', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.addSchema({ $id: 'id' })
  try {
    fastify.addSchema({ $id: 'id' })
  } catch (err) {
    expect(err.code).toBe('XUFA_ERR_SCH_ALREADY_PRESENT')
    expect(err.message).toBe('Schema with id \'id\' already declared!')
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Cannot add schema for query and querystring', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.get('/', {
    handler: () => { },
    schema: {
      query: {
        type: 'object',
        properties: {
          foo: { type: 'string' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          foo: { type: 'string' }
        }
      }
    }
  })

  fastify.ready(err => {
    expect(err.code).toBe('XUFA_ERR_SCH_DUPLICATE')
    expect(err.message).toBe('Schema with \'querystring\' already present!')
    testDone()
  })
})

test('Should throw of the schema does not exists in input', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.get('/:id', {
    handler: echoParams,
    schema: {
      params: {
        type: 'object',
        properties: {
          name: { $ref: '#notExist' }
        }
      }
    }
  })

  fastify.ready(err => {
    expect(err.code).toBe('XUFA_ERR_SCH_VALIDATION_BUILD')
    expect(err.message).toBe("Failed building the validation schema for GET: /:id, due to error Unsupported JSON Schema \"$ref\": \"#notExist\" at #.properties.name: only references within the schema or to documents in the \"schemas\" option are supported")
    testDone()
  })
})

test('Should throw if schema is missing for content type', (testDone) => {
  expect.assertions(2)

  const fastify = Fastify()
  fastify.post('/', {
    handler: echoBody,
    schema: {
      body: {
        content: {
          'application/json': {}
        }
      }
    }
  })

  fastify.ready(err => {
    expect(err.code).toBe('XUFA_ERR_SCH_CONTENT_MISSING_SCHEMA')
    expect(err.message).toBe("Schema is missing for the content type 'application/json'")
    testDone()
  })
})

test('Should throw of the schema does not exists in output', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.get('/:id', {
    handler: echoParams,
    schema: {
      response: {
        '2xx': {
          type: 'object',
          properties: {
            name: { $ref: '#notExist' }
          }
        }
      }
    }
  })

  fastify.ready(err => {
    expect(err.code).toBe('XUFA_ERR_SCH_SERIALIZATION_BUILD')
    expect(err.message).toMatch(/^Failed building the serialization schema for GET: \/:id, due to error Cannot find reference.*/) // error from fast-json-stringify
    testDone()
  })
})

test('Should not change the input schemas', (testDone) => {
  expect.assertions(4)

  const theSchema = {
    $id: 'helloSchema',
    type: 'object',
    definitions: {
      hello: { type: 'string' }
    }
  }

  const fastify = Fastify()
  fastify.post('/', {
    handler: echoBody,
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { $ref: 'helloSchema#/definitions/hello' }
        }
      },
      response: {
        '2xx': {
          type: 'object',
          properties: {
            name: { $ref: 'helloSchema#/definitions/hello' }
          }
        }
      }
    }
  })
  fastify.addSchema(theSchema)

  fastify.inject({
    url: '/',
    method: 'POST',
    payload: { name: 'Foo', surname: 'Bar' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.json()).toEqual({ name: 'Foo' })
    expect(theSchema.$id).toBeTruthy()
    expect(fastify.getSchema('helloSchema')).toEqual(theSchema)
    testDone()
  })
})

test('Should emit warning if the schema headers is undefined', (testDone) => {
  expect.assertions(4)
  const spyData = spyWarning(XUFAWRN001)
  onTestFinished(spyData.restore)

  const fastify = Fastify()

  fastify.post('/:id', {
    handler: echoParams,
    schema: {
      headers: undefined
    }
  })

  fastify.inject({
    method: 'POST',
    url: '/123'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(spyData.calls).toEqual([{ arguments: ['headers', 'POST', '/:id'], result: true }])
    expect(spyData.callCount()).toBe(1)
    testDone()
  })
})

test('Should emit warning if the schema body is undefined', (testDone) => {
  expect.assertions(4)
  const spyData = spyWarning(XUFAWRN001)
  onTestFinished(spyData.restore)

  const fastify = Fastify()

  fastify.post('/:id', {
    handler: echoParams,
    schema: {
      body: undefined
    }
  })

  fastify.inject({
    method: 'POST',
    url: '/123'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(spyData.calls).toEqual([{ arguments: ['body', 'POST', '/:id'], result: true }])
    expect(spyData.callCount()).toBe(1)
    testDone()
  })
})

test('Should emit warning if the schema query is undefined', (testDone) => {
  expect.assertions(4)
  const spyData = spyWarning(XUFAWRN001)
  onTestFinished(spyData.restore)

  const fastify = Fastify()

  fastify.post('/:id', {
    handler: echoParams,
    schema: {
      querystring: undefined
    }
  })

  fastify.inject({
    method: 'POST',
    url: '/123'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(spyData.calls).toEqual([{ arguments: ['querystring', 'POST', '/:id'], result: true }])
    expect(spyData.callCount()).toBe(1)
    testDone()
  })
})

test('Should emit warning if the schema params is undefined', (testDone) => {
  expect.assertions(4)
  const spyData = spyWarning(XUFAWRN001)
  onTestFinished(spyData.restore)

  const fastify = Fastify()

  fastify.post('/:id', {
    handler: echoParams,
    schema: {
      params: undefined
    }
  })

  fastify.inject({
    method: 'POST',
    url: '/123'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(spyData.calls).toEqual([{ arguments: ['params', 'POST', '/:id'], result: true }])
    expect(spyData.callCount()).toBe(1)
    testDone()
  })
})

test('Should emit a warning for every route with undefined schema', (testDone) => {
  expect.assertions(9)
  const spyData = spyWarning(XUFAWRN001)
  onTestFinished(spyData.restore)

  const fastify = Fastify()

  fastify.get('/undefinedParams/:id', {
    handler: echoParams,
    schema: {
      params: undefined
    }
  })

  fastify.get('/undefinedBody/:id', {
    handler: echoParams,
    schema: {
      body: undefined
    }
  })

  fastify.inject({
    method: 'GET',
    url: '/undefinedParams/123'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(200)
  })

  fastify.inject({
    method: 'GET',
    url: '/undefinedBody/123'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(200)
    // fastify.inject run in series
    // last callback recieve all warnings at once
    // GET /undefinedParams/123
    expect(spyData.calls[0]).toEqual({ arguments: ['params', 'GET', '/undefinedParams/:id'], result: true })
    expect(spyData.calls[1]).toEqual({ arguments: ['params', 'HEAD', '/undefinedParams/:id'], result: true })
    // GET /undefinedBody/123
    expect(spyData.calls[2]).toEqual({ arguments: ['body', 'GET', '/undefinedBody/:id'], result: true })
    expect(spyData.calls[3]).toEqual({ arguments: ['body', 'HEAD', '/undefinedBody/:id'], result: true })
    expect(spyData.callCount()).toBe(4)
    testDone()
  })
})

test('Default validator compiler is initialized for a route whose only schema is false', async () => {
  expect.assertions(2)
  const fastify = Fastify({ exposeHeadRoutes: false })

  fastify.post('/body', {
    handler: echoBody,
    schema: {
      body: false
    }
  })

  const res = await fastify.inject({
    method: 'POST',
    url: '/body',
    payload: {}
  })

  expect(res.statusCode).toBe(400)
  expect(fastify.validatorCompiler).toBeTruthy()
})

test('Boolean false request schemas reject every request and no handler executes', async () => {
  expect.assertions(5)
  const fastify = Fastify({ exposeHeadRoutes: false })

  let bodyExecuted = false
  let qsExecuted = false
  let paramsExecuted = false
  let headersExecuted = false

  fastify.post('/body', {
    handler: async () => { bodyExecuted = true; return { protectedActionExecuted: true } },
    schema: { body: false }
  })
  fastify.get('/querystring', {
    handler: async () => { qsExecuted = true; return { protectedActionExecuted: true } },
    schema: { querystring: false }
  })
  fastify.post('/params/:id', {
    handler: async () => { paramsExecuted = true; return { protectedActionExecuted: true } },
    schema: { params: false }
  })
  fastify.post('/headers', {
    handler: async () => { headersExecuted = true; return { protectedActionExecuted: true } },
    schema: { headers: false }
  })

  const r1 = await fastify.inject({ method: 'POST', url: '/body', payload: {} })
  expect(r1.statusCode).toBe(400)
  const r2 = await fastify.inject({ method: 'GET', url: '/querystring' })
  expect(r2.statusCode).toBe(400)
  const r3 = await fastify.inject({ method: 'POST', url: '/params/1' })
  expect(r3.statusCode).toBe(400)
  const r4 = await fastify.inject({ method: 'POST', url: '/headers' })
  expect(r4.statusCode).toBe(400)

  expect({
    bodyExecuted,
    qsExecuted,
    paramsExecuted,
    headersExecuted
  }).toEqual({
    bodyExecuted: false,
    qsExecuted: false,
    paramsExecuted: false,
    headersExecuted: false
  })
})

test('Custom validator compiler receives the literal boolean false schema', async () => {
  expect.assertions(3)
  const received = []
  const fastify = Fastify({ exposeHeadRoutes: false })

  fastify.post('/body', {
    handler: async () => ({ ok: true }),
    schema: { body: false },
    validatorCompiler: ({ schema, httpPart }) => {
      received.push({ schema, httpPart })
      return () => { throw new Error('should not validate') }
    }
  })

  await fastify.ready()
  expect(received.length).toBe(1)
  expect(received[0].schema).toBe(false)
  expect(received[0].httpPart).toBe('body')
})

test('XUFAWRN001 is emitted only for explicitly undefined schemas, not boolean false', async () => {
  expect.assertions(4)
  const spyData = spyWarning(XUFAWRN001)
  onTestFinished(spyData.restore)

  const fastify = Fastify({ exposeHeadRoutes: false })

  fastify.post('/false-body', {
    handler: async () => ({ ok: true }),
    schema: { body: false }
  })
  fastify.post('/undefined-body', {
    handler: async () => ({ ok: true }),
    schema: { body: undefined }
  })

  await fastify.ready()
  expect(spyData.callCount()).toBe(1)
  expect(spyData.calls[0]).toEqual({ arguments: ['body', 'POST', '/undefined-body'], result: true })

  const r1 = await fastify.inject({ method: 'POST', url: '/false-body', payload: {} })
  expect(r1.statusCode).toBe(400)
  const r2 = await fastify.inject({ method: 'POST', url: '/undefined-body', payload: {} })
  expect(r2.statusCode).toBe(200)
})

test('Invalid null schema fails closed during schema compilation', async () => {
  expect.assertions(3)
  const fastify = Fastify({ exposeHeadRoutes: false })

  let handlerExecuted = false
  fastify.post('/null-body', {
    handler: async () => { handlerExecuted = true; return { ok: true } },
    schema: { body: null }
  })

  await expect(fastify.ready()).rejects.toSatisfy((err) => {
    expect(err.code).toBe('XUFA_ERR_SCH_VALIDATION_BUILD')
    return true
  })
  expect(handlerExecuted).toBe(false)
})

test('Boolean false request schema via the query alias rejects every request', async () => {
  const fastify = Fastify()
  let handlerExecuted = false

  // `query` is a documented alias for `querystring`; a deny-all `false` must be
  // aliased and enforced just like the canonical key.
  fastify.get('/', {
    handler: async () => { handlerExecuted = true; return { protectedActionExecuted: true } },
    schema: { query: false }
  })

  const res = await fastify.inject({ method: 'GET', url: '/?x=1' })

  expect(res.statusCode).toBe(400)
  expect(handlerExecuted).toBe(false)
})

test('Setting both query and querystring still throws (boolean false included)', async () => {
  const fastify = Fastify()
  fastify.get('/', {
    handler: async () => ({ ok: true }),
    schema: { query: false, querystring: false }
  })
  await expect(fastify.ready()).rejects.toThrow()
})

test('First level $ref', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.addSchema({
    $id: 'test',
    type: 'object',
    properties: {
      id: { type: 'number' }
    }
  })

  fastify.get('/:id', {
    handler: (req, reply) => {
      reply.send({ id: req.params.id * 2, ignore: 'it' })
    },
    schema: {
      params: { $ref: 'test#' },
      response: {
        200: { $ref: 'test#' }
      }
    }
  })

  fastify.inject({
    method: 'GET',
    url: '/123'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.json()).toEqual({ id: 246 })
    testDone()
  })
})

test('Customize validator compiler in instance and route', async () => {
  expect.assertions(28)
  const fastify = Fastify({ exposeHeadRoutes: false })

  fastify.setValidatorCompiler(({ schema, method, url, httpPart }) => {
    expect(method).toBe('POST') // run 4 times
    expect(url).toBe('/:id') // run 4 times
    switch (httpPart) {
      case 'body':
        expect('body evaluated').toBeTruthy()
        return body => {
          expect(body).toEqual({ foo: ['bar', 'BAR'] })
          return true
        }
      case 'params':
        expect('params evaluated').toBeTruthy()
        return params => {
          expect(params.id).toBe('1234')
          return true
        }
      case 'querystring':
        expect('querystring evaluated').toBeTruthy()
        return query => {
          expect(query.lang).toBe('en')
          return true
        }
      case 'headers':
        expect('headers evaluated').toBeTruthy()
        return headers => {
          expect(headers.x).toBe('hello')
          return true
        }
      case '2xx':
        expect.fail('the validator doesn\'t process the response')
        break
      default:
        expect.fail(`unknown httpPart ${httpPart}`)
    }
  })

  fastify.post('/:id', {
    handler: echoBody,
    schema: {
      query: {
        type: 'object',
        properties: {
          lang: { type: 'string', enum: ['it', 'en'] }
        }
      },
      headers: {
        type: 'object',
        properties: {
          x: { type: 'string' }
        }
      },
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        }
      },
      body: {
        type: 'object',
        properties: {
          foo: { type: 'array' }
        }
      },
      response: {
        '2xx': {
          type: 'object',
          properties: {
            foo: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    }
  })

  fastify.get('/wow/:id', {
    handler: echoParams,
    validatorCompiler: ({ schema, method, url, httpPart }) => {
      expect(method).toBe('GET') // run 3 times (params, headers, query)
      expect(url).toBe('/wow/:id') // run 4 times
      return () => { return true } // ignore the validation
    },
    schema: {
      query: {
        type: 'object',
        properties: {
          lang: { type: 'string', enum: ['it', 'en'] }
        }
      },
      headers: {
        type: 'object',
        properties: {
          x: { type: 'string' }
        }
      },
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        }
      },
      response: {
        '2xx': {
          type: 'object',
          properties: {
            foo: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    }
  })

  const { stepIn, patience } = waitForCb({ steps: 2 })

  fastify.inject({
    url: '/1234',
    method: 'POST',
    headers: { x: 'hello' },
    query: { lang: 'en' },
    payload: { foo: ['bar', 'BAR'] }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ foo: ['bar', 'BAR'] })
    stepIn()
  })

  fastify.inject({
    url: '/wow/should-be-a-num',
    method: 'GET',
    headers: { x: 'hello' },
    query: { lang: 'jp' } // not in the enum
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200) // the validation is always true
    expect(res.json()).toEqual({})
    stepIn()
  })

  return patience

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Use the same schema across multiple routes', (testDone) => {
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
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { $ref: 'test#/properties/id' }
        }
      }
    },
    handler: (req, reply) => {
      reply.send(typeof req.params.id)
    }
  })

  fastify.get('/second/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { $ref: 'test#/properties/id' }
        }
      }
    },
    handler: (req, reply) => {
      reply.send(typeof req.params.id)
    }
  })

  fastify.inject({
    method: 'GET',
    url: '/first/123'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('number')
  })

  fastify.inject({
    method: 'GET',
    url: '/second/123'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('number')
    testDone()
  })
})

test('Encapsulation should intervene', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.addSchema({
      $id: 'encapsulation',
      type: 'object',
      properties: {
        id: { type: 'number' }
      }
    })
    done()
  })

  fastify.register((instance, opts, done) => {
    instance.get('/:id', {
      handler: echoParams,
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { $ref: 'encapsulation#/properties/id' }
          }
        }
      }
    })
    done()
  })

  fastify.ready(err => {
    expect(err.code).toBe('XUFA_ERR_SCH_VALIDATION_BUILD')
    expect(err.message).toBe("Failed building the validation schema for GET: /:id, due to error Unsupported JSON Schema \"$ref\": \"encapsulation#/properties/id\" at #.properties.id: only references within the schema or to documents in the \"schemas\" option are supported")
    testDone()
  })
})

test('Encapsulation isolation', (testDone) => {
  expect.assertions(1)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.addSchema({ $id: 'id' })
    done()
  })

  fastify.register((instance, opts, done) => {
    instance.addSchema({ $id: 'id' })
    done()
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('Add schema after register', (testDone) => {
  expect.assertions(5)

  const fastify = Fastify()
  fastify.register((instance, opts, done) => {
    instance.get('/:id', {
      handler: echoParams,
      schema: {
        params: { $ref: 'test#' }
      }
    })

    // add it to the parent instance
    fastify.addSchema({
      $id: 'test',
      type: 'object',
      properties: {
        id: { type: 'number' }
      }
    })

    try {
      instance.addSchema({ $id: 'test' })
    } catch (err) {
      expect(err.code).toBe('XUFA_ERR_SCH_ALREADY_PRESENT')
      expect(err.message).toBe('Schema with id \'test\' already declared!')
    }
    done()
  })

  fastify.inject({
    method: 'GET',
    url: '/4242'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ id: 4242 })
    testDone()
  })
})

test('Encapsulation isolation for getSchemas', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify()

  let pluginDeepOneSide
  let pluginDeepOne
  let pluginDeepTwo

  const schemas = {
    z: { $id: 'z', my: 'schema' },
    a: { $id: 'a', my: 'schema' },
    b: { $id: 'b', my: 'schema' },
    c: { $id: 'c', my: 'schema', properties: { a: 'a', b: 1 } }
  }

  fastify.addSchema(schemas.z)

  fastify.register((instance, opts, done) => {
    instance.addSchema(schemas.a)
    pluginDeepOneSide = instance
    done()
  })

  fastify.register((instance, opts, done) => {
    instance.addSchema(schemas.b)
    instance.register((subinstance, opts, done) => {
      subinstance.addSchema(schemas.c)
      pluginDeepTwo = subinstance
      done()
    })
    pluginDeepOne = instance
    done()
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    expect(fastify.getSchemas()).toEqual({ z: schemas.z })
    expect(pluginDeepOneSide.getSchemas()).toEqual({ z: schemas.z, a: schemas.a })
    expect(pluginDeepOne.getSchemas()).toEqual({ z: schemas.z, b: schemas.b })
    expect(pluginDeepTwo.getSchemas()).toEqual({ z: schemas.z, b: schemas.b, c: schemas.c })
    testDone()
  })
})

test('Use the same schema id in different places', (testDone) => {
  expect.assertions(1)
  const fastify = Fastify()

  fastify.addSchema({
    $id: 'test',
    type: 'object',
    properties: {
      id: { type: 'number' }
    }
  })

  fastify.get('/:id', {
    handler: echoParams,
    schema: {
      response: {
        200: {
          type: 'array',
          items: { $ref: 'test#/properties/id' }
        }
      }
    }
  })

  fastify.post('/:id', {
    handler: echoBody,
    schema: {
      body: {
        type: 'object',
        properties: {
          id: { $ref: 'test#/properties/id' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { $ref: 'test#/properties/id' }
          }
        }
      }
    }
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('Get schema anyway should not add `properties` if allOf is present', (testDone) => {
  expect.assertions(1)
  const fastify = Fastify()

  fastify.addSchema({
    $id: 'first',
    type: 'object',
    properties: {
      first: { type: 'number' }
    }
  })

  fastify.addSchema({
    $id: 'second',
    type: 'object',
    allOf: [
      {
        type: 'object',
        properties: {
          second: { type: 'number' }
        }
      },
      fastify.getSchema('first')
    ]
  })

  fastify.get('/', {
    handler: () => { },
    schema: {
      querystring: fastify.getSchema('second'),
      response: { 200: fastify.getSchema('second') }
    }
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('Get schema anyway should not add `properties` if oneOf is present', (testDone) => {
  expect.assertions(1)
  const fastify = Fastify()

  fastify.addSchema({
    $id: 'first',
    type: 'object',
    properties: {
      first: { type: 'number' }
    }
  })

  fastify.addSchema({
    $id: 'second',
    type: 'object',
    oneOf: [
      {
        type: 'object',
        properties: {
          second: { type: 'number' }
        }
      },
      fastify.getSchema('first')
    ]
  })

  fastify.get('/', {
    handler: () => { },
    schema: {
      querystring: fastify.getSchema('second'),
      response: { 200: fastify.getSchema('second') }
    }
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('Get schema anyway should not add `properties` if anyOf is present', (testDone) => {
  expect.assertions(1)
  const fastify = Fastify()

  fastify.addSchema({
    $id: 'first',
    type: 'object',
    properties: {
      first: { type: 'number' }
    }
  })

  fastify.addSchema({
    $id: 'second',
    type: 'object',
    anyOf: [
      {
        type: 'object',
        properties: {
          second: { type: 'number' }
        }
      },
      fastify.getSchema('first')
    ]
  })

  fastify.get('/', {
    handler: () => { },
    schema: {
      querystring: fastify.getSchema('second'),
      response: { 200: fastify.getSchema('second') }
    }
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('Shared schema should be ignored in string enum', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.get('/:lang', {
    handler: echoParams,
    schema: {
      params: {
        type: 'object',
        properties: {
          lang: {
            type: 'string',
            enum: ['Javascript', 'C++', 'C#']
          }
        }
      }
    }
  })

  fastify.inject('/C%23', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.json()).toEqual({ lang: 'C#' })
    testDone()
  })
})

test('Shared schema should NOT be ignored in != string enum', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.addSchema({
    $id: 'C',
    type: 'object',
    properties: {
      lang: {
        type: 'string',
        enum: ['Javascript', 'C++', 'C#']
      }
    }
  })

  fastify.post('/:lang', {
    handler: echoBody,
    schema: {
      body: fastify.getSchema('C')
    }
  })

  fastify.inject({
    url: '/',
    method: 'POST',
    payload: { lang: 'C#' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.json()).toEqual({ lang: 'C#' })
    testDone()
  })
})

test('Case insensitive header validation', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify()
  fastify.get('/', {
    handler: (req, reply) => {
      reply.code(200).send(req.headers.foobar)
    },
    schema: {
      headers: {
        type: 'object',
        required: ['FooBar'],
        properties: {
          FooBar: { type: 'string' }
        }
      }
    }
  })
  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      FooBar: 'Baz'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('Baz')
    testDone()
  })
})

test('Not evaluate json-schema $schema keyword', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify()
  fastify.post('/', {
    handler: echoBody,
    schema: {
      body: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        additionalProperties: false,
        properties: {
          hello: {
            type: 'string'
          }
        }
      }
    }
  })
  fastify.inject({
    url: '/',
    method: 'POST',
    body: { hello: 'world', foo: 'bar' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.json()).toEqual({ hello: 'world' })
    testDone()
  })
})

test('Validation context in validation result', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify()
  // custom error handler to expose validation context in response, so we can test it later
  fastify.setErrorHandler((err, request, reply) => {
    expect(err instanceof Error).toBe(true)
    expect(err.validation).toBeTruthy()
    expect(err.validationContext).toBe('body')
    reply.code(400).send()
  })
  fastify.post('/', {
    handler: echoParams,
    schema: {
      body: {
        type: 'object',
        required: ['hello'],
        properties: {
          hello: { type: 'string' }
        }
      }
    }
  })
  fastify.inject({
    method: 'POST',
    url: '/',
    payload: {} // body lacks required field, will fail validation
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    testDone()
  })
})

test('The schema build should not modify the input', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()

  const first = {
    $id: 'first',
    type: 'object',
    properties: {
      first: {
        type: 'number'
      }
    }
  }

  fastify.addSchema(first)

  fastify.addSchema({
    $id: 'second',
    type: 'object',
    allOf: [
      {
        type: 'object',
        properties: {
          second: {
            type: 'number'
          }
        }
      },
      { $ref: 'first#' }
    ]
  })

  fastify.post('/', {
    schema: {
      description: 'get',
      body: { $ref: 'second#' },
      response: {
        200: { $ref: 'second#' }
      }
    },
    handler: (request, reply) => {
      reply.send({ hello: 'world' })
    }
  })

  fastify.patch('/', {
    schema: {
      description: 'patch',
      body: { $ref: 'first#' },
      response: {
        200: { $ref: 'first#' }
      }
    },
    handler: (request, reply) => {
      reply.send({ hello: 'world' })
    }
  })

  expect(first.$id).toBeTruthy()
  fastify.ready(err => {
    expect(err).toBeFalsy()
    expect(first.$id).toBeTruthy()
    testDone()
  })
})

test('Cross schema reference with encapsulation references', (testDone) => {
  expect.assertions(1)

  const fastify = Fastify()
  fastify.addSchema({
    $id: 'http://foo/item',
    type: 'object',
    properties: { foo: { type: 'string' } }
  })

  const refItem = { $ref: 'http://foo/item#' }

  fastify.addSchema({
    $id: 'itemList',
    type: 'array',
    items: refItem
  })

  fastify.register((instance, opts, done) => {
    instance.addSchema({
      $id: 'encapsulation',
      type: 'object',
      properties: {
        id: { type: 'number' },
        item: refItem,
        secondItem: refItem
      }
    })

    const multipleRef = {
      type: 'object',
      properties: {
        a: { $ref: 'itemList#' },
        b: refItem,
        c: refItem,
        d: refItem
      }
    }

    instance.get('/get', { schema: { response: { 200: deepClone(multipleRef) } } }, () => { })
    instance.get('/double-get', { schema: { querystring: multipleRef, response: { 200: multipleRef } } }, () => { })
    instance.post('/post', { schema: { body: multipleRef, response: { 200: multipleRef } } }, () => { })
    instance.post('/double', { schema: { response: { 200: { $ref: 'encapsulation' } } } }, () => { })
    done()
  }, { prefix: '/foo' })

  fastify.post('/post', { schema: { body: refItem, response: { 200: refItem } } }, () => { })
  fastify.get('/get', { schema: { params: refItem, response: { 200: refItem } } }, () => { })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('Check how many AJV instances are built #1', (testDone) => {
  expect.assertions(12)
  const fastify = Fastify()
  addRandomRoute(fastify) // this trigger the schema validation creation
  expect(fastify.validatorCompiler).toBeFalsy()

  const instances = []
  fastify.register((instance, opts, done) => {
    expect(fastify.validatorCompiler).toBeFalsy()
    instances.push(instance)
    done()
  })
  fastify.register((instance, opts, done) => {
    expect(fastify.validatorCompiler).toBeFalsy()
    addRandomRoute(instance)
    instances.push(instance)
    done()
    instance.register((instance, opts, done) => {
      expect(fastify.validatorCompiler).toBeFalsy()
      addRandomRoute(instance)
      instances.push(instance)
      done()
    })
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()

    expect(fastify.validatorCompiler).toBeTruthy()
    fastify.validatorCompiler.checkPointer = true
    instances.forEach(i => {
      expect(i.validatorCompiler).toBeTruthy()
      expect(i.validatorCompiler.checkPointer).toBe(true)
    })
    testDone()
  })
})

test('onReady hook has the compilers ready', (testDone) => {
  expect.assertions(6)

  const fastify = Fastify()

  fastify.get(`/${Math.random()}`, {
    handler: (req, reply) => reply.send(),
    schema: {
      headers: { type: 'object' },
      response: { 200: { type: 'object' } }
    }
  })

  fastify.addHook('onReady', function (done) {
    expect(this.validatorCompiler).toBeTruthy()
    expect(this.serializerCompiler).toBeTruthy()
    done()
  })

  let hookCallCounter = 0
  fastify.register(async (i, o) => {
    i.addHook('onReady', function (done) {
      expect(this.validatorCompiler).toBeTruthy()
      expect(this.serializerCompiler).toBeTruthy()
      done()
    })

    i.register(async (i, o) => { })

    i.addHook('onReady', function (done) {
      hookCallCounter++
      done()
    })
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    expect(hookCallCounter).toBe(1)
    testDone()
  })
})

test('Check how many AJV instances are built #2 - verify validatorPool', (testDone) => {
  expect.assertions(13)
  const fastify = Fastify()
  expect(fastify.validatorCompiler).toBeFalsy()

  fastify.register(function sibling1 (instance, opts, done) {
    addRandomRoute(instance)
    expect(instance.validatorCompiler).toBeFalsy()
    instance.ready(() => {
      expect(instance.validatorCompiler).toBeTruthy()
      instance.validatorCompiler.sharedPool = 1
    })
    instance.after(() => {
      expect(instance.validatorCompiler).toBeFalsy()
    })
    done()
  })

  fastify.register(function sibling2 (instance, opts, done) {
    addRandomRoute(instance)
    expect(instance.validatorCompiler).toBeFalsy()
    instance.ready(() => {
      expect(instance.validatorCompiler.sharedPool).toBe(1)
      instance.validatorCompiler.sharedPool = 2
    })
    instance.after(() => {
      expect(instance.validatorCompiler).toBeFalsy()
    })

    instance.register((instance, opts, done) => {
      expect(instance.validatorCompiler).toBeFalsy()
      instance.ready(() => {
        expect(instance.validatorCompiler.sharedPool).toBe(2)
      })
      done()
    })
    done()
  })

  fastify.register(function sibling3 (instance, opts, done) {
    addRandomRoute(instance)

    // this trigger to don't reuse the same compiler pool
    instance.addSchema({ $id: 'diff', type: 'object' })

    expect(instance.validatorCompiler).toBeFalsy()
    instance.ready(() => {
      expect(instance.validatorCompiler).toBeTruthy()
      expect(instance.validatorCompiler.sharedPool).toBeFalsy()
    })
    done()
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

function addRandomRoute (server) {
  server.post(`/${Math.random()}`,
    { schema: { body: { type: 'object' } } },
    (req, reply) => reply.send()
  )
}

test('Add schema order should not break the startup', (testDone) => {
  expect.assertions(1)
  const fastify = Fastify()

  fastify.get('/', { schema: { random: 'options' } }, () => { })

  fastify.register(fp((f, opts) => {
    f.addSchema({
      $id: 'https://fastify.test/bson/objectId',
      type: 'string',
      pattern: '\\b[0-9A-Fa-f]{24}\\b'
    })
    return Promise.resolve() // avoid async for node 6
  }))

  fastify.get('/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { $ref: 'https://fastify.test/bson/objectId#' }
        }
      }
    }
  }, () => { })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('The schema compiler recreate itself if needed', (testDone) => {
  expect.assertions(1)
  const fastify = Fastify()

  fastify.options('/', { schema: { hide: true } }, echoBody)

  fastify.register(function (fastify, options, done) {
    fastify.addSchema({
      $id: 'identifier',
      type: 'string',
      format: 'uuid'
    })

    fastify.get('/:foobarId', {
      schema: {
        params: {
          type: 'object',
          properties: {
            foobarId: { $ref: 'identifier#' }
          }
        }
      }
    }, echoBody)

    done()
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('Schema controller setter', async () => {
  expect.assertions(2)
  Fastify({ schemaController: {} })
  expect('allow empty object').toBeTruthy()

  try {
    Fastify({ schemaController: { bucket: {} } })
    expect.fail('the bucket option must be a function')
  } catch (err) {
    expect(err.message).toBe("schemaController.bucket option should be a function, instead got 'object'")
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Schema controller bucket', (testDone) => {
  expect.assertions(10)

  let added = 0
  let builtBucket = 0

  const initStoreQueue = []

  function factoryBucket (storeInit) {
    builtBucket++
    expect(initStoreQueue.pop()).toEqual(storeInit)
    const store = new Map(storeInit)
    return {
      add (schema) {
        added++
        store.set(schema.$id, schema)
      },
      getSchema (id) {
        return store.get(id)
      },
      getSchemas () {
        // what is returned by this function, will be the `storeInit` parameter
        initStoreQueue.push(store)
        return store
      }
    }
  }

  const fastify = Fastify({
    schemaController: {
      bucket: factoryBucket
    }
  })

  fastify.register(async (instance) => {
    instance.addSchema({ $id: 'b', type: 'string' })
    instance.addHook('onReady', function (done) {
      expect(instance.getSchemas().size).toBe(2)
      done()
    })
    instance.register(async (subinstance) => {
      subinstance.addSchema({ $id: 'c', type: 'string' })
      subinstance.addHook('onReady', function (done) {
        expect(subinstance.getSchemas().size).toBe(3)
        done()
      })
    })
  })

  fastify.register(async (instance) => {
    instance.addHook('onReady', function (done) {
      expect(instance.getSchemas().size).toBe(1)
      done()
    })
  })

  fastify.addSchema({ $id: 'a', type: 'string' })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    expect(added).toBe(3)
    expect(builtBucket).toBe(4)
    testDone()
  })
})

test('setSchemaController per instance', (testDone) => {
  expect.assertions(7)
  const fastify = Fastify({})

  fastify.register(async (instance1) => {
    instance1.setSchemaController({
      bucket: function factoryBucket (storeInit) {
        expect('instance1 has created the bucket').toBeTruthy()
        return {
          add (schema) { expect.fail('add is not called') },
          getSchema (id) { expect.fail('getSchema is not called') },
          getSchemas () { expect.fail('getSchemas is not called') }
        }
      }
    })
  })

  fastify.register(async (instance2) => {
    const bSchema = { $id: 'b', type: 'string' }

    instance2.setSchemaController({
      bucket: function factoryBucket (storeInit) {
        expect('instance2 has created the bucket').toBeTruthy()
        const map = {}
        return {
          add (schema) {
            expect(schema.$id).toBe(bSchema.$id)
            map[schema.$id] = schema
          },
          getSchema (id) {
            expect('getSchema is called').toBeTruthy()
            return map[id]
          },
          getSchemas () {
            expect('getSchemas is called').toBeTruthy()
          }
        }
      }
    })

    instance2.addSchema(bSchema)

    instance2.addHook('onReady', function (done) {
      instance2.getSchemas()
      expect(instance2.getSchema('b')).toEqual(bSchema)
      done()
    })
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('setSchemaController: Inherits correctly parent schemas with a customized validator instance', async () => {
  expect.assertions(5)
  const customAjv = new Ajv({ coerceTypes: false })
  const server = Fastify()
  const someSchema = {
    $id: 'some',
    type: 'array',
    items: {
      type: 'string'
    }
  }
  const errorResponseSchema = {
    $id: 'error_response',
    type: 'object',
    properties: {
      statusCode: {
        type: 'integer'
      },
      message: {
        type: 'string'
      }
    }
  }

  server.addSchema(someSchema)
  server.addSchema(errorResponseSchema)

  server.register((instance, _, done) => {
    instance.setSchemaController({
      compilersFactory: {
        buildValidator: function (externalSchemas) {
          const schemaKeys = Object.keys(externalSchemas)
          expect(schemaKeys.length).toBe(2)
          expect([someSchema, errorResponseSchema]).toEqual(Object.values(externalSchemas))
          for (const key of schemaKeys) {
            if (customAjv.getSchema(key) == null) {
              customAjv.addSchema(externalSchemas[key], key)
            }
          }
          return function validatorCompiler ({ schema }) {
            return customAjv.compile(schema)
          }
        }
      }
    })

    instance.get(
      '/',
      {
        schema: {
          querystring: {
            type: 'object',
            properties: {
              msg: {
                $ref: 'some#'
              }
            }
          },
          response: {
            '4xx': {
              $ref: 'error_response#'
            }
          }
        }
      },
      (req, reply) => {
        reply.send({ noop: 'noop' })
      }
    )

    done()
  })

  const res = await server.inject({
    method: 'GET',
    url: '/',
    query: {
      msg: 'string'
    }
  })
  const json = res.json()

  expect(json.message).toBe('querystring/msg must be array')
  expect(json.statusCode).toBe(400)
  expect(res.statusCode).toBe(400)
})

test('setSchemaController: Inherits buildSerializer from parent if not present within the instance', async () => {
  expect.assertions(6)
  const customAjv = new Ajv({ coerceTypes: false })
  const someSchema = {
    $id: 'some',
    type: 'array',
    items: {
      type: 'string'
    }
  }
  const errorResponseSchema = {
    $id: 'error_response',
    type: 'object',
    properties: {
      statusCode: {
        type: 'integer'
      },
      message: {
        type: 'string'
      }
    }
  }
  let rootSerializerCalled = 0
  let rootValidatorCalled = 0
  let childValidatorCalled = 0
  const rootBuildSerializer = function (externalSchemas) {
    rootSerializerCalled++
    return function serializer () {
      return data => {
        return JSON.stringify({
          statusCode: data.statusCode,
          message: data.message
        })
      }
    }
  }
  const rootBuildValidator = function (externalSchemas) {
    rootValidatorCalled++
    return function validatorCompiler ({ schema }) {
      return customAjv.compile(schema)
    }
  }
  const server = Fastify({
    schemaController: {
      compilersFactory: {
        buildValidator: rootBuildValidator,
        buildSerializer: rootBuildSerializer
      }
    }
  })

  server.addSchema(someSchema)
  server.addSchema(errorResponseSchema)

  server.register((instance, _, done) => {
    instance.setSchemaController({
      compilersFactory: {
        buildValidator: function (externalSchemas) {
          childValidatorCalled++
          const schemaKeys = Object.keys(externalSchemas)
          for (const key of schemaKeys) {
            if (customAjv.getSchema(key) == null) {
              customAjv.addSchema(externalSchemas[key], key)
            }
          }
          return function validatorCompiler ({ schema }) {
            return customAjv.compile(schema)
          }
        }
      }
    })

    instance.get(
      '/',
      {
        schema: {
          querystring: {
            type: 'object',
            properties: {
              msg: {
                $ref: 'some#'
              }
            }
          },
          response: {
            '4xx': {
              $ref: 'error_response#'
            }
          }
        }
      },
      (req, reply) => {
        reply.send({ noop: 'noop' })
      }
    )

    done()
  })

  const res = await server.inject({
    method: 'GET',
    url: '/',
    query: {
      msg: ['string']
    }
  })
  const json = res.json()

  expect(json.statusCode).toBe(400)
  expect(json.message).toBe('querystring/msg must be array')
  expect(rootSerializerCalled).toBe(1)
  expect(rootValidatorCalled).toBe(0)
  expect(childValidatorCalled).toBe(1)
  expect(res.statusCode).toBe(400)
})

test('setSchemaController: Inherits buildValidator from parent if not present within the instance', async () => {
  expect.assertions(6)
  const customAjv = new Ajv({ coerceTypes: false })
  const someSchema = {
    $id: 'some',
    type: 'array',
    items: {
      type: 'string'
    }
  }
  const errorResponseSchema = {
    $id: 'error_response',
    type: 'object',
    properties: {
      statusCode: {
        type: 'integer'
      },
      message: {
        type: 'string'
      }
    }
  }
  let rootSerializerCalled = 0
  let rootValidatorCalled = 0
  let childSerializerCalled = 0
  const rootBuildSerializer = function (externalSchemas) {
    rootSerializerCalled++
    return function serializer () {
      return data => JSON.stringify(data)
    }
  }
  const rootBuildValidator = function (externalSchemas) {
    rootValidatorCalled++
    const schemaKeys = Object.keys(externalSchemas)
    for (const key of schemaKeys) {
      if (customAjv.getSchema(key) == null) {
        customAjv.addSchema(externalSchemas[key], key)
      }
    }
    return function validatorCompiler ({ schema }) {
      return customAjv.compile(schema)
    }
  }
  const server = Fastify({
    schemaController: {
      compilersFactory: {
        buildValidator: rootBuildValidator,
        buildSerializer: rootBuildSerializer
      }
    }
  })

  server.register((instance, _, done) => {
    instance.register((subInstance, _, subDone) => {
      subInstance.setSchemaController({
        compilersFactory: {
          buildSerializer: function (externalSchemas) {
            childSerializerCalled++
            return function serializerCompiler () {
              return data => {
                return JSON.stringify({
                  statusCode: data.statusCode,
                  message: data.message
                })
              }
            }
          }
        }
      })

      subInstance.get(
        '/',
        {
          schema: {
            querystring: {
              type: 'object',
              properties: {
                msg: {
                  $ref: 'some#'
                }
              }
            },
            response: {
              '4xx': {
                $ref: 'error_response#'
              }
            }
          }
        },
        (req, reply) => {
          reply.send({ noop: 'noop' })
        }
      )

      subDone()
    })

    done()
  })

  server.addSchema(someSchema)
  server.addSchema(errorResponseSchema)

  const res = await server.inject({
    method: 'GET',
    url: '/',
    query: {
      msg: ['string']
    }
  })
  const json = res.json()

  expect(json.statusCode).toBe(400)
  expect(json.message).toBe('querystring/msg must be array')
  expect(rootSerializerCalled).toBe(0)
  expect(rootValidatorCalled).toBe(1)
  expect(childSerializerCalled).toBe(1)
  expect(res.statusCode).toBe(400)
})

test('Should throw if not default validator passed', async () => {
  expect.assertions(4)
  const customAjv = new Ajv({ coerceTypes: false })
  const someSchema = {
    $id: 'some',
    type: 'array',
    items: {
      type: 'string'
    }
  }
  const anotherSchema = {
    $id: 'another',
    type: 'integer'
  }
  const plugin = fp(function (pluginInstance, _, pluginDone) {
    pluginInstance.setSchemaController({
      compilersFactory: {
        buildValidator: function (externalSchemas) {
          const schemaKeys = Object.keys(externalSchemas)
          expect(schemaKeys.length).toBe(2)
          expect(schemaKeys).toEqual(['some', 'another'])

          for (const key of schemaKeys) {
            if (customAjv.getSchema(key) == null) {
              customAjv.addSchema(externalSchemas[key], key)
            }
          }
          return function validatorCompiler ({ schema }) {
            return customAjv.compile(schema)
          }
        }
      }
    })

    pluginDone()
  })
  const server = Fastify()

  server.addSchema(someSchema)

  server.register((instance, opts, done) => {
    instance.addSchema(anotherSchema)

    instance.register(plugin, {})

    instance.post(
      '/',
      {
        schema: {
          query: {
            type: 'object',
            properties: {
              msg: {
                $ref: 'some#'
              }
            }
          },
          headers: {
            type: 'object',
            properties: {
              'x-another': {
                $ref: 'another#'
              }
            }
          }
        }
      },
      (req, reply) => {
        reply.send({ noop: 'noop' })
      }
    )

    done()
  })

  try {
    const res = await server.inject({
      method: 'POST',
      url: '/',
      query: {
        msg: ['string']
      }
    })

    expect(res.json().message).toBe('querystring/msg must be array')
    expect(res.statusCode).toBe(400)
  } catch (err) {
    expect(err).toBeFalsy()
  }
})

test('Should coerce the array if the default validator is used', async () => {
  expect.assertions(2)
  const someSchema = {
    $id: 'some',
    type: 'array',
    items: {
      type: 'string'
    }
  }
  const anotherSchema = {
    $id: 'another',
    type: 'integer'
  }

  const server = Fastify()

  server.addSchema(someSchema)

  server.register((instance, opts, done) => {
    instance.addSchema(anotherSchema)

    instance.post(
      '/',
      {
        schema: {
          query: {
            type: 'object',
            properties: {
              msg: {
                $ref: 'some#'
              }
            }
          },
          headers: {
            type: 'object',
            properties: {
              'x-another': {
                $ref: 'another#'
              }
            }
          }
        }
      },
      (req, reply) => {
        reply.send(req.query)
      }
    )

    done()
  })

  try {
    const res = await server.inject({
      method: 'POST',
      url: '/',
      query: {
        msg: 'string'
      }
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ msg: ['string'] })
  } catch (err) {
    expect(err).toBeFalsy()
  }
})

test('Should return a human-friendly error if response status codes are not specified', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.route({
    url: '/',
    method: 'GET',
    schema: {
      response: {
        // This should be nested under a status code key, e.g { 200: { type: 'array' } }
        type: 'array'
      }
    },
    handler: (req, reply) => {
      reply.send([])
    }
  })

  fastify.ready(err => {
    expect(err.code).toBe('XUFA_ERR_SCH_SERIALIZATION_BUILD')
    expect(err.message).toBe('Failed building the serialization schema for GET: /, due to error response schemas should be nested under a valid status code, e.g { 2xx: { type: "object" } }')
    testDone()
  })
})

test('setSchemaController: custom validator instance should not mutate headers schema', async () => {
  expect.assertions(2)
  class Headers { }
  const fastify = Fastify()

  fastify.setSchemaController({
    compilersFactory: {
      buildValidator: function () {
        return ({ schema, method, url, httpPart }) => {
          expect(schema instanceof Headers).toBeTruthy()
          return () => { }
        }
      }
    }
  })

  fastify.get('/', {
    schema: {
      headers: new Headers()
    }
  }, () => { })

  await fastify.ready()
})
