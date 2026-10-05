'use strict'


const Fastify = require('@xufa/http')
const Swagger = require('@apidevtools/swagger-parser')
const fastifySwagger = require('../../../index')
const S = require('fluent-json-schema')

test('support file in json schema', async () => {
  const opts7 = {
    schema: {
      consumes: ['application/x-www-form-urlencoded'],
      body: {
        type: 'object',
        properties: {
          hello: {
            description: 'hello',
            type: 'string',
            contentEncoding: 'binary'
          }
        },
        required: ['hello']
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger)
  fastify.post('/', opts7, () => {})

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
    type: 'file'
  }])
})

test('support response description', async () => {
  const opts8 = {
    schema: {
      response: {
        200: {
          description: 'Response OK!',
          type: 'object'
        }
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger)
  fastify.get('/', opts8, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].get
  expect(definedPath.responses['200'].description).toEqual('Response OK!')
})

test('support response description fallback to its $ref', async () => {
  const opts = {
    schema: {
      response: {
        200: {
          $ref: 'my-ref#'
        }
      }
    }
  }

  const fastify = Fastify()
  fastify.addSchema({
    $id: 'my-ref',
    description: 'Response OK!',
    type: 'string'
  })

  await fastify.register(fastifySwagger)
  fastify.get('/', opts, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].get
  expect(definedPath.responses['200'].description).toEqual('Response OK!')
})

test('response default description', async () => {
  const opts9 = {
    schema: {
      response: {
        200: {
          type: 'object'
        }
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger)
  fastify.get('/', opts9, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].get
  expect(definedPath.responses['200'].description).toEqual('Default Response')
})

test('response 2xx', async () => {
  const opt = {
    schema: {
      response: {
        '2xx': {
          type: 'object'
        }
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger)
  fastify.get('/', opt, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].get
  expect(definedPath.responses['200'].description).toEqual('Default Response')
  expect(definedPath.responses['2XX']).toBe(undefined)
})

test('response conflict 2xx and 200', async () => {
  const opt = {
    schema: {
      response: {
        '2xx': {
          type: 'object',
          description: '2xx'
        },
        200: {
          type: 'object',
          description: '200'
        }
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger)
  fastify.get('/', opt, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].get
  expect(definedPath.responses['200'].description).toEqual('200')
  expect(definedPath.responses['2XX']).toBe(undefined)
})

test('support status code 204', async () => {
  const opt = {
    schema: {
      response: {
        204: {
          type: 'null',
          description: 'No Content'
        }
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger)
  fastify.get('/', opt, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].get
  expect(definedPath.responses['204'].description).toEqual('No Content')
  expect(definedPath.responses['204'].schema).toBe(undefined)
})

test('support empty response body for different status than 204', async () => {
  const opt = {
    schema: {
      response: {
        204: {
          type: 'null',
          description: 'No Content'
        },
        503: {
          type: 'null',
          description: 'Service Unavailable'
        }
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger)
  fastify.get('/', opt, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].get

  expect(definedPath.responses['204'].description).toEqual('No Content')
  expect(definedPath.responses['204'].content).toBe(undefined)
  expect(definedPath.responses['503'].type).toBe(undefined)

  expect(definedPath.responses['503'].description).toEqual('Service Unavailable')
  expect(definedPath.responses['503'].content).toBe(undefined)
  expect(definedPath.responses['503'].type).toBe(undefined)
})

test('support response headers', async () => {
  const opt = {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            hello: {
              type: 'string'
            }
          },
          headers: {
            'X-WORLD': {
              type: 'string'
            }
          }
        }
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger)
  fastify.get('/', opt, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].get
  expect(definedPath.responses['200'].headers).toEqual(opt.schema.response['200'].headers)
  expect(definedPath.responses['200'].schema.headers).toBe(undefined)
})

describe('response: description and x-response-description', () => {
const description = 'description - always that of response body, sometimes also that of response as a whole'
const responseDescription = 'description only for the response as a whole'
test('description without x-response-description doubles as response description', async () => {
    // Given a /description endpoint with only a |description| field in its response schema
    const fastify = Fastify()
    await fastify.register(fastifySwagger)
    fastify.get('/description', {
      schema: {
        response: {
          200: {
            description,
            type: 'string'
          }
        }
      }
    }, () => {})
    await fastify.ready()

    // When the Swagger schema is generated
    const swaggerObject = fastify.swagger()
    const api = await Swagger.validate(swaggerObject)

    // Then the /description endpoint uses the |description| as both the description of the Response Object as well as of its Schema Object
    const responseObject = api.paths['/description'].get.responses['200']
    expect(responseObject).toBeTruthy()
    expect(responseObject.description).toBe(description)
    expect(responseObject.schema.description).toBe(description)
  })
test('description alongside x-response-description only describes response body', async () => {
    // Given a /responseDescription endpoint that also has a |'x-response-description'| field in its response schema
    const fastify = Fastify()
    await fastify.register(fastifySwagger)
    fastify.get('/responseDescription', {
      schema: {
        response: {
          200: {
            'x-response-description': responseDescription,
            description,
            type: 'string'
          }
        }
      }
    }, () => {})
    await fastify.ready()

    // When the Swagger schema is generated
    const swaggerObject = fastify.swagger()
    const api = await Swagger.validate(swaggerObject)

    // Then the /responseDescription endpoint uses the |responseDescription| only for the Response Object and the |description| only for the Schema Object
    const responseObject = api.paths['/responseDescription'].get.responses['200']
    expect(responseObject).toBeTruthy()
    expect(responseObject.description).toBe(responseDescription)
    expect(responseObject.schema.description).toBe(description)
    expect(responseObject.schema.responseDescription).toBe(undefined)
  })
})

test('support "default" parameter', async () => {
  const opt = {
    schema: {
      response: {
        200: {
          description: 'Expected Response',
          type: 'object',
          properties: {
            foo: {
              type: 'string'
            }
          }
        },
        default: {
          description: 'Default Response',
          type: 'object',
          properties: {
            bar: {
              type: 'string'
            }
          }
        }
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger)
  fastify.get('/', opt, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].get

  expect(JSON.parse(JSON.stringify(definedPath.responses.default))).toEqual({
    description: 'Default Response',
    schema: {
      description: 'Default Response',
      type: 'object',
      properties: {
        bar: {
          type: 'string'
        }
      }
    }
  })
})

test('fluent-json-schema', async () => {
  const opt = {
    schema: {
      response: {
        200: S.object()
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger, { swagger: true })
  fastify.get('/', opt, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].get
  expect(definedPath.responses['200'].description).toEqual('Default Response')
})

test('support "patternProperties" in json schema', async () => {
  const opt = {
    schema: {
      body: {
        type: 'object',
        patternProperties: {
          '^[a-z]{2,3}-[a-zA-Z]{2}$': {
            type: 'string'
          }
        }
      },
      response: {
        200: {
          description: 'Expected Response',
          type: 'object',
          properties: {
            foo: {
              type: 'object',
              patternProperties: {
                '^[a-z]{2,3}-[a-zA-Z]{2}$': {
                  type: 'string'
                }
              },
              additionalProperties: false
            }
          }
        }
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger, { swagger: true })
  fastify.post('/', opt, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].post

  expect(JSON.parse(JSON.stringify(definedPath.parameters[0].schema))).toEqual({
    type: 'object',
    additionalProperties: { type: 'string' }
  })

  expect(JSON.parse(JSON.stringify(definedPath.responses[200]))).toEqual({
    description: 'Expected Response',
    schema: {
      description: 'Expected Response',
      type: 'object',
      properties: {
        foo: {
          type: 'object',
          additionalProperties: { type: 'string' }
        }
      }
    }
  })
})

test('support "const" keyword', async () => {
  const opt = {
    schema: {
      body: {
        type: 'object',
        properties: {
          obj: {
            type: 'object',
            properties: {
              constantProp: { const: 'my-const' },
              constantPropNull: { const: null },
              constantPropZero: { const: 0 },
              constantPropFalse: { const: false },
              constantPropEmptyString: { const: '' }
            }
          }
        }
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger)
  fastify.post('/', opt, () => {})
  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].post
  expect(JSON.parse(JSON.stringify(definedPath.parameters[0].schema))).toEqual({
    type: 'object',
    properties: {
      obj: {
        type: 'object',
        properties: {
          constantProp: {
            enum: ['my-const']
          },
          constantPropZero: {
            enum: [0]
          },
          constantPropNull: {
            enum: [null]
          },
          constantPropFalse: {
            enum: [false]
          },
          constantPropEmptyString: {
            enum: ['']
          }
        }
      }
    }
  })
})

test('support "description" keyword', async () => {
  const opt = {
    schema: {
      body: {
        type: 'object',
        description: 'Body description',
        properties: {
          foo: {
            type: 'number'
          }
        }
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger)
  fastify.post('/', opt, () => { })
  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].post
  expect(definedPath.parameters[0].description).toEqual('Body description')
  expect(JSON.parse(JSON.stringify(definedPath.parameters[0].schema))).toEqual({
    type: 'object',
    description: 'Body description',
    properties: {
      foo: {
        type: 'number'
      }
    }
  })
})

test('no head routes by default', async () => {
  const fastify = Fastify({ exposeHeadRoutes: true })
  await fastify.register(fastifySwagger, {
    routePrefix: '/docs',
    exposeRoute: true
  })

  fastify.get('/with-head', {
    schema: {
      operationId: 'with-head',
      response: {
        200: {
          description: 'Expected Response',
          type: 'object',
          properties: {
            foo: { type: 'string' }
          }
        }
      }
    }
  }, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  expect(api.paths['/with-head'].get.responses['200'].description).toEqual('Expected Response')
  expect(api.paths['/with-head'].head).toEqual(undefined)
})

test('support "exposeHeadRoutes" option', async () => {
  const fastify = Fastify()
  await fastify.register(fastifySwagger, {
    routePrefix: '/docs',
    exposeHeadRoutes: true,
    exposeRoute: true
  })

  fastify.get('/with-head', {
    schema: {
      operationId: 'with-head',
      response: {
        200: {
          description: 'Expected Response',
          type: 'object',
          properties: {
            foo: { type: 'string' }
          }
        }
      }
    }
  }, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  expect(api.paths['/with-head'].get.responses['200'].description).toEqual('Expected Response')
  expect(api.paths['/with-head'].head.responses['200'].description).toEqual('Expected Response')
})

test('support "exposeHeadRoutes" option at route level', async () => {
  const fastify = Fastify()
  await fastify.register(fastifySwagger, {
    routePrefix: '/docs',
    exposeRoute: true
  })

  fastify.get('/with-head', {
    schema: {
      operationId: 'with-head',
      response: {
        200: {
          description: 'Expected Response',
          type: 'object',
          properties: {
            foo: { type: 'string' }
          }
        }
      }
    },
    config: {
      swagger: {
        exposeHeadRoute: true
      }
    }
  }, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  expect(api.paths['/with-head'].get.responses['200'].description).toEqual('Expected Response')
  expect(api.paths['/with-head'].head.responses['200'].description).toEqual('Expected Response')
})

test('add default properties for url params when missing schema', async () => {
  const opt = {}

  const fastify = Fastify()
  await fastify.register(fastifySwagger)
  fastify.get('/:userId', opt, () => { })
  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/{userId}'].get

  expect(definedPath.parameters[0]).toEqual({
    type: 'string',
    required: true,
    in: 'path',
    name: 'userId'
  })
})

test('add default properties for url params when missing schema.params', async () => {
  const opt = {
    schema: {
      body: {
        type: 'object',
        properties: {
          bio: {
            type: 'string'
          }
        }
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger)
  fastify.post('/:userId', opt, () => { })
  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/{userId}'].post

  expect(JSON.parse(JSON.stringify(definedPath.parameters[0].schema))).toEqual({
    type: 'object',
    properties: {
      bio: {
        type: 'string'
      }
    }
  })
  expect(definedPath.parameters[1]).toEqual({
    in: 'path',
    name: 'userId',
    type: 'string',
    required: true
  })
})

test('avoid overwriting params when schema.params is provided', async () => {
  const opt = {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: {
            type: 'string'
          }
        }
      },
      body: {
        type: 'object',
        properties: {
          bio: {
            type: 'string'
          }
        }
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger)
  fastify.post('/:userId', opt, () => { })
  await fastify.ready()

  const swaggerObject = fastify.swagger()

  const definedPath = swaggerObject.paths['/{userId}'].post

  expect(JSON.parse(JSON.stringify(definedPath.parameters[0].schema))).toEqual({
    type: 'object',
    properties: {
      bio: {
        type: 'string'
      }
    }
  })
  expect(definedPath.parameters[1]).toEqual({
    in: 'path',
    name: 'id',
    type: 'string',
    required: true
  })
})
