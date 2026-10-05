'use strict'


const Fastify = require('@xufa/http')
const Swagger = require('@apidevtools/swagger-parser')
const fastifySwagger = require('../../../index')

const openapiOption = {
  openapi: {},
  refResolver: {
    buildLocalReference: (json, _baseUri, _fragment, i) => {
      return json.$id || `def-${i}`
    }
  }
}

test('support $ref schema', async () => {
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)
  fastify.register(async (instance) => {
    instance.addSchema({ $id: 'Order', type: 'object', properties: { id: { type: 'integer', examples: [25] } } })
    instance.post('/', { schema: { body: { $ref: 'Order#' }, response: { 200: { $ref: 'Order#' } } } }, () => {})
  })

  await fastify.ready()

  const openapiObject = fastify.swagger()
  expect(typeof openapiObject).toBe('object')
  expect(Object.keys(openapiObject.components.schemas)).toEqual(['Order'])
  expect(openapiObject.components.schemas.Order.properties.id.example).toBe(25)

  await Swagger.validate(openapiObject)
})

test('support $ref relative pointers in params', async () => {
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)
  fastify.register(async (instance) => {
    instance.addSchema({
      $id: 'Order',
      type: 'object',
      properties: {
        OrderId: {
          type: 'object',
          properties: {
            id: {
              type: 'string'
            }
          }
        }
      }
    })
    instance.get('/:id', { schema: { params: { $ref: 'Order#/properties/OrderId' }, response: { 200: { $ref: 'Order#' } } } }, () => {})
  })

  await fastify.ready()

  const openapiObject = fastify.swagger()
  expect(typeof openapiObject).toBe('object')
  expect(Object.keys(openapiObject.components.schemas)).toEqual(['Order'])

  await Swagger.validate(openapiObject)
})

test('support nested $ref schema : simple test', async () => {
  const fastify = Fastify()
  await fastify.register(fastifySwagger, openapiOption)
  fastify.register(async (instance) => {
    instance.addSchema({ $id: 'OrderItem', type: 'object', properties: { id: { type: 'integer' } }, examples: [{ id: 1 }] })
    instance.addSchema({ $id: 'ProductItem', type: 'object', properties: { id: { type: 'integer' } } })
    instance.addSchema({ $id: 'Order', type: 'object', properties: { products: { type: 'array', items: { $ref: 'OrderItem' } } } })
    instance.post('/', { schema: { body: { $ref: 'Order' }, response: { 200: { $ref: 'Order' } } } }, () => {})
    instance.post('/other', { schema: { body: { $ref: 'ProductItem' } } }, () => {})
  })

  await fastify.ready()

  const openapiObject = fastify.swagger()
  expect(typeof openapiObject).toBe('object')

  const schemas = openapiObject.components.schemas
  expect(Object.keys(schemas)).toEqual(['OrderItem', 'ProductItem', 'Order'])

  //  ref must be prefixed by '#/components/schemas/'
  expect(schemas.Order.properties.products.items.$ref).toBe('#/components/schemas/OrderItem')
  expect(schemas.OrderItem.example).toEqual({ id: 1 })

  await Swagger.validate(openapiObject)
})

test('support nested $ref schema : complex case', async () => {
  const fastify = Fastify()
  await fastify.register(fastifySwagger, openapiOption)
  fastify.register(async (instance) => {
    instance.addSchema({ $id: 'schemaA', type: 'object', properties: { id: { type: 'integer' } } })
    instance.addSchema({ $id: 'schemaB', type: 'object', properties: { id: { type: 'string', examples: ['ABC'] } } })
    instance.addSchema({ $id: 'schemaC', type: 'object', properties: { a: { type: 'array', items: { $ref: 'schemaA' } } } })
    instance.addSchema({ $id: 'schemaD', type: 'object', properties: { b: { $ref: 'schemaB' }, c: { $ref: 'schemaC' } } })
    instance.post('/url1', { schema: { body: { $ref: 'schemaD' }, response: { 200: { $ref: 'schemaB' } } } }, () => {})
    instance.post('/url2', { schema: { body: { $ref: 'schemaC' }, response: { 200: { $ref: 'schemaA' } } } }, () => {})
  })

  await fastify.ready()

  const openapiObject = fastify.swagger()
  expect(typeof openapiObject).toBe('object')

  const schemas = openapiObject.components.schemas
  expect(Object.keys(schemas)).toEqual(['schemaA', 'schemaB', 'schemaC', 'schemaD'])

  // ref must be prefixed by '#/components/schemas/'
  expect(schemas.schemaC.properties.a.items.$ref).toBe('#/components/schemas/schemaA')
  expect(schemas.schemaD.properties.b.$ref).toBe('#/components/schemas/schemaB')
  expect(schemas.schemaD.properties.c.$ref).toBe('#/components/schemas/schemaC')
  expect(schemas.schemaB.properties.id.example).toBe('ABC')

  await Swagger.validate(openapiObject)
})

