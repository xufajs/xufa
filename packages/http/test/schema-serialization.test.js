'use strict'


const Fastify = require('..')
const ContentType = require('../lib/content-type')
const { waitForCb } = require('./helper')

const echoBody = (req, reply) => { reply.send(req.body) }

test('basic test', (testDone) => {
  expect.assertions(3)

  const fastify = Fastify()
  fastify.get('/', {
    schema: {
      response: {
        '2xx': {
          type: 'object',
          properties: {
            name: { type: 'string' },
            work: { type: 'string' }
          }
        }
      }
    }
  }, function (req, reply) {
    reply.code(200).send({ name: 'Foo', work: 'Bar', nick: 'Boo' })
  })

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.json()).toEqual({ name: 'Foo', work: 'Bar' })
    expect(res.statusCode).toBe(200)
    testDone()
  })
})

test('custom serializer options', (testDone) => {
  expect.assertions(3)

  const fastify = Fastify({
    serializerOpts: {
      rounding: 'ceil'
    }
  })
  fastify.get('/', {
    schema: {
      response: {
        '2xx': {
          type: 'integer'
        }
      }
    }
  }, function (req, reply) {
    reply.send(4.2)
  })

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('5')
    expect(res.statusCode).toBe(200)
    testDone()
  })
})

test('reuse parsed content type when selecting response serializer', async () => {
  const fastify = Fastify()
  const contentType = 'application/x-fastify-cache-test+json; version=1'

  fastify.get('/', {
    schema: {
      response: {
        200: {
          content: {
            'application/x-fastify-cache-test+json': {
              schema: {
                type: 'object',
                properties: {
                  hello: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, function (request, reply) {
    reply.type(contentType).send({ hello: 'world', ignored: true })
  })

  const response = await fastify.inject('/')
  const normalizedContentType = response.headers['content-type']

  expect(response.json()).toEqual({ hello: 'world' })
  expect(ContentType.cache.get(normalizedContentType)).toBeTruthy()
})

test('Different content types', (testDone) => {
  expect.assertions(46)

  const fastify = Fastify()
  fastify.addSchema({
    $id: 'test',
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'number' },
      verified: { type: 'boolean' }
    }
  })

  fastify.get('/', {
    schema: {
      response: {
        200: {
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
                type: 'array',
                items: { $ref: 'test' }
              }
            }
          }
        },
        201: {
          content: {
            '*/*': {
              schema: { type: 'string' }
            }
          }
        },
        202: {
          content: {
            '*/*': {
              schema: { const: 'Processing exclusive content' }
            }
          }
        },
        '3xx': {
          content: {
            'application/vnd.v2+json': {
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
          content: {
            '*/*': {
              schema: {
                type: 'object',
                properties: {
                  details: { type: 'string' }
                }
              }
            }
          }
        },
        default: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  details: { type: 'string' }
                }
              }
            },
            '*/*': {
              schema: {
                type: 'object',
                properties: {
                  desc: { type: 'string' },
                  details: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, function (req, reply) {
    switch (req.headers.accept) {
      case 'application/json':
        reply.header('Content-Type', 'application/json')
        reply.send({ id: 1, name: 'Foo', image: 'profile picture', address: 'New Node' })
        break
      case 'application/vnd.v1+json':
        reply.header('Content-Type', 'application/vnd.v1+json')
        reply.send([{ id: 2, name: 'Boo', age: 18, verified: false }, { id: 3, name: 'Woo', age: 30, verified: true }])
        break
      case 'application/vnd.v2+json':
        reply.header('Content-Type', 'application/vnd.v2+json')
        reply.code(300)
        reply.send({ fullName: 'Jhon Smith', phone: '01090000000', authMethod: 'google' })
        break
      case 'application/vnd.v3+json':
        reply.header('Content-Type', 'application/vnd.v3+json')
        reply.code(300)
        reply.send({ firstName: 'New', lastName: 'Hoo', country: 'eg', city: 'node' })
        break
      case 'application/vnd.v4+json':
        reply.header('Content-Type', 'application/vnd.v4+json')
        reply.code(201)
        reply.send({ boxId: 1, content: 'Games' })
        break
      case 'application/vnd.v5+json':
        reply.header('Content-Type', 'application/vnd.v5+json')
        reply.code(202)
        reply.send({ content: 'interesting content' })
        break
      case 'application/vnd.v6+json':
        reply.header('Content-Type', 'application/vnd.v6+json')
        reply.code(400)
        reply.send({ desc: 'age is missing', details: 'validation error' })
        break
      case 'application/vnd.v7+json':
        reply.code(400)
        reply.send({ details: 'validation error' })
        break
      case 'application/vnd.v8+json':
        reply.header('Content-Type', 'application/vnd.v8+json')
        reply.code(500)
        reply.send({ desc: 'age is missing', details: 'validation error' })
        break
      case 'application/vnd.v9+json':
        reply.code(500)
        reply.send({ details: 'validation error' })
        break
      default:
        // to test if schema not found
        reply.header('Content-Type', 'application/vnd.v3+json')
        reply.code(200)
        reply.send([{ type: 'student', grade: 6 }, { type: 'student', grade: 9 }])
    }
  })

  fastify.get('/test', {
    serializerCompiler: ({ contentType }) => {
      expect(contentType).toBe('application/json')
      return data => JSON.stringify(data)
    },
    schema: {
      response: {
        200: {
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
            }
          }
        },
        default: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  details: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, function (req, reply) {
    switch (req.headers['code']) {
      case '200': {
        reply.header('Content-Type', 'application/json')
        reply.code(200).send({ age: 18, city: 'AU' })
        break
      }
      case '201': {
        reply.header('Content-Type', 'application/json')
        reply.code(201).send({ details: 'validation error' })
        break
      }
      default: {
        reply.header('Content-Type', 'application/vnd.v1+json')
        reply.code(201).send({ created: true })
        break
      }
    }
  })

  const completion = waitForCb({ steps: 14 })
  fastify.inject({ method: 'GET', url: '/', headers: { Accept: 'application/json' } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe(JSON.stringify({ name: 'Foo', image: 'profile picture', address: 'New Node' }))
    expect(res.statusCode).toBe(200)
    completion.stepIn()
  })
  fastify.inject({ method: 'GET', url: '/', headers: { Accept: 'application/vnd.v1+json' } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe(JSON.stringify([{ name: 'Boo', age: 18, verified: false }, { name: 'Woo', age: 30, verified: true }]))
    expect(res.statusCode).toBe(200)
    completion.stepIn()
  })
  fastify.inject({ method: 'GET', url: '/' }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe(JSON.stringify([{ type: 'student', grade: 6 }, { type: 'student', grade: 9 }]))
    expect(res.statusCode).toBe(200)
    completion.stepIn()
  })
  fastify.inject({ method: 'GET', url: '/', headers: { Accept: 'application/vnd.v2+json' } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe(JSON.stringify({ fullName: 'Jhon Smith', phone: '01090000000' }))
    expect(res.statusCode).toBe(300)
    completion.stepIn()
  })
  fastify.inject({ method: 'GET', url: '/', headers: { Accept: 'application/vnd.v3+json' } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe(JSON.stringify({ firstName: 'New', lastName: 'Hoo', country: 'eg', city: 'node' }))
    expect(res.statusCode).toBe(300)
    completion.stepIn()
  })
  fastify.inject({ method: 'GET', url: '/', headers: { Accept: 'application/vnd.v4+json' } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('"[object Object]"')
    expect(res.statusCode).toBe(201)
    completion.stepIn()
  })
  fastify.inject({ method: 'GET', url: '/', headers: { Accept: 'application/vnd.v5+json' } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('"Processing exclusive content"')
    expect(res.statusCode).toBe(202)
    completion.stepIn()
  })
  fastify.inject({ method: 'GET', url: '/', headers: { Accept: 'application/vnd.v6+json' } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe(JSON.stringify({ details: 'validation error' }))
    expect(res.statusCode).toBe(400)
    completion.stepIn()
  })
  fastify.inject({ method: 'GET', url: '/', headers: { Accept: 'application/vnd.v7+json' } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe(JSON.stringify({ details: 'validation error' }))
    expect(res.statusCode).toBe(400)
    completion.stepIn()
  })
  fastify.inject({ method: 'GET', url: '/', headers: { Accept: 'application/vnd.v8+json' } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe(JSON.stringify({ desc: 'age is missing', details: 'validation error' }))
    expect(res.statusCode).toBe(500)
    completion.stepIn()
  })
  fastify.inject({ method: 'GET', url: '/', headers: { Accept: 'application/vnd.v9+json' } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe(JSON.stringify({ details: 'validation error' }))
    expect(res.statusCode).toBe(500)
    completion.stepIn()
  })
  fastify.inject({ method: 'GET', url: '/test', headers: { Code: '200' } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe(JSON.stringify({ age: 18, city: 'AU' }))
    expect(res.statusCode).toBe(200)
    completion.stepIn()
  })
  fastify.inject({ method: 'GET', url: '/test', headers: { Code: '201' } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe(JSON.stringify({ details: 'validation error' }))
    expect(res.statusCode).toBe(201)
    completion.stepIn()
  })
  fastify.inject({ method: 'GET', url: '/test', headers: { Accept: 'application/vnd.v1+json' } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe(JSON.stringify({ created: true }))
    expect(res.statusCode).toBe(201)
    completion.stepIn()
  })

  completion.patience.then(testDone)
})

test('Invalid multiple content schema, throw XUFA_ERR_SCH_CONTENT_MISSING_SCHEMA error', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.get('/testInvalid', {
    schema: {
      response: {
        200: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  fullName: { type: 'string' },
                  phone: { type: 'string' }
                }
              },
              example: {
                fullName: 'John Doe',
                phone: '201090243795'
              }
            },
            type: 'string'
          }
        }
      }
    }
  }, function (req, reply) {
    reply.header('Content-Type', 'application/json')
    reply.send({ fullName: 'Any name', phone: '0109001010' })
  })

  fastify.ready((err) => {
    expect(err.message).toBe("Schema is missing for the content type 'type'")
    expect(err.statusCode).toBe(500)
    expect(err.code).toBe('XUFA_ERR_SCH_CONTENT_MISSING_SCHEMA')
    testDone()
  })
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

  fastify.get('/:id', {
    handler (req, reply) {
      reply.send([{ id: 1 }, { id: 2 }, { what: 'is this' }])
    },
    schema: {
      response: {
        200: {
          type: 'array',
          items: { $ref: 'test' }
        }
      }
    }
  })

  fastify.inject({
    method: 'GET',
    url: '/123'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.json()).toEqual([{ id: 1 }, { id: 2 }, {}])
    testDone()
  })
})

test('Use shared schema and $ref with $id in response ($ref to $id)', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify()

  fastify.addSchema({
    $id: 'http://foo/test',
    type: 'object',
    properties: {
      id: { type: 'number' }
    }
  })

  const complexSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'http://foo/user',
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
    properties: {
      test: { $ref: 'http://foo/test#' },
      address: { $ref: '#address' }
    },
    required: ['address', 'test']
  }

  fastify.post('/', {
    schema: {
      body: complexSchema,
      response: {
        200: complexSchema
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
    expect(res.json()).toEqual(payload)
    completion.stepIn()
  })
  fastify.inject({
    method: 'POST',
    url: '/',
    payload: { test: { id: Date.now() } }
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

test('Shared schema should be pass to serializer and validator ($ref to shared schema /definitions)', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify()

  fastify.addSchema({
    $id: 'http://fastify.test/asset.json',
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'Physical Asset',
    description: 'A generic representation of a physical asset',
    type: 'object',
    required: [
      'id',
      'model',
      'location'
    ],
    properties: {
      id: {
        type: 'string',
        format: 'uuid'
      },
      model: {
        type: 'string'
      },
      location: { $ref: 'http://fastify.test/point.json#' }
    },
    definitions: {
      inner: {
        $id: '#innerId',
        type: 'string',
        format: 'email'
      }
    }
  })

  fastify.addSchema({
    $id: 'http://fastify.test/point.json',
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'Longitude and Latitude Values',
    description: 'A geographical coordinate.',
    type: 'object',
    required: [
      'latitude',
      'longitude'
    ],
    properties: {
      email: { $ref: 'http://fastify.test/asset.json#/definitions/inner' },
      latitude: {
        type: 'number',
        minimum: -90,
        maximum: 90
      },
      longitude: {
        type: 'number',
        minimum: -180,
        maximum: 180
      },
      altitude: {
        type: 'number'
      }
    }
  })

  const schemaLocations = {
    $id: 'http://fastify.test/locations.json',
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'List of Asset locations',
    type: 'array',
    items: { $ref: 'http://fastify.test/asset.json#' }
  }

  fastify.post('/', {
    schema: {
      body: schemaLocations,
      response: { 200: schemaLocations }
    }
  }, (req, reply) => {
    reply.send(locations.map(_ => Object.assign({ serializer: 'remove me' }, _)))
  })

  const locations = [
    { id: '550e8400-e29b-41d4-a716-446655440000', model: 'mod', location: { latitude: 10, longitude: 10, email: 'foo@bar.it' } },
    { id: '550e8400-e29b-41d4-a716-446655440000', model: 'mod', location: { latitude: 10, longitude: 10, email: 'foo@bar.it' } }
  ]
  fastify.inject({
    method: 'POST',
    url: '/',
    payload: locations
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.json()).toEqual(locations)

    fastify.inject({
      method: 'POST',
      url: '/',
      payload: locations.map(_ => {
        _.location.email = 'not an email'
        return _
      })
    }, (err, res) => {
      expect(err).toBeFalsy()
      expect(res.statusCode).toBe(400)
      expect(res.json()).toEqual({
        error: 'Bad Request',
        message: 'body/0/location/email must match format "email"',
        statusCode: 400,
        code: 'XUFA_ERR_VALIDATION'
      })
      testDone()
    })
  })
})

test('Custom setSerializerCompiler', (testDone) => {
  expect.assertions(7)
  const fastify = Fastify({ exposeHeadRoutes: false })

  const outSchema = {
    $id: 'test',
    type: 'object',
    whatever: 'need to be parsed by the custom serializer'
  }

  fastify.setSerializerCompiler(({ schema, method, url, httpStatus }) => {
    expect(method).toBe('GET')
    expect(url).toBe('/foo/:id')
    expect(httpStatus).toBe('200')
    expect(schema).toEqual(outSchema)
    return data => JSON.stringify(data)
  })

  fastify.register((instance, opts, done) => {
    instance.get('/:id', {
      handler (req, reply) {
        reply.send({ id: 1 })
      },
      schema: {
        response: {
          200: outSchema
        }
      }
    })
    expect(instance.serializerCompiler).toBeTruthy()
    done()
  }, { prefix: '/foo' })

  fastify.inject({
    method: 'GET',
    url: '/foo/123'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe(JSON.stringify({ id: 1 }))
    testDone()
  })
})

test('Custom setSerializerCompiler returns bad serialized output', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()

  const outSchema = {
    $id: 'test',
    type: 'object',
    whatever: 'need to be parsed by the custom serializer'
  }

  fastify.setSerializerCompiler(({ schema, method, url, httpStatus }) => {
    return data => {
      expect('returning an invalid serialization').toBeTruthy()
      return { not: 'a string' }
    }
  })

  fastify.get('/:id', {
    handler (req, reply) { throw new Error('ops') },
    schema: {
      response: {
        500: outSchema
      }
    }
  })

  fastify.inject({
    method: 'GET',
    url: '/123'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({
      code: 'XUFA_ERR_REP_INVALID_PAYLOAD_TYPE',
      message: 'Attempted to send payload of invalid type \'object\'. Expected a string or Buffer.',
      statusCode: 500
    })
    testDone()
  })
})

test('Custom setSerializerCompiler with addSchema', (testDone) => {
  expect.assertions(6)
  const fastify = Fastify({ exposeHeadRoutes: false })

  const outSchema = {
    $id: 'test',
    type: 'object',
    whatever: 'need to be parsed by the custom serializer'
  }

  fastify.setSerializerCompiler(({ schema, method, url, httpStatus }) => {
    expect(method).toBe('GET')
    expect(url).toBe('/foo/:id')
    expect(httpStatus).toBe('200')
    expect(schema).toEqual(outSchema)
    return _data => JSON.stringify({ id: 2 })
  })

  // provoke re-creation of serialization compiler in setupSerializer
  fastify.addSchema({ $id: 'dummy', type: 'object' })

  fastify.get('/foo/:id', {
    handler (_req, reply) {
      reply.send({ id: 1 })
    },
    schema: {
      response: {
        200: outSchema
      }
    }
  })

  fastify.inject({
    method: 'GET',
    url: '/foo/123'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe(JSON.stringify({ id: 2 }))
    testDone()
  })
})

test('Custom serializer per route', async () => {
  const fastify = Fastify()

  const outSchema = {
    $id: 'test',
    type: 'object',
    properties: {
      mean: { type: 'string' }
    }
  }

  fastify.get('/default', {
    handler (req, reply) { reply.send({ mean: 'default' }) },
    schema: { response: { 200: outSchema } }
  })

  let hit = 0
  fastify.register((instance, opts, done) => {
    instance.setSerializerCompiler(({ schema, method, url, httpStatus }) => {
      hit++
      return data => JSON.stringify({ mean: 'custom' })
    })
    instance.get('/custom', {
      handler (req, reply) { reply.send({}) },
      schema: { response: { 200: outSchema } }
    })
    instance.get('/route', {
      handler (req, reply) { reply.send({}) },
      serializerCompiler: ({ schema, method, url, httpPart }) => {
        hit++
        return data => JSON.stringify({ mean: 'route' })
      },
      schema: { response: { 200: outSchema } }
    })

    done()
  })

  let res = await fastify.inject('/default')
  expect(res.json().mean).toBe('default')

  res = await fastify.inject('/custom')
  expect(res.json().mean).toBe('custom')

  res = await fastify.inject('/route')
  expect(res.json().mean).toBe('route')

  expect(hit).toBe(4)
})

test('Reply serializer win over serializer ', (testDone) => {
  expect.assertions(6)

  const fastify = Fastify()
  fastify.setReplySerializer(function (payload, statusCode) {
    expect(payload).toEqual({ name: 'Foo', work: 'Bar', nick: 'Boo' })
    return 'instance serializator'
  })

  fastify.get('/', {
    schema: {
      response: {
        '2xx': {
          type: 'object',
          properties: {
            name: { type: 'string' },
            work: { type: 'string' }
          }
        }
      }
    },
    serializerCompiler: ({ schema, method, url, httpPart }) => {
      expect(method).toBeTruthy()
      return () => {
        expect.fail('the serializer must not be called when there is a reply serializer')
        return 'fail'
      }
    }
  }, function (req, reply) {
    reply.code(200).send({ name: 'Foo', work: 'Bar', nick: 'Boo' })
  })

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toEqual('instance serializator')
    expect(res.statusCode).toBe(200)
    testDone()
  })
})

