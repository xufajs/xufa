'use strict'


const Fastify = require('@xufa/http')
const Swagger = require('@apidevtools/swagger-parser')
const fastifySwagger = require('../../../index')
const S = require('fluent-json-schema')
const {
  openapiOption,
  schemaAllOf
} = require('../../../examples/options')

test('support file in json schema', async () => {
  const opts = {
    schema: {
      consumes: ['multipart/form-data'],
      body: {
        type: 'object',
        properties: {
          file: {
            description: 'a file',
            type: 'string',
            contentEncoding: 'binary'
          }
        },
        required: ['file']
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger, openapiOption)
  fastify.post('/', opts, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  const api = await Swagger.validate(openapiObject)

  const definedPath = api.paths['/'].post
  expect(definedPath).toBeTruthy()
  expect(definedPath.requestBody.content['multipart/form-data'].schema.properties.file).toEqual({
      description: 'a file',
      type: 'string',
      format: 'binary'
    })
})

test('support base64 contentEncoding in json schema', async () => {
  const opts = {
    schema: {
      consumes: ['multipart/form-data'],
      body: {
        type: 'object',
        properties: {
          file: {
            description: 'a base64 file',
            type: 'string',
            contentEncoding: 'base64'
          }
        },
        required: ['file']
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger, openapiOption)
  fastify.post('/', opts, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  const api = await Swagger.validate(openapiObject)

  const definedPath = api.paths['/'].post
  expect(definedPath).toBeTruthy()
  expect(definedPath.requestBody.content['multipart/form-data'].schema.properties.file).toEqual({
      description: 'a base64 file',
      type: 'string',
      format: 'byte'
    })
})

test('support - oneOf, anyOf, allOf', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

  fastify.get('/', schemaAllOf, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  const api = await Swagger.validate(openapiObject)
  const definedPath = api.paths['/'].get
  expect(definedPath).toBeTruthy()
  expect(definedPath.parameters).toEqual([
    {
      required: false,
      in: 'query',
      name: 'foo',
      schema: {
        type: 'string'
      }
    }
  ])
})

test('support - oneOf, anyOf, allOf in headers', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

  const schema = {
    schema: {
      headers: {
        allOf: [
          {
            type: 'object',
            properties: {
              foo: { type: 'string' }
            }
          }
        ]
      }
    }
  }
  fastify.get('/', schema, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()

  const api = await Swagger.validate(openapiObject)
  const definedPath = api.paths['/'].get
  expect(definedPath).toBeTruthy()
  expect(definedPath.parameters).toEqual([
    {
      required: false,
      in: 'header',
      name: 'foo',
      schema: {
        type: 'string'
      }
    }
  ])
})

test('support 2xx response', async () => {
  const opt = {
    schema: {
      response: {
        '2XX': {
          type: 'object'
        },
        '3xx': {
          type: 'object'
        }
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger, {
    openapi: true
  })
  fastify.get('/', opt, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].get
  expect(definedPath.responses['2XX'].description).toEqual('Default Response')
  expect(definedPath.responses['3XX'].description).toEqual('Default Response')
})

test('support multiple content types as response', async () => {
  const fastify = Fastify()
  await fastify.register(fastifySwagger, {
    openapi: true,
    routePrefix: '/docs',
    exposeRoute: true
  })

  const opt = {
    schema: {
      response: {
        200: {
          description: 'Description and all status-code based properties are working',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  image: { type: 'string' },
                  address: { type: 'string' }
                }
              }
            },
            'application/vnd.v1+json': {
              schema: {
                type: 'object',
                properties: {
                  fullName: { type: 'string' },
                  phone: { type: 'string' }
                }
              }
            }
          }
        },
        '4xx': {
          type: 'object',
          properties: {
            name: { type: 'string' }
          }
        },
        300: {
          type: 'object',
          properties: {
            age: { type: 'number' }
          }
        }
      }
    }
  }
  fastify.get('/', opt, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)
  const definedPath = api.paths['/'].get
  expect(definedPath.responses['200'].description).toEqual('Description and all status-code based properties are working')
  expect(definedPath.responses['200'].content).toEqual({
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' }, image: { type: 'string' }, address: { type: 'string' }
        }
      }
    },
    'application/vnd.v1+json': {
      schema: {
        type: 'object',
        properties: {
          fullName: { type: 'string' }, phone: { type: 'string' }
        }
      }
    }
  })
  expect(definedPath.responses['4XX'].description).toEqual('Default Response')
  expect(JSON.parse(JSON.stringify(definedPath.responses['4XX'].content))).toEqual({
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' }
        }
      }
    }
  })
  expect(JSON.parse(JSON.stringify(definedPath.responses[300].content))).toEqual({
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          age: { type: 'number' }
        }
      }
    }
  })
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
  await fastify.register(fastifySwagger, {
    openapi: true
  })
  fastify.get('/', opt, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].get
  expect(definedPath.responses['204'].description).toEqual('No Content')
  expect(definedPath.responses['204'].content).toBe(undefined)
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
  await fastify.register(fastifySwagger, {
    openapi: true
  })
  fastify.get('/', opt, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].get

  expect(definedPath.responses['204'].description).toEqual('No Content')
  expect(definedPath.responses['204'].content).toBe(undefined)

  expect(definedPath.responses['503'].description).toEqual('Service Unavailable')
  expect(definedPath.responses['503'].content).toBe(undefined)
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
            },
            'X-DESCRIPTION': {
              description: 'Foo',
              type: 'string'
            }
          }
        }
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger, {
    openapi: true
  })
  fastify.get('/', opt, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].get
  expect(definedPath.responses['200'].headers['X-WORLD']).toEqual({
    schema: {
      type: 'string'
    }
  })
  expect(definedPath.responses['200'].headers['X-DESCRIPTION']).toEqual({
    description: 'Foo',
    schema: {
      type: 'string'
    }
  })
  expect(definedPath.responses['200'].content['application/json'].schema.headers).toBe(undefined)
})

