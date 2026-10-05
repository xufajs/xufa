'use strict'

const asJson = (value) => JSON.parse(JSON.stringify(value))


const Fastify = require('@xufa/http')
const Swagger = require('@apidevtools/swagger-parser')
const yaml = require('yaml')
const fastifySwagger = require('../../../index')
const {
  openapiOption,
  openapiRelativeOptions,
  schemaBody,
  schemaConsumes,
  schemaCookies,
  schemaExtension,
  schemaHeaders,
  schemaHeadersParams,
  schemaParams,
  schemaProduces,
  schemaQuerystring,
  schemaSecurity,
  schemaOperationId
} = require('../../../examples/options')

test('openapi should return a valid swagger object', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

  fastify.get('/', () => {})
  fastify.post('/', () => {})
  fastify.get('/example', schemaQuerystring, () => {})
  fastify.post('/example', schemaBody, () => {})
  fastify.get('/parameters/:id', schemaParams, () => {})
  fastify.get('/headers', schemaHeaders, () => {})
  fastify.get('/headers/:id', schemaHeadersParams, () => {})
  fastify.get('/security', schemaSecurity, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  expect(typeof openapiObject).toBe('object')

  await Swagger.validate(openapiObject)
  expect(true).toBeTruthy()
})

test('openapi should return a valid swagger yaml', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

  fastify.get('/', () => {})
  fastify.post('/', () => {})
  fastify.get('/example', schemaQuerystring, () => {})
  fastify.post('/example', schemaBody, () => {})
  fastify.get('/parameters/:id', schemaParams, () => {})
  fastify.get('/headers', schemaHeaders, () => {})
  fastify.get('/headers/:id', schemaHeadersParams, () => {})
  fastify.get('/security', schemaSecurity, () => {})

  await fastify.ready()

  const swaggerYaml = fastify.swagger({ yaml: true })
  expect(typeof swaggerYaml).toBe('string')
  yaml.parse(swaggerYaml)
  expect(true).toBeTruthy()
})

test('route options - deprecated', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

  const opts = {
    schema: {
      deprecated: true,
      body: {
        type: 'object',
        properties: {
          hello: { type: 'string' },
          obj: {
            type: 'object',
            properties: {
              some: { type: 'string' }
            }
          }
        }
      }
    }
  }

  fastify.post('/', opts, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()

  await Swagger.validate(openapiObject)
  expect(true).toBeTruthy()
  expect(openapiObject.paths['/']).toBeTruthy()
})

test('route options - QUERY method (OpenAPI 3.2.0)', async () => {
  expect.assertions(3)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    openapi: { openapi: '3.2.0' }
  })

  fastify.route({
    method: 'QUERY',
    url: '/search',
    schema: {
      body: {
        type: 'object',
        properties: {
          q: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    },
    handler: () => []
  })

  await fastify.ready()

  const openapiObject = fastify.swagger()
  const operation = openapiObject.paths['/search'].query

  expect(operation).toBeTruthy()
  expect(operation.requestBody).toEqual({
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            q: { type: 'string' }
          }
        }
      }
    }
  })
  expect(operation.responses['200']).toBeTruthy()
})

test('route options - custom HTTP methods are additionalOperations (OpenAPI 3.2.0)', async () => {
  const fastify = Fastify()
  fastify.addHttpMethod('PROPFIND', { hasBody: true })
  fastify.addHttpMethod('MKCOL')

  await fastify.register(fastifySwagger, {
    openapi: { openapi: '3.2.0' }
  })

  const schema = { body: { type: 'object', properties: { depth: { type: 'string' } } } }
  fastify.route({ method: ['POST', 'PROPFIND'], url: '/dav', schema, handler: () => ({}) })
  fastify.route({ method: 'MKCOL', url: '/dav', handler: () => ({}) })

  await fastify.ready()

  const pathItem = fastify.swagger().paths['/dav']

  expect(Object.keys(pathItem)).toEqual(['post', 'additionalOperations'])
  expect(Object.keys(pathItem.additionalOperations)).toEqual(['PROPFIND', 'MKCOL'])
  expect(pathItem.additionalOperations.PROPFIND.requestBody.content['application/json'].schema).toEqual(schema.body)
  expect(pathItem.additionalOperations.MKCOL.responses['200']).toBeTruthy()
})

test('route options - custom HTTP methods are left as they are before OpenAPI 3.2.0', async () => {
  for (const openapi of [{}, { openapi: '3.1.0' }, { openapi: 'latest' }]) {
    const fastify = Fastify()
    fastify.addHttpMethod('PROPFIND', { hasBody: true })

    await fastify.register(fastifySwagger, { openapi })
    fastify.route({ method: 'PROPFIND', url: '/dav', handler: () => ({}) })
    await fastify.ready()

    expect(Object.keys(fastify.swagger().paths['/dav'])).toEqual(['propfind'])
  }
})

