'use strict'


const Fastify = require('@xufa/http')
const Swagger = require('@apidevtools/swagger-parser')
const yaml = require('yaml')
const fastifySwagger = require('../../../index')
const {
  swaggerOption,
  schemaBody,
  schemaConsumes,
  schemaExtension,
  schemaHeaders,
  schemaHeadersParams,
  schemaParams,
  schemaQuerystring,
  schemaSecurity
} = require('../../../examples/options')

test('swagger should return valid swagger object', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, swaggerOption)

  fastify.get('/', () => {})
  fastify.post('/', () => {})
  fastify.get('/example', schemaQuerystring, () => {})
  fastify.post('/example', schemaBody, () => {})
  fastify.get('/parameters/:id', schemaParams, () => {})
  fastify.get('/headers', schemaHeaders, () => {})
  fastify.get('/headers/:id', schemaHeadersParams, () => {})
  fastify.get('/security', schemaSecurity, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  expect(typeof swaggerObject).toBe('object')

  await Swagger.validate(swaggerObject)
  expect(true).toBeTruthy()
})

test('swagger should return a valid swagger yaml', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, swaggerOption)

  fastify.get('/', () => {})
  fastify.route({
    method: ['POST'],
    url: '/',
    handler: () => {}
  })
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

  await fastify.register(fastifySwagger, swaggerOption)

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

  const swaggerObject = fastify.swagger()

  await Swagger.validate(swaggerObject)
  expect(true).toBeTruthy()
  expect(swaggerObject.paths['/']).toBeTruthy()
})

test('route options - meta', async () => {
  expect.assertions(8)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, swaggerOption)

  const opts = {
    schema: {
      operationId: 'doSomething',
      summary: 'Route summary',
      tags: ['tag'],
      description: 'Route description',
      produces: ['application/octet-stream'],
      consumes: ['application/x-www-form-urlencoded'],
      externalDocs: {
        description: 'Find more info here',
        url: 'https://swagger.io'
      }
    }
  }

  fastify.get('/', opts, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()

  const api = await Swagger.validate(swaggerObject)
  const definedPath = api.paths['/'].get
  expect(definedPath).toBeTruthy()
  expect(opts.schema.operationId).toBe(definedPath.operationId)
  expect(opts.schema.summary).toBe(definedPath.summary)
  expect(opts.schema.tags).toEqual(definedPath.tags)
  expect(opts.schema.description).toBe(definedPath.description)
  expect(opts.schema.produces).toEqual(definedPath.produces)
  expect(opts.schema.consumes).toEqual(definedPath.consumes)
  expect(opts.schema.externalDocs).toBe(definedPath.externalDocs)
})