describe('response: description and x-response-description', () => {
const description = 'description - always that of response body, sometimes also that of response as a whole'
const responseDescription = 'description only for the response as a whole'
test('description without x-response-description doubles as response description', async () => {
    // Given a /description endpoint with only a |description| field in its response schema
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
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
    /** @type {import('openapi-types').OpenAPIV3.ResponseObject} */
    const responseObject = api.paths['/description'].get.responses['200']
    expect(responseObject).toBeTruthy()
    expect(responseObject.description).toBe(description)

    const schemaObject = responseObject.content['application/json'].schema
    expect(schemaObject).toBeTruthy()
    expect(schemaObject.description).toBe(description)
  })
test('description alongside x-response-description only describes response body', async () => {
    // Given a /x-response-description endpoint that also has a |x-response-description| field in its response schema
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
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

    const schemaObject = responseObject.content['application/json'].schema
    expect(schemaObject).toBeTruthy()
    expect(schemaObject.description).toBe(description)
    expect(schemaObject.responseDescription).toBe(undefined)
  })
test('retrieve the response description from its given $ref schema', async () => {
    // Given a /description endpoint that also has a |description| field in its response referenced schema
    const fastify = Fastify()
    fastify.addSchema({
      $id: 'my-ref',
      description,
      type: 'string'
    })

    await fastify.register(fastifySwagger, openapiOption)
    fastify.get('/description', {
      schema: {
        response: {
          200: {
            $ref: 'my-ref#'
          }
        }
      }
    }, () => {})
    await fastify.ready()

    // When the Swagger schema is generated
    const swaggerObject = fastify.swagger()
    const api = await Swagger.validate(swaggerObject)

    const responseObject = api.paths['/description'].get.responses['200']
    expect(responseObject).toBeTruthy()
    expect(responseObject.description).toBe(description)

    const schemaObject = responseObject.content['application/json'].schema
    expect(schemaObject).toBeTruthy()
    expect(schemaObject.description).toBe(description)
    expect(schemaObject.responseDescription).toBe(undefined)
  })
})