test('route options - meta', async () => {
  expect.assertions(7)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

  const opts = {
    schema: {
      operationId: 'doSomething',
      summary: 'Route summary',
      tags: ['tag'],
      description: 'Route description',
      servers: [
        {
          url: 'https://localhost'
        }
      ],
      externalDocs: {
        description: 'Find more info here',
        url: 'https://swagger.io'
      }
    }
  }

  fastify.get('/', opts, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()

  const api = await Swagger.validate(openapiObject)
  const definedPath = api.paths['/'].get
  expect(definedPath).toBeTruthy()
  expect(opts.schema.operationId).toBe(definedPath.operationId)
  expect(opts.schema.summary).toBe(definedPath.summary)
  expect(opts.schema.tags).toEqual(definedPath.tags)
  expect(opts.schema.description).toBe(definedPath.description)
  expect(opts.schema.servers).toBe(definedPath.servers)
  expect(opts.schema.externalDocs).toBe(definedPath.externalDocs)
})

test('route options - produces', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

  fastify.get('/', schemaProduces, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()

  const api = await Swagger.validate(openapiObject)
  const definedPath = api.paths['/'].get
  expect(definedPath).toBeTruthy()
  expect(definedPath.responses[200].content).toEqual({
    '*/*': {
      schema: {
        type: 'object',
        properties: {
          hello: {
            description: 'hello',
            type: 'string'
          }
        },
        required: ['hello']
      }
    }

  })
})

test('route options - cookies', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

  fastify.get('/', schemaCookies, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  const api = await Swagger.validate(openapiObject)
  const definedPath = api.paths['/'].get
  expect(definedPath).toBeTruthy()
  expect(definedPath.parameters).toEqual([
    {
      required: false,
      in: 'cookie',
      name: 'bar',
      schema: {
        type: 'string'
      }
    }
  ])
})

test('route options - extension', async () => {
  expect.assertions(4)
  const fastify = Fastify()
  await fastify.register(fastifySwagger, { openapi: { 'x-ternal': true } })
  fastify.get('/', schemaExtension, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()

  const api = await Swagger.validate(openapiObject)
  expect(api['x-ternal']).toBeTruthy()
  expect(api['x-ternal']).toEqual(true)

  const definedPath = api.paths['/'].get
  expect(definedPath).toBeTruthy()
  expect(definedPath['x-tension']).toEqual(true)
})

test('parses form parameters when all api consumes application/x-www-form-urlencoded', async () => {
  expect.assertions(2)
  const fastify = Fastify()
  await fastify.register(fastifySwagger, openapiOption)
  fastify.post('/', schemaConsumes, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()

  const api = await Swagger.validate(openapiObject)
  const definedPath = api.paths['/'].post
  expect(definedPath).toBeTruthy()
  expect(definedPath.requestBody.content).toEqual({
    'application/x-www-form-urlencoded': {
      schema: {
        type: 'object',
        properties: {
          hello: {
            description: 'hello',
            type: 'string'
          }
        },
        required: ['hello']
      }
    }

  })
})

test('route options - method', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

  fastify.route({
    method: ['GET', 'POST'],
    url: '/',
    handler: function (request, reply) {
      reply.send({ hello: 'world' })
    }
  })

  await fastify.ready()

  const openapiObject = fastify.swagger()
  expect(typeof openapiObject).toBe('object')

  await Swagger.validate(openapiObject)
  expect(true).toBeTruthy()
})

test('cookie, query, path description', async () => {
  expect.assertions(6)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

  const schemaCookies = {
    schema: {
      cookies: {
        type: 'object',
        properties: {
          bar: { type: 'string', description: 'Bar' }
        }
      }
    }
  }
  const schemaQuerystring = {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          hello: { type: 'string', description: 'Hello' }
        }
      }
    }
  }
  // test without description as other test case for params already have description
  const schemaParams = {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      }
    }
  }

  fastify.get('/', schemaCookies, () => {})
  fastify.get('/example', schemaQuerystring, () => {})
  fastify.get('/parameters/:id', schemaParams, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  const api = await Swagger.validate(openapiObject)
  const cookiesPath = api.paths['/'].get
  expect(cookiesPath).toBeTruthy()
  expect(cookiesPath.parameters).toEqual([
    {
      required: false,
      in: 'cookie',
      name: 'bar',
      description: 'Bar',
      schema: {
        type: 'string'
      }
    }
  ])
  const querystringPath = api.paths['/example'].get
  expect(querystringPath).toBeTruthy()
  expect(querystringPath.parameters).toEqual([
    {
      required: false,
      in: 'query',
      name: 'hello',
      description: 'Hello',
      schema: {
        type: 'string'
      }
    }
  ])
  const paramPath = api.paths['/parameters/{id}'].get
  expect(paramPath).toBeTruthy()
  expect(paramPath.parameters).toEqual([
    {
      required: true,
      in: 'path',
      name: 'id',
      schema: {
        type: 'string'
      }
    }
  ])
})