test('support $ref in response schema', async () => {
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)
  fastify.register(function (instance, _, done) {
    instance.addSchema({ $id: 'order', type: 'string', enum: ['foo'] })
    instance.post('/', { schema: { response: { 200: { type: 'object', properties: { order: { $ref: 'order' } } } } } }, () => {})

    done()
  })

  await fastify.ready()

  const openapiObject = fastify.swagger()
  expect(typeof openapiObject).toBe('object')

  await Swagger.validate(openapiObject)
})

test('support $ref for enums in other schemas', async () => {
  const fastify = Fastify()

  const enumSchema = { $id: 'order', anyOf: [{ type: 'string', const: 'foo' }, { type: 'string', const: 'bar' }] }
  const enumRef = { $ref: 'order' }
  const objectWithEnumSchema = { $id: 'object', type: 'object', properties: { type: enumRef }, required: ['type'] }

  await fastify.register(fastifySwagger, openapiOption)
  await fastify.register(async (instance) => {
    instance.addSchema(enumSchema)
    instance.addSchema(objectWithEnumSchema)
    instance.post('/', { schema: { body: { type: 'object', properties: { order: { $ref: 'order' } } } } }, async () => ({ result: 'OK' }))
  })

  await fastify.ready()

  const responseBeforeSwagger = await fastify.inject({ method: 'POST', url: '/', payload: { order: 'foo' } })

  expect(responseBeforeSwagger.statusCode).toBe(200)
  const openapiObject = fastify.swagger()

  expect(typeof openapiObject).toBe('object')

  await Swagger.validate(openapiObject)

  const responseAfterSwagger = await fastify.inject({ method: 'POST', url: '/', payload: { order: 'foo' } })

  expect(responseAfterSwagger.statusCode).toBe(200)
})

test('support nested $ref schema : complex case without modifying buildLocalReference', async () => {
  const fastify = Fastify()
  await fastify.register(fastifySwagger, { openapi: {} })
  fastify.register(async (instance) => {
    instance.addSchema({ $id: 'schemaA', type: 'object', properties: { id: { type: 'integer' } } })
    instance.addSchema({ $id: 'schemaB', type: 'object', properties: { id: { type: 'string' } } })
    instance.addSchema({ $id: 'schemaC', type: 'object', properties: { a: { type: 'array', items: { $ref: 'schemaA' } } } })
    instance.addSchema({ $id: 'schemaD', type: 'object', properties: { b: { $ref: 'schemaB' }, c: { $ref: 'schemaC' } } })
    instance.post('/url1', { schema: { body: { $ref: 'schemaD' }, response: { 200: { $ref: 'schemaB' } } } }, () => {})
    instance.post('/url2', { schema: { body: { $ref: 'schemaC' }, response: { 200: { $ref: 'schemaA' } } } }, () => {})
  })

  await fastify.ready()

  const openapiObject = fastify.swagger()
  expect(typeof openapiObject).toBe('object')

  const schemas = openapiObject.components.schemas
  expect(Object.keys(schemas)).toEqual(['def-0', 'def-1', 'def-2', 'def-3'])

  // ref must be prefixed by '#/components/schemas/'
  expect(schemas['def-2'].properties.a.items.$ref).toBe('#/components/schemas/def-0')
  expect(schemas['def-3'].properties.b.$ref).toBe('#/components/schemas/def-1')
  expect(schemas['def-3'].properties.c.$ref).toBe('#/components/schemas/def-2')

  await Swagger.validate(openapiObject)
})