test('Reply serializer win over serializer ', (testDone) => {
  expect.assertions(6)

  const fastify = Fastify()
  fastify.setReplySerializer(function (payload, statusCode) {
    expect(payload).toEqual({ name: 'Foo', work: 'Bar', nick: 'Boo' })
    return 'instance serializator'
  })

  fastify.get('/', {
    schema: {
      response: {
        '2xx': {
          type: 'object',
          properties: {
            name: { type: 'string' },
            work: { type: 'string' }
          }
        }
      }
    },
    serializerCompiler: ({ schema, method, url, httpPart }) => {
      expect(method).toBeTruthy()
      return () => {
        expect.fail('the serializer must not be called when there is a reply serializer')
        return 'fail'
      }
    }
  }, function (req, reply) {
    reply.code(200).send({ name: 'Foo', work: 'Bar', nick: 'Boo' })
  })

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toEqual('instance serializator')
    expect(res.statusCode).toBe(200)
    testDone()
  })
})

test('The schema compiler recreate itself if needed', (testDone) => {
  expect.assertions(1)
  const fastify = Fastify()

  fastify.options('/', {
    schema: {
      response: { '2xx': { hello: { type: 'string' } } }
    }
  }, echoBody)

  fastify.register(function (fastify, options, done) {
    fastify.addSchema({
      $id: 'identifier',
      type: 'string',
      format: 'uuid'
    })

    fastify.get('/', {
      schema: {
        response: {
          '2xx': {
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

test('The schema changes the default error handler output', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.get('/:code', {
    schema: {
      response: {
        '2xx': { hello: { type: 'string' } },
        501: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        },
        '5xx': {
          type: 'object',
          properties: {
            customId: { type: 'number' },
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, (request, reply) => {
    if (request.params.code === '501') {
      return reply.code(501).send(new Error('501 message'))
    }
    const error = new Error('500 message')
    error.customId = 42
    reply.send(error)
  })

  let res = await fastify.inject('/501')
  expect(res.statusCode).toBe(501)
  expect(res.json()).toEqual({ message: '501 message' })

  res = await fastify.inject('/500')
  expect(res.statusCode).toBe(500)
  expect(res.json()).toEqual({ error: 'Internal Server Error', message: '500 message', customId: 42 })
})

test('do not crash if status code serializer errors', async () => {
  const fastify = Fastify()

  const requiresFoo = {
    type: 'object',
    properties: { foo: { type: 'string' } },
    required: ['foo']
  }

  const someUserErrorType2 = {
    type: 'object',
    properties: {
      customCode: { type: 'number' }
    },
    required: ['customCode']
  }

  fastify.get(
    '/',
    {
      schema: {
        query: requiresFoo,
        response: { 400: someUserErrorType2 }
      }
    },
    (request, reply) => {
      expect.fail('handler, should not be called')
    }
  )

  const res = await fastify.inject({
    path: '/',
    query: {
      notfoo: true
    }
  })
  expect(res.statusCode).toBe(500)
  expect(res.json()).toEqual({
    statusCode: 500,
    code: 'XUFA_ERR_FAILED_ERROR_SERIALIZATION',
    message: 'Failed to serialize an error. Error: "customCode" is required!. ' +
      'Original error: querystring must have required property \'foo\''
  })
})

test('custom schema serializer error, empty message', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.get('/:code', {
    schema: {
      response: {
        '2xx': { hello: { type: 'string' } },
        501: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        }
      }
    }
  }, (request, reply) => {
    if (request.params.code === '501') {
      return reply.code(501).send(new Error(''))
    }
  })

  const res = await fastify.inject('/501')
  expect(res.statusCode).toBe(501)
  expect(res.json()).toEqual({ message: '' })
})

test('error in custom schema serialize compiler, throw XUFA_ERR_SCH_SERIALIZATION_BUILD error', (testDone) => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.get('/', {
    schema: {
      response: {
        '2xx': {
          type: 'object',
          properties: {
            some: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        }
      }
    },
    serializerCompiler: () => {
      throw new Error('CUSTOM_ERROR')
    }
  }, function (req, reply) {
    reply.code(200).send({ some: 'thing' })
  })

  fastify.ready((err) => {
    expect(err.message).toBe('Failed building the serialization schema for GET: /, due to error CUSTOM_ERROR')
    expect(err.statusCode).toBe(500)
    expect(err.code).toBe('XUFA_ERR_SCH_SERIALIZATION_BUILD')
    testDone()
  })
})

test('Errors in serializer send to errorHandler', async () => {
  let savedError

  const fastify = Fastify()
  fastify.get('/', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            power: { type: 'string' }
          },
          required: ['name']
        }
      }
    }

  }, function (req, reply) {
    reply.code(200).send({ no: 'thing' })
  })
  fastify.setErrorHandler((error, request, reply) => {
    savedError = error
    reply.code(500).send(error)
  })

  const res = await fastify.inject('/')

  expect(res.statusCode).toBe(500)

  // t.assert.deepStrictEqual(savedError, new Error('"name" is required!'));
  expect(res.json()).toEqual({
    statusCode: 500,
    error: 'Internal Server Error',
    message: '"name" is required!'
  })
  expect(savedError).toBeTruthy()
  expect(savedError.serialization).toBeTruthy()
})

test('capital X', (testDone) => {
  expect.assertions(3)

  const fastify = Fastify()
  fastify.get('/', {
    schema: {
      response: {
        '2XX': {
          type: 'object',
          properties: {
            name: { type: 'string' },
            work: { type: 'string' }
          }
        }
      }
    }
  }, function (req, reply) {
    reply.code(200).send({ name: 'Foo', work: 'Bar', nick: 'Boo' })
  })

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.json()).toEqual({ name: 'Foo', work: 'Bar' })
    expect(res.statusCode).toBe(200)
    testDone()
  })
})

test('allow default as status code and used as last fallback', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.route({
    url: '/',
    method: 'GET',
    schema: {
      response: {
        default: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            work: { type: 'string' }
          }
        }
      }
    },
    handler: (req, reply) => {
      reply.code(200).send({ name: 'Foo', work: 'Bar', nick: 'Boo' })
    }
  })

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.json()).toEqual({ name: 'Foo', work: 'Bar' })
    expect(res.statusCode).toBe(200)
    testDone()
  })
})