test('cookie and query with serialization type', async () => {
  expect.assertions(4)
  const fastify = Fastify({
    ajv: {
      plugins: [
        function (ajv) {
          ajv.addKeyword({
            keyword: 'x-consume'
          })
        }
      ]
    }
  })

  await fastify.register(fastifySwagger, openapiOption)

  const schemaCookies = {
    schema: {
      cookies: {
        type: 'object',
        properties: {
          bar: {
            type: 'object',
            'x-consume': 'application/json',
            required: ['foo'],
            properties: {
              foo: { type: 'string' },
              bar: { type: 'string' }
            }
          }
        }
      }
    }
  }
  const schemaQuerystring = {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          hello: {
            type: 'object',
            'x-consume': 'application/json',
            required: ['bar'],
            properties: {
              bar: { type: 'string' },
              baz: { type: 'string' }
            }
          }
        }
      }
    }
  }

  fastify.get('/', schemaCookies, () => {})
  fastify.get('/example', schemaQuerystring, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  const api = await Swagger.validate(openapiObject)

  const cookiesPath = api.paths['/'].get
  expect(cookiesPath).toBeTruthy()
  expect(asJson(cookiesPath.parameters)).toEqual(asJson([
    {
      [Symbol.for('@fastify/swagger.rawRequired')]: ['foo'],
      required: false,
      in: 'cookie',
      name: 'bar',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['foo'],
            properties: {
              foo: { type: 'string' },
              bar: { type: 'string' }
            }
          }
        }
      }
    }
  ]))

  const querystringPath = api.paths['/example'].get
  expect(querystringPath).toBeTruthy()
  expect(asJson(querystringPath.parameters)).toEqual(asJson([
    {
      required: false,
      in: 'query',
      name: 'hello',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['bar'],
            properties: {
              bar: { type: 'string' },
              baz: { type: 'string' }
            }
          }
        }
      }
    }
  ]))
})

test('openapi should pass through operationId', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

  fastify.get('/hello', schemaOperationId, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  expect(typeof openapiObject).toBe('object')

  await Swagger.validate(openapiObject)
  expect(true).toBeTruthy()
})

test('openapi should pass through Links', async () => {
  expect.assertions(3)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

  fastify.get('/user/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'the user identifier, as userId'
          }
        },
        required: ['id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            uuid: {
              type: 'string',
              format: 'uuid'
            }
          }
        }
      }
    },
    links: {
      200: {
        address: {
          operationId: 'getUserAddress',
          parameters: {
            id: '$request.path.id'
          }
        }
      }
    }
  }, () => {})

  fastify.get('/user/:id/address', {
    schema: {
      operationId: 'getUserAddress',
      params: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'the user identifier, as userId'
          }
        },
        required: ['id']
      },
      response: {
        200: {
          type: 'string'
        }
      }
    }
  }, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  expect(typeof openapiObject).toBe('object')

  const api = await Swagger.validate(openapiObject)
  expect(true).toBeTruthy()
  expect(api.paths['/user/{id}'].get.responses['200'].links).toEqual({
    address: {
      operationId: 'getUserAddress',
      parameters: {
        id: '$request.path.id'
      }
    }

  })
})

test('links without status code', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

  fastify.get('/user/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'the user identifier, as userId'
          }
        },
        required: ['id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            uuid: {
              type: 'string',
              format: 'uuid'
            }
          }
        }
      }
    },
    links: {
      201: {
        address: {
          operationId: 'getUserAddress',
          parameters: {
            id: '$request.path.id'
          }
        }
      }
    }
  }, () => {})

  fastify.get('/user/:id/address', {
    schema: {
      operationId: 'getUserAddress',
      params: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'the user identifier, as userId'
          }
        },
        required: ['id']
      },
      response: {
        200: {
          type: 'string'
        }
      }
    }
  }, () => {})

  await fastify.ready()

  expect(() => fastify.swagger()).toThrow(new Error('missing status code 201 in route /user/:id'))
})