test('support nested $ref with patternProperties', async () => {
  const fastify = Fastify()
  await fastify.register(fastifySwagger, { openapi: {} })
  fastify.register(async (instance) => {
    instance.addSchema({ $id: 'schemaA', type: 'object', properties: { id: { type: 'integer' } } })
    instance.addSchema({ $id: 'schemaB', type: 'object', patternProperties: { '^[A-z]{1,10}$': { $ref: 'schemaA#' } } })
  })

  await fastify.ready()

  const openapiObject = fastify.swagger()
  expect(typeof openapiObject).toBe('object')

  const schemas = openapiObject.components.schemas
  expect(Object.keys(schemas)).toEqual(['def-0', 'def-1'])

  // ref must be prefixed by '#/components/schemas/'
  expect(schemas['def-1'].additionalProperties.$ref).toBe('#/components/schemas/def-0')

  await Swagger.validate(openapiObject)
})

test('support $ref schema in allOf in querystring', async () => {
  const fastify = Fastify()
  await fastify.register(fastifySwagger, { openapi: {} })
  fastify.register(async (instance) => {
    instance.addSchema({ $id: 'schemaA', type: 'object', properties: { field1: { type: 'integer' } } })
    instance.get('/url1', { schema: { query: { type: 'object', allOf: [{ $ref: 'schemaA#' }, { type: 'object', properties: { field3: { type: 'boolean' } } }] }, response: { 200: { type: 'object' } } } }, async () => ({ result: 'OK' }))
  })

  await fastify.ready()

  const openapiObject = fastify.swagger()
  expect(typeof openapiObject).toBe('object')

  const schemas = openapiObject.components.schemas
  expect(Object.keys(schemas)).toEqual(['def-0'])

  await Swagger.validate(openapiObject)

  const responseAfterSwagger = await fastify.inject({ method: 'GET', url: '/url1', query: { field1: 10, field3: false } })

  expect(responseAfterSwagger.statusCode).toBe(200)
})

test('support $ref schema in allOf in headers', async () => {
  const fastify = Fastify()
  await fastify.register(fastifySwagger, { openapi: {} })
  fastify.register(async (instance) => {
    instance.addSchema({ $id: 'headerA', type: 'object', properties: { 'x-header-1': { type: 'string' } } })
    instance.get('/url1', { schema: { headers: { allOf: [{ $ref: 'headerA#' }, { type: 'object', properties: { 'x-header-2': { type: 'string' } } }] }, response: { 200: { type: 'object' } } } }, async () => ({ result: 'OK' }))
  })

  await fastify.ready()

  const openapiObject = fastify.swagger()
  expect(typeof openapiObject).toBe('object')

  const schemas = openapiObject.components.schemas
  expect(Object.keys(schemas)).toEqual(['def-0'])

  await Swagger.validate(openapiObject)

  const responseAfterSwagger = await fastify.inject({ method: 'GET', url: '/url1', headers: { 'x-header-1': 'test', 'x-header-2': 'test' } })

  expect(responseAfterSwagger.statusCode).toBe(200)
})

test('supports properties in oneOf query schemas without explicit type', async () => {
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

  fastify.get('/', {
    schema: {
      query: {
        type: 'object',
        oneOf: [
          {
            properties: {
              bar: { type: 'number' }
            }
          },
          {
            properties: {
              foo: { type: 'string' }
            }
          }
        ]
      },
      response: {
        200: {
          type: 'object',
          properties: {
            result: { type: 'string' }
          }
        }
      }
    }
  }, () => ({ result: 'OK' }))

  await fastify.ready()

  const openapiObject = fastify.swagger()
  await Swagger.validate(openapiObject)

  expect(openapiObject.paths['/'].get.parameters.map(parameter => parameter.name)).toEqual(['bar', 'foo'])
})

test('supports empty query schemas', async () => {
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)
  fastify.get('/', { schema: { query: {} } }, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  await Swagger.validate(openapiObject)
  expect(openapiObject.paths['/'].get.parameters).toBe(undefined)
})

test('renders required query parameter when property is a $ref', async () => {
  const fastify = Fastify()
  await fastify.register(fastifySwagger, { openapi: {} })

  fastify.addSchema({
    $id: 'CoringUploadTypeApiModel',
    type: 'string',
    enum: ['health_safety', 'coring']
  })

  fastify.get('/some-route', {
    schema: {
      query: {
        type: 'object',
        required: ['thing'],
        properties: {
          thing: { $ref: 'CoringUploadTypeApiModel' },
          other: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            hello: { type: 'string' }
          }
        }
      }
    }
  }, () => ({ hello: 'world' }))

  await fastify.ready()

  const openapiObject = fastify.swagger()
  await Swagger.validate(openapiObject)

  const thingQueryParam = openapiObject.paths['/some-route'].get.parameters.find(parameter => parameter.name === 'thing')
  const otherQueryParam = openapiObject.paths['/some-route'].get.parameters.find(parameter => parameter.name === 'other')

  expect(thingQueryParam.required).toBe(true)
  expect(otherQueryParam.required).toBe(false)
})