test('route options - consumes', async () => {
  expect.assertions(2)
  const fastify = Fastify()
  await fastify.register(fastifySwagger, swaggerOption)
  fastify.post('/', schemaConsumes, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()

  const api = await Swagger.validate(swaggerObject)
  const definedPath = api.paths['/'].post
  expect(definedPath).toBeTruthy()
  expect(definedPath.parameters).toEqual([{
    in: 'formData',
    name: 'hello',
    description: 'hello',
    required: true,
    type: 'string'
  }])
})

test('route options - extension', async () => {
  expect.assertions(4)
  const fastify = Fastify()
  await fastify.register(fastifySwagger, { swagger: { 'x-ternal': true } })
  fastify.get('/', schemaExtension, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()

  const api = await Swagger.validate(swaggerObject)
  expect(api['x-ternal']).toBeTruthy()
  expect(api['x-ternal']).toEqual(true)

  const definedPath = api.paths['/'].get
  expect(definedPath).toBeTruthy()
  expect(definedPath['x-tension']).toEqual(true)
})

test('route options - querystring', async () => {
  expect.assertions(2)

  const opts = {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          hello: { type: 'string' },
          world: { type: 'string', description: 'world description' }
        },
        required: ['hello']
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger, swaggerOption)
  fastify.get('/', opts, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()

  const api = await Swagger.validate(swaggerObject)
  const definedPath = api.paths['/'].get
  expect(definedPath).toBeTruthy()
  expect(definedPath.parameters).toEqual([
    {
      in: 'query',
      name: 'hello',
      type: 'string',
      required: true
    },
    {
      in: 'query',
      name: 'world',
      type: 'string',
      required: false,
      description: 'world description'
    }
  ])
})

test('swagger json output should not omit enum part in params config', async () => {
  expect.assertions(2)
  const opts = {
    schema: {
      params: {
        type: 'object',
        properties: {
          enumKey: { type: 'string', enum: ['enum1', 'enum2'] }
        }
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger, swaggerOption)
  fastify.get('/test/:enumKey', opts, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()

  const api = await Swagger.validate(swaggerObject)
  const definedPath = api.paths['/test/{enumKey}'].get
  expect(definedPath).toBeTruthy()
  expect(definedPath.parameters).toEqual([{
    in: 'path',
    name: 'enumKey',
    type: 'string',
    enum: ['enum1', 'enum2'],
    required: true
  }])
})

test('custom verbs should not be interpreted as path params', async () => {
  expect.assertions(2)
  const opts = {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger, swaggerOption)
  fastify.get('/resource/:id/sub-resource::watch', opts, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()

  const api = await Swagger.validate(swaggerObject)
  const definedPath = api.paths['/resource/{id}/sub-resource:watch'].get
  expect(definedPath).toBeTruthy()
  expect(definedPath.parameters).toEqual([{
    in: 'path',
    name: 'id',
    type: 'string',
    required: true
  }])
})

test('swagger json output should not omit consume in querystring schema', async (ctx) => {
  expect.assertions(1)
  const fastify = Fastify({
    ajv: {
      plugins: [
        function (ajv) {
          ajv.addKeyword({ keyword: 'x-consume' })
        }
      ]
    }
  })

  await fastify.register(fastifySwagger, swaggerOption)

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

  fastify.get('/', schemaQuerystring, () => {})

  await fastify.ready()

  try {
    fastify.swagger()
    expect.fail('error was not thrown')
  } catch (err) {
    if (err.message.startsWith('Complex serialization is not supported by Swagger')) {
      expect(true).toBeTruthy()
    } else {
      ctx.error(err)
    }
  }
})

test('swagger should not support Links', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, swaggerOption)

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

  expect(() => fastify.swagger()).toThrow(new Error('Swagger (Open API v2) does not support Links. Upgrade to OpenAPI v3 (see @fastify/swagger readme)'))
})

test('security headers ignored when declared in security and securityScheme', async () => {
  expect.assertions(6)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, swaggerOption)

  fastify.get('/address1/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      },
      headers: {
        type: 'object',
        properties: {
          apiKey: {
            type: 'string',
            description: 'api token'
          },
          somethingElse: {
            type: 'string',
            description: 'common field'
          }
        }
      }
    }
  }, () => {})

  fastify.get('/address2/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      },
      headers: {
        type: 'object',
        properties: {
          authKey: {
            type: 'string',
            description: 'auth token'
          },
          somethingElse: {
            type: 'string',
            description: 'common field'
          }
        }
      }
    }
  }, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  expect(typeof swaggerObject).toBe('object')

  const api = await Swagger.validate(swaggerObject)
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
    swagger: {
      securityDefinitions: {
        apiKey: {
          type: 'apiKey',
          name: 'apiKey',
          in: 'query'
        }
      },
      security: [{
        apiKey: []
      }]
    }
  })

  fastify.get('/address1/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          apiKey: {
            type: 'string',
            description: 'api token'
          },
          somethingElse: {
            type: 'string',
            description: 'common field'
          }
        }
      }
    }
  }, () => {})

  fastify.get('/address2/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          authKey: {
            type: 'string',
            description: 'auth token'
          },
          somethingElse: {
            type: 'string',
            description: 'common field'
          }
        }
      }
    }
  }, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  expect(typeof swaggerObject).toBe('object')

  const api = await Swagger.validate(swaggerObject)
  expect(true).toBeTruthy()
  expect(api.paths['/address1/{id}'].get.parameters.find(({ name }) => (name === 'somethingElse'))).toBeTruthy()
  expect(api.paths['/address2/{id}'].get.parameters.find(({ name }) => (name === 'somethingElse'))).toBeTruthy()
  expect(api.paths['/address1/{id}'].get.parameters.find(({ name }) => (name === 'apiKey'))).toBe(undefined)
  expect(api.paths['/address2/{id}'].get.parameters.find(({ name }) => (name === 'authKey'))).toBeTruthy()
})

test('verify generated path param definition with route prefixing', async () => {
  const opts = {
    schema: {}
  }

  const fastify = Fastify()

  await fastify.register(fastifySwagger, swaggerOption)
  await fastify.register(function (app, _, done) {
    app.get('/:userId', opts, () => {})

    done()
  }, { prefix: '/v1' })
  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/v1/{userId}'].get

  expect(definedPath.parameters).toEqual([{
    in: 'path',
    name: 'userId',
    type: 'string',
    required: true
  }])
})