test('support default=null', async () => {
  const opt = {
    schema: {
      response: {
        '2XX': {
          type: 'string',
          nullable: true,
          default: null
        }
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger, {
    openapi: true
  })
  fastify.get('/', opt, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].get
  expect(definedPath.responses['2XX'].default).toEqual(undefined)
})

test('support global schema reference', async () => {
  const schema = {
    type: 'object',
    properties: {
      hello: { type: 'string' }
    },
    required: ['hello']
  }
  const fastify = Fastify()
  await fastify.register(fastifySwagger, { openapi: true })
  fastify.addSchema({ ...schema, $id: 'requiredUniqueSchema' })
  fastify.get('/', { schema: { query: { $ref: 'requiredUniqueSchema' } } }, () => {})
  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)
  expect(JSON.parse(JSON.stringify(api.components.schemas['def-0']))).toEqual({ ...schema, title: 'requiredUniqueSchema' })
})

test('support global schema reference with title', async () => {
  const schema = {
    title: 'schema view title',
    type: 'object',
    properties: {
      hello: { type: 'string' }
    },
    required: ['hello']
  }
  const fastify = Fastify()
  await fastify.register(fastifySwagger, { openapi: true })
  fastify.addSchema({ ...schema, $id: 'requiredUniqueSchema' })
  fastify.get('/', { schema: { query: { $ref: 'requiredUniqueSchema' } } }, () => {})
  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)
  expect(JSON.parse(JSON.stringify(api.components.schemas['def-0']))).toEqual(schema)
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
  await fastify.register(fastifySwagger, {
    openapi: true
  })
  fastify.get('/', opt, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].get

  expect(JSON.parse(JSON.stringify(definedPath.responses.default))).toEqual({
    description: 'Default Response',
    content: {
      'application/json': {
        schema: {
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
  await fastify.register(fastifySwagger, {
    openapi: true
  })
  fastify.get('/', opt, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].get
  expect(definedPath.responses['200'].description).toEqual('Default Response')
})

test('support "patternProperties" parameter', async () => {
  const opt = {
    schema: {
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
  await fastify.register(fastifySwagger, {
    openapi: true
  })
  fastify.get('/', opt, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].get

  expect(JSON.parse(JSON.stringify(definedPath.responses[200]))).toEqual({
    description: 'Expected Response',
    content: {
      'application/json': {
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
      }
    }
  })
})

test('properly support "patternProperties" parameter', async () => {
  const opt = {
    schema: {
      response: {
        200: {
          description: 'Expected Response',
          type: 'object',
          properties: {
            foo: {
              type: 'object',
              patternProperties: {
                '^[a-z]{2,3}-[a-zA-Z]{2}$': {
                  type: 'object',
                  properties: {
                    foo: { type: 'number' }
                  }
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
  await fastify.register(fastifySwagger, {
    openapi: true
  })
  fastify.get('/', opt, () => { })

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].get

  expect(JSON.parse(JSON.stringify(definedPath.responses[200]))).toEqual({
    description: 'Expected Response',
    content: {
      'application/json': {
        schema: {
          description: 'Expected Response',
          type: 'object',
          properties: {
            foo: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                properties: {
                  foo: { type: 'number' }
                }
              }
            }
          }
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
              constantPropZero: { const: 0 },
              constantPropNull: { const: null },
              constantPropFalse: { const: false },
              constantPropEmptyString: { const: '' }
            }
          }
        }
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
    },
    convertConstToEnum: false
  })
  fastify.post('/', opt, () => {})
  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].post
  expect(JSON.parse(JSON.stringify(definedPath.requestBody))).toEqual({
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            obj: {
              type: 'object',
              properties: {
                constantProp: {
                  const: 'my-const'
                },
                constantPropZero: {
                  const: 0
                },
                constantPropNull: {
                  const: null
                },
                constantPropFalse: {
                  const: false
                },
                constantPropEmptyString: {
                  const: ''
                }
              }
            }
          }
        }
      }
    }
  })
})

test('convert "const" to "enum"', async () => {
  const opt = {
    schema: {
      body: {
        type: 'object',
        properties: {
          obj: {
            type: 'object',
            properties: {
              constantProp: { const: 'my-const' },
              constantPropZero: { const: 0 },
              constantPropNull: { const: null },
              constantPropFalse: { const: false },
              constantPropEmptyString: { const: '' }
            }
          }
        }
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger, {
    openapi: true,
    // Default is true
    // convertConstToEnum: true
  })
  fastify.post('/', opt, () => {})
  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].post
  expect(JSON.parse(JSON.stringify(definedPath.requestBody))).toEqual({
    required: true,
    content: {
      'application/json': {
        schema: {
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
        }
      }
    }
  })
})

test('support object properties named "const"', async () => {
  const opt = {
    schema: {
      body: {
        type: 'object',
        properties: {
          obj: {
            type: 'object',
            properties: {
              const: { type: 'string' }
            },
            required: ['const']
          }
        }
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger, {
    openapi: true
  })
  fastify.post('/', opt, () => { })
  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].post
  expect(JSON.parse(JSON.stringify(definedPath.requestBody))).toEqual({
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            obj: {
              type: 'object',
              properties: {
                const: {
                  type: 'string'
                }
              },
              required: ['const']
            }
          }
        }
      }
    }
  })
})

test('support object properties with special names', async () => {
  const opt = {
    schema: {
      body: {
        type: 'object',
        properties: {
          obj: {
            type: 'object',
            properties: {
              properties: {
                type: 'string'
              },
              patternProperties: {
                type: 'string'
              },
              additionalProperties: {
                type: 'number'
              }
            },
            required: ['const', 'patternProperties', 'additionalProperties']
          }
        }
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger, {
    openapi: true
  })
  fastify.post('/', opt, () => { })
  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].post
  expect(JSON.parse(JSON.stringify(definedPath.requestBody))).toEqual({
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            obj: {
              type: 'object',
              properties: {
                properties: {
                  type: 'string'
                },
                patternProperties: {
                  type: 'string'
                },
                additionalProperties: {
                  type: 'number'
                }
              },
              required: ['const', 'patternProperties', 'additionalProperties']
            }
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
  await fastify.register(fastifySwagger, {
    openapi: true
  })
  fastify.post('/', opt, () => { })
  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].post
  expect(JSON.parse(JSON.stringify(definedPath.requestBody))).toEqual({
    required: true,
    description: 'Body description',
    content: {
      'application/json': {
        schema: {
          description: 'Body description',
          type: 'object',
          properties: {
            foo: {
              type: 'number'
            }
          }
        }
      }
    }
  })
})

test('support query serialization params', async () => {
  const opt = {
    schema: {
      querystring: {
        style: 'deepObject',
        explode: false,
        type: 'object',
        allowReserved: true,
        properties: {
          obj: {
            type: 'string'
          }
        }
      }
    }
  }

  const fastify = Fastify({
    ajv: {
      plugins: [
        function (ajv) {
          ajv.addKeyword({ keyword: 'style' })
          ajv.addKeyword({ keyword: 'explode' })
          ajv.addKeyword({ keyword: 'allowReserved' })
        }
      ]
    }
  })
  await fastify.register(fastifySwagger, {
    openapi: true
  })
  fastify.get('/', opt, () => {})
  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)
  expect(api.paths['/'].get.parameters[0].style).toBe('deepObject')
  expect(api.paths['/'].get.parameters[0].explode).toBe(false)
  expect(api.paths['/'].get.parameters[0].allowReserved).toBe(true)
})

test('add default properties for url params when missing schema', async () => {
  const opt = {}

  const fastify = Fastify()
  await fastify.register(fastifySwagger, {
    openapi: true
  })
  fastify.get('/:userId', opt, () => { })
  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/{userId}'].get

  expect(definedPath.parameters[0]).toEqual({
    in: 'path',
    name: 'userId',
    required: true,
    schema: {
      type: 'string'
    }
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
  await fastify.register(fastifySwagger, {
    openapi: true
  })
  fastify.post('/:userId', opt, () => { })
  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/{userId}'].post

  expect(definedPath.parameters[0]).toEqual({
    in: 'path',
    name: 'userId',
    required: true,
    schema: {
      type: 'string'
    }
  })
  expect(definedPath.requestBody.content['application/json'].schema.properties).toEqual({
    bio: {
      type: 'string'
    }
  })
})

test('support custom transforms which returns $ref in the response', async () => {
  const customObject = {}
  const opt = {
    schema: {
      response: {
        200: customObject
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger, {
    openapi: true,
    transform: ({ schema, ...rest }) => {
      schema.response['200'] = {
        $ref: '#/components/schemas/CustomObject'
      }
      return {
        schema,
        ...rest
      }
    },
    transformObject: ({ openapiObject }) => {
      openapiObject.components.schemas.CustomObject = {
        type: 'object',
        properties: {
          hello: {
            type: 'string'
          }
        }
      }
      return openapiObject
    }
  })
  fastify.post('/', opt, () => { })
  await fastify.ready()

  const swaggerObject = fastify.swagger()

  const swaggerPath = swaggerObject.paths['/'].post
  expect(JSON.parse(JSON.stringify(swaggerPath.responses['200'].content['application/json'].schema))).toEqual({
    $ref: '#/components/schemas/CustomObject'
  })

  // validate seems to mutate the swaggerPath object
  const api = await Swagger.validate(swaggerObject)
  const definedPath = api.paths['/'].post
  expect(definedPath.responses['200'].content['application/json'].schema).toEqual({
    type: 'object',
    properties: {
      hello: {
        type: 'string'
      }
    }
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
  await fastify.register(fastifySwagger, {
    openapi: true
  })
  fastify.post('/:userId', opt, () => { })
  await fastify.ready()

  const swaggerObject = fastify.swagger()

  const definedPath = swaggerObject.paths['/{userId}'].post

  expect(definedPath.parameters[0]).toEqual({
    in: 'path',
    name: 'id',
    required: true,
    schema: {
      type: 'string'
    }
  })
  expect(definedPath.requestBody.content['application/json'].schema.properties).toEqual({
    bio: {
      type: 'string'
    }
  })
})

test('support multiple content types as request', async () => {
  const opt = {
    schema: {
      body: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                jsonProperty: {
                  type: 'string'
                }
              }
            }
          },
          'application/xml': {
            schema: {
              type: 'object',
              properties: {
                xmlProperty: {
                  type: 'string'
                }
              }
            }
          }
        }
      }
    }
  }

  const fastify = Fastify()
  await fastify.register(fastifySwagger, {
    openapi: true
  })
  fastify.post('/', opt, () => { })
  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const api = await Swagger.validate(swaggerObject)

  const definedPath = api.paths['/'].post
  expect(definedPath.requestBody).toEqual({
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            jsonProperty: {
              type: 'string'
            }
          }
        }
      },
      'application/xml': {
        schema: {
          type: 'object',
          properties: {
            xmlProperty: {
              type: 'string'
            }
          }
        }
      }
    }
  })
})

describe('support callbacks', () => {
test('includes callbacks in openapiObject', async () => {
    const fastify = Fastify()

    await fastify.register(fastifySwagger, openapiOption)
    fastify.register(async (instance) => {
      instance.post(
        '/subscribe',
        {
          schema: {
            body: {
              $id: 'Subscription',
              type: 'object',
              properties: {
                callbackUrl: {
                  type: 'string',
                  examples: ['https://example.com']
                }
              }
            },
            response: {
              200: {
                $id: 'Subscription',
                type: 'object',
                properties: {
                  callbackUrl: {
                    type: 'string',
                    examples: ['https://example.com']
                  }
                }
              }
            },
            callbacks: {
              myEvent: {
                '{$request.body#/callbackUrl}': {
                  post: {
                    requestBody: {
                      content: {
                        'application/json': {
                          schema: {
                            type: 'object',
                            properties: {
                              message: {
                                type: 'string',
                                example: 'Some event happened'
                              }
                            },
                            required: ['message']
                          }
                        }
                      }
                    },
                    responses: {
                      200: {
                        description: 'Success'
                      }
                    }
                  }
                }
              },
              myOtherEvent: {
                '{$request.body#/callbackUrl}': {
                  post: {
                    responses: {
                      200: {
                        description: 'Success'
                      },
                      500: {
                        description: 'Error'
                      }
                    }
                  }
                }
              }
            }
          }
        },
        () => {}
      )
    })

    await fastify.ready()

    const openapiObject = fastify.swagger()

    expect(typeof openapiObject).toBe('object')
    expect(typeof openapiObject.paths['/subscribe'].post.callbacks).toBe('object')

    const definedPath = openapiObject.paths['/subscribe'].post.callbacks

    expect(definedPath.myEvent['{$request.body#/callbackUrl}'].post.requestBody
        .content['application/json'].schema.properties).toEqual({
        message: {
          type: 'string',
          example: 'Some event happened'
        }
      })

    expect(definedPath.myOtherEvent['{$request.body#/callbackUrl}'].post.requestBody).toEqual(undefined)

    await Swagger.validate(openapiObject)
  })
test('sets callback response default if not included', async () => {
    const fastify = Fastify()

    await fastify.register(fastifySwagger, openapiOption)
    fastify.register(async (instance) => {
      instance.post(
        '/subscribe',
        {
          schema: {
            body: {
              $id: 'Subscription',
              type: 'object',
              properties: {
                callbackUrl: {
                  type: 'string',
                  examples: ['https://example.com']
                }
              }
            },
            response: {
              200: {
                $id: 'Subscription',
                type: 'object',
                properties: {
                  callbackUrl: {
                    type: 'string',
                    examples: ['https://example.com']
                  }
                }
              }
            },
            callbacks: {
              myEvent: {
                '{$request.body#/callbackUrl}': {
                  post: {
                    requestBody: {
                      content: {
                        'application/json': {
                          schema: {
                            type: 'object',
                            properties: {
                              message: {
                                type: 'string',
                                example: 'Some event happened'
                              }
                            },
                            required: ['message']
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        () => {}
      )
    })

    await fastify.ready()

    const openapiObject = fastify.swagger()

    expect(typeof openapiObject).toBe('object')
    expect(typeof openapiObject.paths['/subscribe'].post.callbacks).toBe('object')

    const definedPath = openapiObject.paths['/subscribe'].post

    expect(definedPath.callbacks.myEvent['{$request.body#/callbackUrl}'].post
        .responses['2XX'].description).toBe('Default Response')

    await Swagger.validate(openapiObject)
  })
test('skips callbacks if event is badly formatted', async () => {
    const fastify = Fastify()

    await fastify.register(fastifySwagger, openapiOption)
    fastify.register(async (instance) => {
      instance.post(
        '/subscribe',
        {
          schema: {
            body: {
              $id: 'Subscription',
              type: 'object',
              properties: {
                callbackUrl: {
                  type: 'string',
                  examples: ['https://example.com']
                }
              }
            },
            response: {
              200: {
                $id: 'Subscription',
                type: 'object',
                properties: {
                  callbackUrl: {
                    type: 'string',
                    examples: ['https://example.com']
                  }
                }
              }
            },
            callbacks: {
              myEvent: null
            }
          }
        },
        () => {}
      )
    })

    await fastify.ready()

    const openapiObject = fastify.swagger()

    expect(typeof openapiObject).toBe('object')
    expect(openapiObject.paths['/subscribe'].post.callbacks).toEqual({})

    await Swagger.validate(openapiObject)
  })
test('skips callback if callbackUrl is badly formatted', async () => {
    const fastify = Fastify()

    await fastify.register(fastifySwagger, openapiOption)
    fastify.register(async (instance) => {
      instance.post(
        '/subscribe',
        {
          schema: {
            body: {
              $id: 'Subscription',
              type: 'object',
              properties: {
                callbackUrl: {
                  type: 'string',
                  examples: ['https://example.com']
                }
              }
            },
            response: {
              200: {
                $id: 'Subscription',
                type: 'object',
                properties: {
                  callbackUrl: {
                    type: 'string',
                    examples: ['https://example.com']
                  }
                }
              }
            },
            callbacks: {
              myEvent: {
                '{$request.body#/callbackUrl}': {
                  post: {
                    requestBody: {
                      content: {
                        'application/json': {
                          schema: {
                            type: 'object',
                            properties: {
                              message: {
                                type: 'string',
                                example: 'Some event happened'
                              }
                            },
                            required: ['message']
                          }
                        }
                      }
                    },
                    responses: {
                      200: {
                        description: 'Success'
                      }
                    }
                  }
                }
              },
              myOtherEvent: {
                '{$request.body#/callbackUrl}': null
              }
            }
          }
        },
        () => {}
      )
    })

    await fastify.ready()

    const openapiObject = fastify.swagger()

    expect(typeof openapiObject).toBe('object')
    expect(typeof openapiObject.paths['/subscribe'].post.callbacks).toBe('object')
    expect(Object.keys(openapiObject.paths['/subscribe'].post.callbacks).includes('myEvent')).toBeTruthy()

    const definedPath = openapiObject.paths['/subscribe'].post.callbacks

    expect(definedPath.myEvent['{$request.body#/callbackUrl}'].post.requestBody
        .content['application/json'].schema.properties).toEqual({
        message: {
          type: 'string',
          example: 'Some event happened'
        }
      })

    await Swagger.validate(openapiObject)
  })
test('skips callback if method is badly formatted', async () => {
    const fastify = Fastify()

    await fastify.register(fastifySwagger, openapiOption)
    fastify.register(async (instance) => {
      instance.post(
        '/subscribe',
        {
          schema: {
            body: {
              $id: 'Subscription',
              type: 'object',
              properties: {
                callbackUrl: {
                  type: 'string',
                  examples: ['https://example.com']
                }
              }
            },
            response: {
              200: {
                $id: 'Subscription',
                type: 'object',
                properties: {
                  callbackUrl: {
                    type: 'string',
                    examples: ['https://example.com']
                  }
                }
              }
            },
            callbacks: {
              myEvent: {
                '{$request.body#/callbackUrl}': {
                  post: {
                    requestBody: {
                      content: {
                        'application/json': {
                          schema: {
                            type: 'object',
                            properties: {
                              message: {
                                type: 'string',
                                example: 'Some event happened'
                              }
                            },
                            required: ['message']
                          }
                        }
                      }
                    },
                    responses: {
                      200: {
                        description: 'Success'
                      }
                    }
                  }
                }
              },
              myOtherEvent: {
                '{$request.body#/callbackUrl}': {
                  post: null
                }
              }
            }
          }
        },
        () => {}
      )
    })

    await fastify.ready()

    const openapiObject = fastify.swagger()

    expect(typeof openapiObject).toBe('object')
    expect(typeof openapiObject.paths['/subscribe'].post.callbacks).toBe('object')
    expect(Object.keys(openapiObject.paths['/subscribe'].post.callbacks).includes('myEvent')).toBeTruthy()

    const definedPath = openapiObject.paths['/subscribe'].post.callbacks

    expect(definedPath.myEvent['{$request.body#/callbackUrl}'].post.requestBody
        .content['application/json'].schema.properties).toEqual({
        message: {
          type: 'string',
          example: 'Some event happened'
        }
      })

    await Swagger.validate(openapiObject)
  })
test('supports multiple callbackUrls and httpMethods in openapiObject', async () => {
    const fastify = Fastify()

    await fastify.register(fastifySwagger, openapiOption)
    fastify.register(async (instance) => {
      instance.post(
        '/subscribe',
        {
          schema: {
            body: {
              $id: 'Subscription',
              type: 'object',
              properties: {
                callbackUrl: {
                  type: 'string',
                  examples: ['https://example.com']
                }
              }
            },
            response: {
              200: {
                $id: 'Subscription',
                type: 'object',
                properties: {
                  callbackUrl: {
                    type: 'string',
                    examples: ['https://example.com']
                  }
                }
              }
            },
            callbacks: {
              myEvent: {
                '{$request.body#/callbackUrl}': {
                  post: {
                    requestBody: {
                      content: {
                        'application/json': {
                          schema: {
                            type: 'object',
                            properties: {
                              message: {
                                type: 'string',
                                example: 'Some event happened'
                              }
                            },
                            required: ['message']
                          }
                        }
                      }
                    },
                    responses: {
                      200: {
                        description: 'Success'
                      }
                    }
                  }
                },
                '{$request.body#/anotherUrl}': {
                  post: {
                    requestBody: {
                      content: {
                        'application/json': {
                          schema: {
                            type: 'object',
                            properties: {
                              message: {
                                type: 'string',
                                example: 'Another event happened'
                              }
                            },
                            required: ['message']
                          }
                        }
                      }
                    },
                    responses: {
                      200: {
                        description: 'Success'
                      }
                    }
                  },
                  put: {
                    requestBody: {
                      content: {
                        'application/json': {
                          schema: {
                            type: 'object',
                            properties: {
                              message: {
                                type: 'string',
                                example: 'PUT event happened'
                              }
                            },
                            required: ['message']
                          }
                        }
                      }
                    },
                    responses: {
                      200: {
                        description: 'Success'
                      }
                    }
                  }
                }
              },
              myOtherEvent: {
                '{$request.body#/callbackUrl}': {
                  post: {
                    responses: {
                      200: {
                        description: 'Success'
                      },
                      500: {
                        description: 'Error'
                      }
                    }
                  }
                }
              }
            }
          }
        },
        () => {}
      )
    })

    await fastify.ready()

    const openapiObject = fastify.swagger()

    expect(typeof openapiObject).toBe('object')
    expect(typeof openapiObject.paths['/subscribe'].post.callbacks).toBe('object')

    const definedPath = openapiObject.paths['/subscribe'].post.callbacks

    // First Event->First URL->First Method
    expect(definedPath.myEvent['{$request.body#/callbackUrl}'].post.requestBody
        .content['application/json'].schema.properties).toEqual({
        message: {
          type: 'string',
          example: 'Some event happened'
        }
      })

    // First Event->Second URL->First Method
    expect(definedPath.myEvent['{$request.body#/anotherUrl}'].post.requestBody
        .content['application/json'].schema.properties).toEqual({
        message: {
          type: 'string',
          example: 'Another event happened'
        }
      })

    // First Event->Second URL->Second Method
    expect(definedPath.myEvent['{$request.body#/anotherUrl}'].put.requestBody
        .content['application/json'].schema.properties).toEqual({
        message: {
          type: 'string',
          example: 'PUT event happened'
        }
      })

    // Second Event
    expect(definedPath.myOtherEvent['{$request.body#/callbackUrl}'].post.requestBody).toEqual(undefined)

    await Swagger.validate(openapiObject)
  })
test('should preserve original headers schema across multiple responses', async () => {
    const headersSchema = {
      'X-DESCRIPTION': {
        type: 'string',
        description: 'Foo',
      },
    }

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
            headers: headersSchema
          },
          201: {
            type: 'object',
            properties: {
              hello: {
                type: 'string'
              }
            },
            headers: headersSchema
          }
        }
      }
    }

    const fastify = Fastify()
    await fastify.register(fastifySwagger, {
      openapi: true
    })
    fastify.get('/', opt, () => {})

    await fastify.ready()

    const swaggerObject = fastify.swagger()
    const api = await Swagger.validate(swaggerObject)

    const definedPath = api.paths['/'].get

    expect(definedPath.responses['200'].headers['X-DESCRIPTION']).toEqual({
      description: 'Foo',
      schema: {
        type: 'string'
      }
    })
    expect(definedPath.responses['200'].content['application/json'].schema.headers).toBe(undefined)
    expect(definedPath.responses['201'].headers['X-DESCRIPTION']).toEqual({
      description: 'Foo',
      schema: {
        type: 'string'
      }
    })
    expect(definedPath.responses['201'].content['application/json'].schema.headers).toBe(undefined)
  })
})

// OpenAPI 3.0.3: `nullable` only applies to the `type` defined in the same
// Schema Object, so the schema accepting nothing but `null` is a nullable type
// restricted to `enum: [null]`.
const nullSchema = { type: 'object', nullable: true, enum: [null] }

test('openapi 3.0: `type: null` is converted to `nullable: true`', async () => {
  const cases = [
    {
      name: 'anyOf with null member',
      input: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      expected: { type: 'string', nullable: true }
    },
    {
      name: 'oneOf with null member keeps sibling keywords',
      input: { description: 'maybe', oneOf: [{ type: 'string' }, { type: 'null' }] },
      expected: { description: 'maybe', type: 'string', nullable: true }
    },
    {
      name: 'anyOf with several non-null members',
      input: { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }] },
      expected: { anyOf: [{ type: 'string' }, { type: 'number' }, nullSchema] }
    },
    {
      name: 'anyOf with null member and a member already marked nullable (#594)',
      input: { anyOf: [{ type: 'null' }, { type: 'string', format: 'date-time', nullable: true }] },
      expected: { type: 'string', format: 'date-time', nullable: true }
    },
    {
      name: 'multiple types without null (#861)',
      input: { description: 'id', type: ['string', 'number'] },
      expected: { description: 'id', anyOf: [{ type: 'string' }, { type: 'number' }] }
    },
    {
      name: 'single type in the array form',
      input: { type: ['string'] },
      expected: { type: 'string' }
    },
    {
      name: 'anyOf with a $ref member is not collapsed',
      input: { anyOf: [{ $ref: 'Item#' }, { type: 'null' }] },
      expected: { anyOf: [{ $ref: '#/components/schemas/def-0' }, nullSchema] }
    },
    {
      name: 'type array with null',
      input: { type: ['string', 'null'] },
      expected: { type: 'string', nullable: true }
    },
    {
      name: 'type array with several types and null',
      input: { type: ['string', 'number', 'null'] },
      expected: { anyOf: [{ type: 'string' }, { type: 'number' }, nullSchema] }
    },
    {
      name: 'type array with only null',
      input: { type: ['null'] },
      expected: nullSchema
    },
    {
      name: 'type null',
      input: { type: 'null' },
      expected: nullSchema
    },
    {
      name: 'nested in array items',
      input: { type: 'array', items: { type: ['integer', 'null'] } },
      expected: { type: 'array', items: { type: 'integer', nullable: true } }
    }
  ]

  expect.assertions(cases.length * 3)

  for (const { name, input, expected } of cases) {
    const fastify = Fastify()
    fastify.addSchema({ $id: 'Item', type: 'object', properties: { id: { type: 'integer' } } })
    await fastify.register(fastifySwagger, { openapi: { openapi: '3.0.3' } })

    fastify.post('/', {
      schema: {
        body: { type: 'object', properties: { value: input } },
        response: { 200: { type: 'object', properties: { value: input } } }
      }
    }, () => ({}))

    await fastify.ready()

    const openapiObject = fastify.swagger()
    await Swagger.validate(structuredClone(openapiObject))

    const body = openapiObject.paths['/'].post.requestBody.content['application/json'].schema.properties.value
    const response = openapiObject.paths['/'].post.responses['200'].content['application/json'].schema.properties.value

    expect(true).toBeTruthy()
    expect(body).toEqual(expected)
    expect(response).toEqual(expected)
  }
})

test('openapi 3.0 is the default: `type: null` is converted when no version is set', async () => {
  const options = [
    { openapi: true },
    { openapi: {} }
  ]

  expect.assertions(options.length * 3)

  for (const option of options) {
    const fastify = Fastify()
    await fastify.register(fastifySwagger, option)

    fastify.post('/', {
      schema: { response: { 200: { type: 'object', properties: { value: { type: ['string', 'null'] } } } } }
    }, () => ({}))

    await fastify.ready()

    const openapiObject = fastify.swagger()
    await Swagger.validate(structuredClone(openapiObject))

    const value = openapiObject.paths['/'].post.responses['200'].content['application/json'].schema.properties.value

    expect(openapiObject.openapi).toBe('3.0.3')
    expect(true).toBeTruthy()
    expect(value).toEqual({ type: 'string', nullable: true })
  }
})

test('openapi 3.1: `type: null` is kept as is', async () => {
  const cases = [
    { anyOf: [{ type: 'string' }, { type: 'null' }] },
    { type: ['string', 'null'] },
    { type: 'null' }
  ]

  expect.assertions(cases.length * 2)

  for (const input of cases) {
    const fastify = Fastify()
    await fastify.register(fastifySwagger, { openapi: { openapi: '3.1.0' } })

    fastify.post('/', {
      schema: { response: { 200: { type: 'object', properties: { value: input } } } }
    }, () => ({}))

    await fastify.ready()

    const openapiObject = fastify.swagger()
    await Swagger.validate(structuredClone(openapiObject))

    const value = openapiObject.paths['/'].post.responses['200'].content['application/json'].schema.properties.value

    expect(true).toBeTruthy()
    expect('nullable' in value).toBe(false)
  }
})

test('openapi 3.0: `type: null` conversion does not lose sibling keywords', async () => {
  const cases = [
    {
      name: 'member is not collapsed when it would overwrite keywords of the parent',
      input: {
        type: 'object',
        properties: { a: { type: 'string' } },
        anyOf: [{ properties: { b: { type: 'string' } }, required: ['b'] }, { type: 'null' }]
      },
      expected: {
        type: 'object',
        properties: { a: { type: 'string' } },
        anyOf: [{ properties: { b: { type: 'string' } }, required: ['b'] }, nullSchema]
      }
    },
    {
      name: 'description of the parent is not replaced by the one of the member',
      input: { description: 'outer', anyOf: [{ type: 'string', description: 'inner' }, { type: 'null' }] },
      expected: { description: 'outer', anyOf: [{ type: 'string', description: 'inner' }, nullSchema] }
    },
    {
      name: 'member with `nullable: false` cannot undo the conversion',
      input: { anyOf: [{ type: 'string', nullable: false }, { type: 'null' }] },
      expected: { type: 'string', nullable: true }
    },
    {
      name: 'type array does not overwrite an existing anyOf',
      input: { type: ['string', 'number', 'null'], anyOf: [{ minLength: 1 }, { minimum: 1 }] },
      expected: {
        anyOf: [{ minLength: 1 }, { minimum: 1 }],
        allOf: [{ anyOf: [{ type: 'string' }, { type: 'number' }, nullSchema] }]
      }
    },
    {
      name: 'type array is appended to an existing allOf',
      input: { type: ['string', 'number', 'null'], allOf: [{ description: 'first' }], anyOf: [{ minLength: 1 }, { minimum: 1 }] },
      expected: {
        anyOf: [{ minLength: 1 }, { minimum: 1 }],
        allOf: [{ description: 'first' }, { anyOf: [{ type: 'string' }, { type: 'number' }, nullSchema] }]
      }
    },
    {
      name: 'anyOf and oneOf both with a null member',
      input: { anyOf: [{ type: 'string' }, { type: 'null' }], oneOf: [{ type: 'number' }, { type: 'null' }] },
      expected: { type: 'string', nullable: true, oneOf: [{ type: 'number' }, nullSchema] }
    },
    {
      name: 'null member with annotations is removed',
      input: { anyOf: [{ type: 'string' }, { type: 'null', title: 'Nothing', description: 'no value', 'x-internal': true }] },
      expected: { type: 'string', nullable: true }
    },
    {
      name: 'anyOf with only null members',
      input: { anyOf: [{ type: 'null' }] },
      expected: { anyOf: [nullSchema] }
    },
    {
      name: 'member without a type is not collapsed, `nullable` would have no effect',
      input: { anyOf: [{ enum: ['a', 'b'] }, { type: 'null' }] },
      expected: { anyOf: [{ enum: ['a', 'b'] }, nullSchema] }
    },
    {
      name: 'null member keeps its annotations when it is not collapsed',
      input: { oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'null', title: 'Nothing' }] },
      expected: { oneOf: [{ type: 'string' }, { type: 'number' }, { ...nullSchema, title: 'Nothing' }] }
    }
  ]

  expect.assertions(cases.length * 2)

  for (const { name, input, expected } of cases) {
    // `x-` extensions are unknown keywords for Ajv in strict mode
    const fastify = Fastify({ ajv: { customOptions: { strictSchema: false } } })
    await fastify.register(fastifySwagger, { openapi: { openapi: '3.0.3' } })

    fastify.post('/', {
      schema: { body: { type: 'object', properties: { value: input } } }
    }, () => ({}))

    await fastify.ready()

    const openapiObject = fastify.swagger()
    await Swagger.validate(structuredClone(openapiObject))

    const body = openapiObject.paths['/'].post.requestBody.content['application/json'].schema.properties.value

    expect(true).toBeTruthy()
    expect(body).toEqual(expected)
  }
})

test('openapi 3.0: `type: null` is converted in shared schemas', async () => {
  expect.assertions(3)

  const fastify = Fastify()
  fastify.addSchema({
    $id: 'Item',
    type: 'object',
    properties: {
      name: { type: ['string', 'null'] },
      deletedAt: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] }
    }
  })
  await fastify.register(fastifySwagger, {
    openapi: {
      openapi: '3.0.3',
      components: {
        schemas: {
          Custom: { type: 'object', properties: { note: { type: ['string', 'null'] } } }
        }
      }
    }
  })

  fastify.get('/', { schema: { response: { 200: { $ref: 'Item#' } } } }, () => ({}))

  await fastify.ready()

  const openapiObject = fastify.swagger()
  await Swagger.validate(structuredClone(openapiObject))
  expect(true).toBeTruthy()

  expect(openapiObject.components.schemas['def-0'].properties).toEqual({
    name: { type: 'string', nullable: true },
    deletedAt: { type: 'string', format: 'date-time', nullable: true }
  })
  expect(openapiObject.components.schemas.Custom.properties).toEqual({
    note: { type: 'string', nullable: true }
  })
})

test('openapi 3.0: `type: null` is converted in parameters', async () => {
  expect.assertions(4)

  const fastify = Fastify()
  await fastify.register(fastifySwagger, { openapi: { openapi: '3.0.3' } })

  const nullableString = { type: ['string', 'null'] }
  fastify.get('/:id', {
    schema: {
      params: { type: 'object', properties: { id: nullableString } },
      querystring: { type: 'object', properties: { filter: { anyOf: [{ type: 'string' }, { type: 'null' }] } } },
      headers: { type: 'object', properties: { 'x-trace': nullableString } }
    }
  }, () => ({}))

  await fastify.ready()

  const openapiObject = fastify.swagger()
  await Swagger.validate(structuredClone(openapiObject))
  expect(true).toBeTruthy()

  const parameters = openapiObject.paths['/{id}'].get.parameters
  for (const [location, name] of [['path', 'id'], ['query', 'filter'], ['header', 'x-trace']]) {
    const parameter = parameters.find(p => p.in === location && p.name === name)
    expect(parameter.schema).toEqual({ type: 'string', nullable: true })
  }
})

test('openapi 3.0: `type: null` conversion does not mutate the route schema', async () => {
  expect.assertions(2)

  const createValue = () => ({
    type: 'object',
    properties: {
      union: { description: 'maybe', anyOf: [{ type: 'string' }, { type: 'null' }] },
      list: { type: 'array', items: { type: ['integer', 'null'] } },
      several: { type: ['string', 'number', 'null'] }
    }
  })
  const body = createValue()
  const response = createValue()

  const fastify = Fastify()
  await fastify.register(fastifySwagger, { openapi: { openapi: '3.0.3' } })

  fastify.post('/', { schema: { body, response: { 200: response } } }, () => ({}))

  await fastify.ready()

  // Snapshot taken once Fastify has compiled the schemas: fast-json-stringify
  // reorders `type` arrays in place, which is unrelated to the conversion.
  const bodyBefore = structuredClone(body)
  const responseBefore = structuredClone(response)

  fastify.swagger()

  expect(body).toEqual(bodyBefore)
  expect(response).toEqual(responseBefore)
})

test('openapi 3.1+: `nullable` is converted to a `null` type', async () => {
  const cases = [
    [{ type: 'string', nullable: true }, { type: ['string', 'null'] }],
    [{ type: ['string', 'integer'], nullable: true }, { type: ['string', 'integer', 'null'] }],
    [{ type: ['null', 'string'], nullable: true }, { type: ['null', 'string'] }],
    // Ajv (and JSON Schema) only accept `null` if `enum` lists it explicitly
    [{ type: 'string', enum: ['a', 'b'], nullable: true }, { type: ['string', 'null'], enum: ['a', 'b'] }],
    [{ type: 'string', enum: ['a', null], nullable: true }, { type: ['string', 'null'], enum: ['a', null] }],
    [{ type: 'string', nullable: false }, { type: 'string' }],
    // like in OpenAPI 3.0, `nullable` without `type` has no effect
    [{ nullable: true }, {}]
  ]

  for (const openapi of ['3.1.0', '3.2.0']) {
    for (const [input, expected] of cases) {
      const fastify = Fastify()
      await fastify.register(fastifySwagger, { openapi: { openapi } })

      fastify.post('/', {
        schema: { response: { 200: { type: 'object', properties: { value: input } } } }
      }, () => ({}))

      await fastify.ready()

      const openapiObject = fastify.swagger()
      if (openapi === '3.1.0') await Swagger.validate(structuredClone(openapiObject))

      const value = openapiObject.paths['/'].post.responses['200'].content['application/json'].schema.properties.value
      expect(value).toEqual(expected)
    }
  }
})

test('openapi 3.1: `examples` array is kept in nested schemas', async () => {
  const fastify = Fastify()
  await fastify.register(fastifySwagger, { openapi: { openapi: '3.1.0' } })

  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        properties: {
          multipleExamples: { type: 'string', examples: ['foo', 'bar'] },
          nullableObject: {
            type: 'object',
            nullable: true,
            properties: { x: { type: 'integer', examples: [1, 2] } }
          }
        }
      }
    }
  }, () => ({}))

  await fastify.ready()

  const openapiObject = fastify.swagger()
  await Swagger.validate(structuredClone(openapiObject))

  const { properties } = openapiObject.paths['/'].post.requestBody.content['application/json'].schema
  expect(properties.multipleExamples).toEqual({ type: 'string', examples: ['foo', 'bar'] })
  expect(properties.nullableObject).toEqual({
    type: ['object', 'null'],
    properties: { x: { type: 'integer', examples: [1, 2] } }
  })
})