test('renders $ref schema with enum in headers', async () => {
  const fastify = Fastify()
  await fastify.register(fastifySwagger, { openapi: {} })
  fastify.register(async (instance) => {
    instance.addSchema({ $id: 'headerA', type: 'object', properties: { 'x-enum-header': { type: 'string', enum: ['OK', 'NOT_OK'] } } })
    instance.get('/url1', { schema: { headers: { $ref: 'headerA#' }, response: { 200: { type: 'object' } } } }, async () => ({ result: 'OK' }))
  })

  await fastify.ready()

  const openapiObject = fastify.swagger()

  await Swagger.validate(openapiObject)

  // the OpenAPI spec should show the enum
  expect(openapiObject.paths['/url1'].get.parameters[0].schema).toEqual({ type: 'string', enum: ['OK', 'NOT_OK'] })
})

test('renders $ref schema with additional keywords', async () => {
  const fastify = Fastify()
  await fastify.register(fastifySwagger, { openapi: {} })
  await fastify.register(require('@fastify/cookie'))

  const cookie = {
    type: 'object',
    properties: {
      a: { type: 'string' },
      b: { type: 'string' },
      c: { type: 'string' }
    },
    minProperties: 2
  }

  fastify.register(async (instance) => {
    instance.addSchema({
      $id: 'headerA',
      type: 'object',
      properties: {
        cookie
      }
    })

    instance.get('/url1', {
      preValidation: async (request) => {
        request.headers.cookie = request.cookies
      },
      schema: {
        headers: {
          $ref: 'headerA#'
        }
      }
    }, async (req) => (req.headers))
  })

  await fastify.ready()
  const openapiObject = fastify.swagger()
  await Swagger.validate(openapiObject)

  expect(openapiObject.paths['/url1'].get.parameters[0].schema).toEqual(cookie)

  let res = await fastify.inject({ method: 'GET', url: 'url1', cookies: { a: 'hi', b: 'asd' } })

  expect(res.statusCode).toEqual(200)

  res = await fastify.inject({ method: 'GET', url: 'url1', cookies: { a: 'hi' } })

  expect(res.statusCode).toEqual(400)
  expect(openapiObject.paths['/url1'].get.parameters[0].schema).toEqual(cookie)
})