test('security headers ignored when declared in security and securityScheme', async () => {
  expect.assertions(6)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

  fastify.get('/address1/:id', {
    schema: {
      headers: {
        type: 'object',
        properties: {
          apiKey: {
            type: 'string',
            description: 'api token'
          },
          bearerAuth: {
            type: 'string',
            description: 'authorization bearer'
          },
          id: {
            type: 'string',
            description: 'common field'
          }
        }
      }
    }
  }, () => {})

  fastify.get('/address2/:id', {
    schema: {
      headers: {
        type: 'object',
        properties: {
          authKey: {
            type: 'string',
            description: 'auth token'
          },
          id: {
            type: 'string',
            description: 'common field'
          }
        }
      }
    }
  }, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  expect(typeof openapiObject).toBe('object')

  const api = await Swagger.validate(openapiObject)
  expect(true).toBeTruthy()
  expect(api.paths['/address1/{id}'].get.parameters.find(({ name }) => (name === 'id'))).toBeTruthy()
  expect(api.paths['/address2/{id}'].get.parameters.find(({ name }) => (name === 'id'))).toBeTruthy()
  expect(api.paths['/address1/{id}'].get.parameters.find(({ name }) => (name === 'apiKey'))).toBe(undefined)
  expect(api.paths['/address2/{id}'].get.parameters.find(({ name }) => (name === 'authKey'))).toBeTruthy()
})

test('security querystrings ignored when declared in security and securityScheme', async () => {
  expect.assertions(6)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    openapi: {
      components: {
        securitySchemes: {
          apiKey: {
            type: 'apiKey',
            name: 'apiKey',
            in: 'query'
          }
        }
      },
      security: [{
        apiKey: []
      }]
    }
  })

  fastify.get('/address1/:id', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          apiKey: {
            type: 'string',
            description: 'api token'
          },
          id: {
            type: 'string',
            description: 'common field'
          }
        }
      }
    }
  }, () => {})

  fastify.get('/address2/:id', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          authKey: {
            type: 'string',
            description: 'auth token'
          },
          id: {
            type: 'string',
            description: 'common field'
          }
        }
      }
    }
  }, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  expect(typeof openapiObject).toBe('object')

  const api = await Swagger.validate(openapiObject)
  expect(true).toBeTruthy()
  expect(api.paths['/address1/{id}'].get.parameters.find(({ name }) => (name === 'id'))).toBeTruthy()
  expect(api.paths['/address2/{id}'].get.parameters.find(({ name }) => (name === 'id'))).toBeTruthy()
  expect(api.paths['/address1/{id}'].get.parameters.find(({ name }) => (name === 'apiKey'))).toBe(undefined)
  expect(api.paths['/address2/{id}'].get.parameters.find(({ name }) => (name === 'authKey'))).toBeTruthy()
})

test('security cookies ignored when declared in security and securityScheme', async () => {
  expect.assertions(6)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    openapi: {
      components: {
        securitySchemes: {
          apiKey: {
            type: 'apiKey',
            name: 'apiKey',
            in: 'cookie'
          }
        }
      },
      security: [{
        apiKey: []
      }]
    }
  })

  fastify.get('/address1/:id', {
    schema: {
      cookies: {
        type: 'object',
        properties: {
          apiKey: {
            type: 'string',
            description: 'api token'
          },
          id: {
            type: 'string',
            description: 'common field'
          }
        }
      }
    }
  }, () => {})

  fastify.get('/address2/:id', {
    schema: {
      cookies: {
        type: 'object',
        properties: {
          authKey: {
            type: 'string',
            description: 'auth token'
          },
          id: {
            type: 'string',
            description: 'common field'
          }
        }
      }
    }
  }, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  expect(typeof openapiObject).toBe('object')

  const api = await Swagger.validate(openapiObject)
  expect(true).toBeTruthy()
  expect(api.paths['/address1/{id}'].get.parameters.find(({ name }) => (name === 'id'))).toBeTruthy()
  expect(api.paths['/address2/{id}'].get.parameters.find(({ name }) => (name === 'id'))).toBeTruthy()
  expect(api.paths['/address1/{id}'].get.parameters.find(({ name }) => (name === 'apiKey'))).toBe(undefined)
  expect(api.paths['/address2/{id}'].get.parameters.find(({ name }) => (name === 'authKey'))).toBeTruthy()
})

test('path params on relative url', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiRelativeOptions)

  const schemaParams = {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      }
    }
  }
  fastify.get('/parameters/:id', schemaParams, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  const api = await Swagger.validate(openapiObject)
  const paramPath = api.paths['/parameters/{id}'].get
  expect(paramPath).toBeTruthy()
  expect(paramPath.parameters).toEqual([
    {
      required: true,
      in: 'path',
      name: 'id',
      schema: {
        type: 'string'
      }
    }
  ])
})

test('verify generated path param definition with route prefixing', async () => {
  const opts = {
    schema: {}
  }

  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiRelativeOptions)
  await fastify.register(function (app, _, done) {
    app.get('/:userId', opts, () => {})

    done()
  }, { prefix: '/v1' })
  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/v1/{userId}'].get

  expect(definedPath.parameters).toEqual([{
    schema: {
      type: 'string'
    },
    in: 'path',
    name: 'userId',
    required: true
  }])
})