test('response schema is applied when Content-Type has whitespace before parameters', (testDone) => {
  expect.assertions(3)

  const fastify = Fastify()
  fastify.get('/', {
    schema: {
      response: {
        200: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['public'],
                additionalProperties: false,
                properties: {
                  public: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, function (req, reply) {
    reply.header('Content-Type', 'application/json ; charset=utf-8')
    reply.send({ public: 'ok', secret: 'SHOULD_BE_STRIPPED' })
  })

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ public: 'ok' })
    testDone()
  })
})

test('response schema is applied when Content-Type has tab before semicolon', (testDone) => {
  expect.assertions(3)

  const fastify = Fastify()
  fastify.get('/', {
    schema: {
      response: {
        200: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['public'],
                additionalProperties: false,
                properties: {
                  public: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, function (req, reply) {
    reply.header('Content-Type', 'application/json\t; charset=utf-8')
    reply.send({ public: 'ok', secret: 'SHOULD_BE_STRIPPED' })
  })

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ public: 'ok' })
    testDone()
  })
})

test('response schema is applied when Content-Type has trailing semicolon only', (testDone) => {
  expect.assertions(3)

  const fastify = Fastify()
  fastify.get('/', {
    schema: {
      response: {
        200: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['public'],
                additionalProperties: false,
                properties: {
                  public: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, function (req, reply) {
    reply.header('Content-Type', 'application/json ;')
    reply.send({ public: 'ok', secret: 'SHOULD_BE_STRIPPED' })
  })

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ public: 'ok' })
    testDone()
  })
})