test('support $ref in callbacks', async () => {
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)
  fastify.register(async (instance) => {
    instance.addSchema({ $id: 'Subscription', type: 'object', properties: { callbackUrl: { type: 'string', examples: ['https://example.com'] } } })
    instance.addSchema({ $id: 'Event', type: 'object', properties: { message: { type: 'string', examples: ['Some event happened'] } } })
    instance.post('/subscribe', {
      schema: {
        body: {
          $ref: 'Subscription#'
        },
        response: {
          200: {
            $ref: 'Subscription#'
          }
        },
        callbacks: {
          myEvent: {
            '{$request.body#/callbackUrl}': {
              post: {
                requestBody: {
                  content: {
                    'application/json': {
                      schema: { $ref: 'Event#' }
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
          }
        }
      }
    }, () => {})
  })

  await fastify.ready()

  const openapiObject = fastify.swagger()

  expect(typeof openapiObject).toBe('object')
  expect(Object.keys(openapiObject.components.schemas)).toEqual(['Subscription', 'Event'])
  expect(openapiObject.components.schemas.Subscription.properties.callbackUrl.example).toBe('https://example.com')
  expect(openapiObject.components.schemas.Event.properties.message.example).toBe('Some event happened')

  await Swagger.validate(openapiObject)
})

test('should return only ref if defs and ref is defined', async () => {
  const fastify = Fastify()
  await fastify.register(fastifySwagger, { openapi: { openapi: '3.1.0' } })

  fastify.addSchema({
    $id: 'sharedSchema',
    humanModule: {
      $defs: {
        AddressSchema: {
          type: 'object',
          properties: {
            street: {
              type: 'string',
            },
            streetNumber: {
              type: 'number',
            },
          },
          required: [
            'street',
            'streetNumber',
          ],
          $id: 'AddressSchema',
        },
        PersonSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
            },
            homeAddress: {
              $ref: 'AddressSchema',
            },
            workAddress: {
              $ref: 'AddressSchema',
            },
          },
          required: [
            'name',
            'homeAddress',
            'workAddress',
          ],
          $id: 'PersonSchema',
        },
        PostRequestSchema: {
          type: 'object',
          properties: {
            person: {
              $ref: 'PersonSchema',
            },
          },
          required: [
            'person',
          ],
          $id: 'PostRequestSchema',
        },
      },
    },
  })
  fastify.get('/person', {
    schema: {
      response: {
        200:
        {
          $defs: {
            AddressSchema: {
              type: 'object',
              properties: {
                street: {
                  type: 'string',
                },
                streetNumber: {
                  type: 'number',
                },
              },
              required: [
                'street',
                'streetNumber',
              ],
              $id: 'AddressSchema',
            },
            PersonSchema: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                },
                homeAddress: {
                  $ref: 'AddressSchema',
                },
                workAddress: {
                  $ref: 'AddressSchema',
                },
              },
              required: [
                'name',
                'homeAddress',
                'workAddress',
              ],
              $id: 'PersonSchema',
            },
            PostRequestSchema: {
              type: 'object',
              properties: {
                person: {
                  $ref: 'PersonSchema',
                },
              },
              required: [
                'person',
              ],
              $id: 'PostRequestSchema',
            },
          },
          $ref: 'PersonSchema',
        }
      }
    },
  }, async () => ({ result: 'OK' }))

  await fastify.ready()

  const openapiObject = fastify.swagger()

  expect(typeof openapiObject).toBe('object')

  const expectedPathContent = { 'application/json': { schema: { $ref: '#/components/schemas/def-2' } } }
  expect(openapiObject.paths['/person'].get.responses[200].content).toEqual(expectedPathContent)

  await Swagger.validate(openapiObject)
})

// https://github.com/fastify/fastify-swagger/issues/639
const definitionsCases = [
  ['openapi', { openapi: {} }, (document) => document.components.schemas, '#/components/schemas/']
]

for (const [name, option, getSchemas, prefix] of definitionsCases) {
  test(`${name}: support $ref to the definitions of a shared schema`, async () => {
    const fastify = Fastify()
    await fastify.register(fastifySwagger, option)

    fastify.addSchema({
      $id: 'http://foo/common.json',
      type: 'object',
      definitions: {
        foo: {
          $id: '#address',
          type: 'object',
          properties: { city: { type: 'string' } }
        }
      }
    })
    fastify.post('/', {
      schema: {
        body: { $ref: 'http://foo/common.json#/definitions/foo' },
        response: { 200: { $ref: 'http://foo/common.json#/definitions/foo/properties/city' } }
      }
    }, () => {})

    await fastify.ready()

    const document = fastify.swagger()
    const schemas = getSchemas(document)
    await Swagger.validate(JSON.parse(JSON.stringify(document)))

    expect(schemas['def-0'].definitions).toBe(undefined)
    expect(schemas['def-0-foo'].properties).toEqual({ city: { type: 'string' } })
    expect(JSON.stringify(document.paths['/'].post)).toMatch(new RegExp(`"\\$ref":"${prefix}def-0-foo"`))
    expect(JSON.stringify(document.paths['/'].post)).toMatch(new RegExp(`"\\$ref":"${prefix}def-0-foo/properties/city"`))
  })

  test(`${name}: support local $ref and nested definitions in a shared schema`, async () => {
    const fastify = Fastify()
    await fastify.register(fastifySwagger, option)

    fastify.addSchema({
      $id: 'tree',
      type: 'object',
      definitions: {
        node: {
          type: 'object',
          definitions: {
            leaf: { type: 'string', enum: ['a', 'b'], default: 'a' }
          },
          properties: {
            // a property named as a keyword must not be hoisted
            definitions: { type: 'string' },
            value: { $ref: '#/definitions/node/definitions/leaf' },
            children: { type: 'array', items: { $ref: '#/definitions/node' } }
          }
        }
      },
      properties: {
        self: { $ref: '#' },
        root: { $ref: '#/definitions/node' },
        nested: {
          type: 'object',
          $defs: { node: { type: 'integer' } },
          properties: { id: { $ref: '#/properties/nested/$defs/node' } }
        },
        sibling: { $ref: '#/properties/nested' }
      }
    })
    // takes the name that would be assigned to the hoisted definition
    fastify.addSchema({ $id: 'other', type: 'object', properties: { tree: { $ref: 'tree#' } } })
    fastify.get('/', { schema: { response: { 200: { $ref: 'tree#' } } } }, () => {})

    await fastify.ready()

    const document = fastify.swagger()
    const schemas = getSchemas(document)
    await Swagger.validate(JSON.parse(JSON.stringify(document)))

    expect(Object.keys(schemas).sort()).toEqual([
      'def-0', 'def-0-leaf', 'def-0-node', 'def-0-node-1', 'def-1'
    ])
    expect(schemas['def-0'].properties).toEqual({
      self: { $ref: `${prefix}def-0` },
      root: { $ref: `${prefix}def-0-node` },
      nested: { type: 'object', properties: { id: { $ref: `${prefix}def-0-node-1` } } },
      sibling: { $ref: `${prefix}def-0/properties/nested` }
    })
    expect(schemas['def-0-node'].properties).toEqual({
      definitions: { type: 'string' },
      value: { $ref: `${prefix}def-0-leaf` },
      children: { type: 'array', items: { $ref: `${prefix}def-0-node` } }
    })
    expect(schemas['def-0-node-1']).toEqual({ type: 'integer' })
  })
}

for (const [name, option, getSchemas, prefix] of definitionsCases) {
  test(`${name}: support $ref to the anchor of a shared schema`, async () => {
    const fastify = Fastify()
    await fastify.register(fastifySwagger, option)

    // same shape of the schemas of the Fastify "Fluent Schema" guide
    fastify.addSchema({
      $id: 'https://fastify/demo',
      type: 'object',
      definitions: {
        addressSchema: {
          $id: '#address',
          type: 'object',
          properties: { city: { type: 'string' } }
        },
        userSchema: {
          $id: '#user',
          type: 'object',
          properties: { home: { $ref: '#address' } }
        }
      }
    })

    const body = {
      type: 'object',
      properties: {
        residence: { $ref: 'https://fastify/demo#address' },
        office: { $ref: 'https://fastify/demo#/definitions/addressSchema' },
        owner: { $ref: 'https://fastify/demo#user' }
      }
    }
    fastify.post('/', {
      schema: {
        body,
        response: { 200: { $ref: 'https://fastify/demo#address' } }
      }
    }, () => {})

    await fastify.ready()

    const document = fastify.swagger()
    const schemas = getSchemas(document)
    await Swagger.validate(JSON.parse(JSON.stringify(document)))

    // the anchored subschemas are not listed twice
    expect(Object.keys(schemas)).toEqual(['def-0', 'def-0-addressSchema', 'def-0-userSchema'])
    expect(schemas['def-0-userSchema'].properties.home).toEqual({ $ref: `${prefix}def-0-addressSchema` })

    const operation = JSON.stringify(document.paths['/'].post)
    expect(operation).not.toMatch(/def-0address/)
    expect(operation.split(`"$ref":"${prefix}def-0-addressSchema"`).length - 1).toBe(3)
    expect(operation).toMatch(new RegExp(`"\\$ref":"${prefix}def-0-userSchema"`))

    // the schema of the route is left untouched
    expect(body.properties.residence.$ref).toBe('https://fastify/demo#address')
  })

  test(`${name}: support $ref to an anchor outside of the definitions`, async () => {
    const fastify = Fastify()
    await fastify.register(fastifySwagger, option)

    fastify.addSchema({
      $id: 'order',
      type: 'object',
      properties: {
        shipping: { $id: '#shipping', type: 'object', properties: { city: { type: 'string' } } },
        billing: { $ref: '#shipping' }
      }
    })
    fastify.post('/', { schema: { body: { $ref: 'order#shipping' } } }, () => {})

    await fastify.ready()

    const document = fastify.swagger()
    const schemas = getSchemas(document)
    await Swagger.validate(JSON.parse(JSON.stringify(document)))

    expect(Object.keys(schemas)).toEqual(['def-0'])
    expect(schemas['def-0'].properties.billing).toEqual({ $ref: `${prefix}def-0/properties/shipping` })
    expect(JSON.stringify(document.paths['/'].post)).toMatch(new RegExp(`"\\$ref":"${prefix}def-0/properties/shipping"`))
  })
}
