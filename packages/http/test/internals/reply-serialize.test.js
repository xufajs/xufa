'use strict'


const { kReplyCacheSerializeFns, kRouteContext } = require('../../lib/symbols')
const Fastify = require('@xufa/http')

function getDefaultSchema () {
  return {
    type: 'object',
    required: ['hello'],
    properties: {
      hello: { type: 'string' },
      world: { type: 'string' }
    }
  }
}

function getResponseSchema () {
  return {
    201: {
      type: 'object',
      required: ['status'],
      properties: {
        status: {
          type: 'string',
          enum: ['ok']
        },
        message: {
          type: 'string'
        }
      }
    },
    '4xx': {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['error']
        },
        code: {
          type: 'integer',
          minimum: 1
        },
        message: {
          type: 'string'
        }
      }
    },
    '3xx': {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              fullName: { type: 'string' },
              phone: { type: 'number' }
            }
          }
        }
      }
    }
  }
}

describe('Reply#compileSerializationSchema', () => {

test('Should return a serialization function', async () => {
    const fastify = Fastify()

    expect.assertions(4)

    fastify.get('/', (req, reply) => {
      const serialize = reply.compileSerializationSchema(getDefaultSchema())
      const input = { hello: 'world' }
      expect(serialize instanceof Function).toBeTruthy()
      expect(typeof serialize(input) === 'string').toBeTruthy()
      expect(serialize(input)).toBe(JSON.stringify(input))

      try {
        serialize({ world: 'foo' })
      } catch (err) {
        expect(err.message).toBe('"hello" is required!')
      }

      reply.send({ hello: 'world' })
    })

    await fastify.inject({
      path: '/',
      method: 'GET'
    })
  })
test('Should reuse the serialize fn across multiple invocations - Route without schema', async () => {
      const fastify = Fastify()
      let serialize = null
      let counter = 0

      expect.assertions(17)

      const schemaObj = getDefaultSchema()

      fastify.get('/', (req, reply) => {
        const input = { hello: 'world' }
        counter++
        if (counter > 1) {
          const newSerialize = reply.compileSerializationSchema(schemaObj)
          expect(serialize).toBe(newSerialize)
          serialize = newSerialize
        } else {
          expect(true).toBeTruthy()
          serialize = reply.compileSerializationSchema(schemaObj)
        }

        expect(serialize instanceof Function).toBeTruthy()
        expect(serialize(input)).toBe(JSON.stringify(input))

        try {
          serialize({ world: 'foo' })
        } catch (err) {
          expect(err.message).toBe('"hello" is required!')
        }

        reply.send({ hello: 'world' })
      })

      await Promise.all([
        fastify.inject('/'),
        fastify.inject('/'),
        fastify.inject('/'),
        fastify.inject('/')
      ])

      expect(counter).toBe(4)
    })
test('Should use the custom serializer compiler for the route', async () => {
      const fastify = Fastify()
      let called = 0
      const custom = ({ schema, httpStatus, url, method }) => {
        expect(schema).toBe(schemaObj)
        expect(url).toBe('/')
        expect(method).toBe('GET')
        expect(httpStatus).toBe('201')

        return input => {
          called++
          expect(input).toEqual({ hello: 'world' })
          return JSON.stringify(input)
        }
      }

      const custom2 = ({ schema, httpStatus, url, method, contentType }) => {
        expect(schema).toBe(schemaObj)
        expect(url).toBe('/user')
        expect(method).toBe('GET')
        expect(httpStatus).toBe('3xx')
        expect(contentType).toBe('application/json')

        return input => {
          expect(input).toEqual({ fullName: 'Jone', phone: 1090243795 })
          return JSON.stringify(input)
        }
      }

      expect.assertions(17)
      const schemaObj = getDefaultSchema()

      fastify.get('/', { serializerCompiler: custom }, (req, reply) => {
        const input = { hello: 'world' }
        const first = reply.compileSerializationSchema(schemaObj, '201')
        const second = reply.compileSerializationSchema(schemaObj, '201')

        expect(first).toBe(second)
        expect(first(input)).toBeTruthy()
        expect(second(input)).toBeTruthy()
        expect(called).toBe(2)

        reply.send({ hello: 'world' })
      })

      fastify.get('/user', { serializerCompiler: custom2 }, (req, reply) => {
        const input = { fullName: 'Jone', phone: 1090243795 }
        const first = reply.compileSerializationSchema(schemaObj, '3xx', 'application/json')
        expect(first(input)).toBeTruthy()
        reply.send(input)
      })

      await fastify.inject({
        path: '/',
        method: 'GET'
      })

      await fastify.inject({
        path: '/user',
        method: 'GET'
      })
    })
test('Should build a WeakMap for cache when called', async () => {
    const fastify = Fastify()

    expect.assertions(4)

    fastify.get('/', (req, reply) => {
      const input = { hello: 'world' }

      expect(reply[kRouteContext][kReplyCacheSerializeFns]).toBe(null)
      expect(reply.compileSerializationSchema(getDefaultSchema())(input)).toBe(JSON.stringify(input))
      expect(reply[kRouteContext][kReplyCacheSerializeFns] instanceof WeakMap).toBeTruthy()
      expect(reply.compileSerializationSchema(getDefaultSchema())(input)).toBe(JSON.stringify(input))

      reply.send({ hello: 'world' })
    })

    await fastify.inject({
      path: '/',
      method: 'GET'
    })
  })
})

describe('Reply#getSerializationFunction', () => {

test('Should retrieve the serialization function from the Schema definition', async () => {
      const fastify = Fastify()
      const okInput201 = {
        status: 'ok',
        message: 'done!'
      }
      const notOkInput201 = {
        message: 'created'
      }
      const okInput4xx = {
        status: 'error',
        code: 2,
        message: 'oops!'
      }
      const notOkInput4xx = {
        status: 'error',
        code: 'something'
      }
      const okInput3xx = {
        fullName: 'Jone',
        phone: 0
      }
      const noOkInput3xx = {
        fullName: 'Jone',
        phone: 'phone'
      }
      let cached4xx
      let cached201
      let cachedJson3xx

      expect.assertions(13)

      const responseSchema = getResponseSchema()

      fastify.get(
        '/:id',
        {
          params: {
            type: 'object',
            properties: {
              id: {
                type: 'integer'
              }
            }
          },
          schema: {
            response: responseSchema
          }
        },
        (req, reply) => {
          const { id } = req.params

          if (Number(id) === 1) {
            const serialize4xx = reply.getSerializationFunction('4xx')
            const serialize201 = reply.getSerializationFunction(201)
            const serializeJson3xx = reply.getSerializationFunction('3xx', 'application/json')
            const serializeUndefined = reply.getSerializationFunction(undefined)

            cached4xx = serialize4xx
            cached201 = serialize201
            cachedJson3xx = serializeJson3xx

            expect(serialize4xx instanceof Function).toBeTruthy()
            expect(serialize201 instanceof Function).toBeTruthy()
            expect(serializeJson3xx instanceof Function).toBeTruthy()
            expect(serialize4xx(okInput4xx)).toBe(JSON.stringify(okInput4xx))
            expect(serialize201(okInput201)).toBe(JSON.stringify(okInput201))
            expect(serializeJson3xx(okInput3xx)).toBe(JSON.stringify(okInput3xx))
            expect(serializeUndefined).toBeFalsy()

            try {
              serialize4xx(notOkInput4xx)
            } catch (err) {
              expect(err.message).toBe('The value "something" cannot be converted to an integer.')
            }

            try {
              serialize201(notOkInput201)
            } catch (err) {
              expect(err.message).toBe('"status" is required!')
            }

            try {
              serializeJson3xx(noOkInput3xx)
            } catch (err) {
              expect(err.message).toBe('The value "phone" cannot be converted to a number.')
            }

            reply.status(201).send(okInput201)
          } else {
            const serialize201 = reply.getSerializationFunction(201)
            const serialize4xx = reply.getSerializationFunction('4xx')
            const serializeJson3xx = reply.getSerializationFunction('3xx', 'application/json')

            expect(serialize4xx).toBe(cached4xx)
            expect(serialize201).toBe(cached201)
            expect(serializeJson3xx).toBe(cachedJson3xx)
            reply.status(401).send(okInput4xx)
          }
        }
      )

      await Promise.all([
        fastify.inject('/1'),
        fastify.inject('/2')
      ])
    })
test('Should retrieve the serialization function from the cached one', async () => {
      const fastify = Fastify()

      const schemaObj = getDefaultSchema()

      const okInput = {
        hello: 'world',
        world: 'done!'
      }
      const notOkInput = {
        world: 'done!'
      }
      let cached

      expect.assertions(6)

      fastify.get(
        '/:id',
        {
          params: {
            type: 'object',
            properties: {
              id: {
                type: 'integer'
              }
            }
          }
        },
        (req, reply) => {
          const { id } = req.params

          if (Number(id) === 1) {
            const serialize = reply.compileSerializationSchema(schemaObj)

            expect(serialize instanceof Function).toBeTruthy()
            expect(serialize(okInput)).toBe(JSON.stringify(okInput))

            try {
              serialize(notOkInput)
            } catch (err) {
              expect(err.message).toBe('"hello" is required!')
            }

            cached = serialize
          } else {
            const serialize = reply.getSerializationFunction(schemaObj)

            expect(serialize).toBe(cached)
            expect(serialize(okInput)).toBe(JSON.stringify(okInput))

            try {
              serialize(notOkInput)
            } catch (err) {
              expect(err.message).toBe('"hello" is required!')
            }
          }

          reply.status(201).send(okInput)
        }
      )

      await Promise.all([
        fastify.inject('/1'),
        fastify.inject('/2')
      ])
    })
test('Should not instantiate a WeakMap if it is not needed', async () => {
    const fastify = Fastify()

    expect.assertions(4)

    fastify.get('/', (req, reply) => {
      expect(reply.getSerializationFunction(getDefaultSchema())).toBeFalsy()
      expect(reply[kRouteContext][kReplyCacheSerializeFns]).toBe(null)
      expect(reply.getSerializationFunction('200')).toBeFalsy()
      expect(reply[kRouteContext][kReplyCacheSerializeFns]).toBe(null)

      reply.send({ hello: 'world' })
    })

    await fastify.inject({
      path: '/',
      method: 'GET'
    })
  })
})

describe('Reply#serializeInput', () => {

test('Should throw if missed serialization function from HTTP status', async () => {
      const fastify = Fastify()

      expect.assertions(2)

      fastify.get('/', (req, reply) => {
        reply.serializeInput({}, 201)
      })

      const result = await fastify.inject({
        path: '/',
        method: 'GET'
      })

      expect(result.statusCode).toBe(500)
      expect(result.json()).toEqual({
        statusCode: 500,
        code: 'XUFA_ERR_MISSING_SERIALIZATION_FN',
        error: 'Internal Server Error',
        message: 'Missing serialization function. Key "201"'
      })
    })
test('Should throw if missed serialization function from HTTP status with specific content type', async () => {
      const fastify = Fastify()

      expect.assertions(2)

      fastify.get('/', {
        schema: {
          response: {
            '3xx': {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      fullName: { type: 'string' },
                      phone: { type: 'number' }
                    }
                  }
                }
              }
            }
          }
        }
      }, (req, reply) => {
        reply.serializeInput({}, '3xx', 'application/vnd.v1+json')
      })

      const result = await fastify.inject({
        path: '/',
        method: 'GET'
      })

      expect(result.statusCode).toBe(500)
      expect(result.json()).toEqual({
        statusCode: 500,
        code: 'XUFA_ERR_MISSING_CONTENTTYPE_SERIALIZATION_FN',
        error: 'Internal Server Error',
        message: 'Missing serialization function. Key "3xx:application/vnd.v1+json"'
      })
    })
test('Should use a serializer fn from HTTP status', async () => {
    const fastify = Fastify()
    const okInput201 = {
      status: 'ok',
      message: 'done!'
    }
    const notOkInput201 = {
      message: 'created'
    }
    const okInput4xx = {
      status: 'error',
      code: 2,
      message: 'oops!'
    }
    const notOkInput4xx = {
      status: 'error',
      code: 'something'
    }
    const okInput3xx = {
      fullName: 'Jone',
      phone: 0
    }
    const noOkInput3xx = {
      fullName: 'Jone',
      phone: 'phone'
    }

    expect.assertions(6)

    fastify.get(
      '/',
      {
        params: {
          type: 'object',
          properties: {
            id: {
              type: 'integer'
            }
          }
        },
        schema: {
          response: getResponseSchema()
        }
      },
      (req, reply) => {
        expect(reply.serializeInput(okInput4xx, '4xx')).toBe(JSON.stringify(okInput4xx))
        expect(reply.serializeInput(okInput201, 201)).toBe(JSON.stringify(okInput201))

        expect(reply.serializeInput(okInput3xx, {}, '3xx', 'application/json')).toBe(JSON.stringify(okInput3xx))

        try {
          reply.serializeInput(noOkInput3xx, '3xx', 'application/json')
        } catch (err) {
          expect(err.message).toBe('The value "phone" cannot be converted to a number.')
        }

        try {
          reply.serializeInput(notOkInput4xx, '4xx')
        } catch (err) {
          expect(err.message).toBe('The value "something" cannot be converted to an integer.')
        }

        try {
          reply.serializeInput(notOkInput201, 201)
        } catch (err) {
          expect(err.message).toBe('"status" is required!')
        }

        reply.status(204).send('')
      }
    )

    await fastify.inject({
      path: '/',
      method: 'GET'
    })
  })
test('Should compile a serializer out of a schema if serializer fn missed', async () => {
      let compilerCalled = 0
      let serializerCalled = 0
      const testInput = { hello: 'world' }
      const schemaObj = getDefaultSchema()
      const fastify = Fastify()
      const serializerCompiler = ({ schema, httpStatus, method, url }) => {
        expect(schema).toBe(schemaObj)
        expect(httpStatus).toBeFalsy()
        expect(method).toBe('GET')
        expect(url).toBe('/')

        compilerCalled++
        return input => {
          expect(input).toBe(testInput)
          serializerCalled++
          return JSON.stringify(input)
        }
      }

      expect.assertions(10)

      fastify.get('/', { serializerCompiler }, (req, reply) => {
        expect(reply.serializeInput(testInput, schemaObj)).toBe(JSON.stringify(testInput))

        expect(reply.serializeInput(testInput, schemaObj)).toBe(JSON.stringify(testInput))

        reply.status(201).send(testInput)
      })

      await fastify.inject({
        path: '/',
        method: 'GET'
      })

      expect(compilerCalled).toBe(1)
      expect(serializerCalled).toBe(2)
    })
test('Should use a cached serializer fn', async () => {
    let compilerCalled = 0
    let serializerCalled = 0
    let cached
    const testInput = { hello: 'world' }
    const schemaObj = getDefaultSchema()
    const fastify = Fastify()
    const serializer = input => {
      expect(input).toBe(testInput)
      serializerCalled++
      return JSON.stringify(input)
    }
    const serializerCompiler = ({ schema, httpStatus, method, url }) => {
      expect(schema).toBe(schemaObj)
      expect(httpStatus).toBeFalsy()
      expect(method).toBe('GET')
      expect(url).toBe('/')

      compilerCalled++
      return serializer
    }

    expect.assertions(12)

    fastify.get('/', { serializerCompiler }, (req, reply) => {
      expect(reply.serializeInput(testInput, schemaObj)).toBe(JSON.stringify(testInput))

      cached = reply.getSerializationFunction(schemaObj)

      expect(reply.serializeInput(testInput, schemaObj)).toBe(cached(testInput))

      reply.status(201).send(testInput)
    })

    await fastify.inject({
      path: '/',
      method: 'GET'
    })

    expect(cached).toBe(serializer)
    expect(compilerCalled).toBe(1)
    expect(serializerCalled).toBe(3)
  })
test('Should instantiate a WeakMap after first call', async () => {
    const fastify = Fastify()

    expect.assertions(3)

    fastify.get('/', (req, reply) => {
      const input = { hello: 'world' }
      expect(reply[kRouteContext][kReplyCacheSerializeFns]).toBe(null)
      expect(reply.serializeInput(input, getDefaultSchema())).toBe(JSON.stringify(input))
      expect(reply[kRouteContext][kReplyCacheSerializeFns] instanceof WeakMap).toBeTruthy()

      reply.send({ hello: 'world' })
    })

    await fastify.inject({
      path: '/',
      method: 'GET'
    })
  })
})

test('Reply#compileSerializationSchema omits absent metadata instead of passing null', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.setSerializerCompiler(({ httpStatus, contentType }) => {
    expect(httpStatus).toBe(undefined)
    expect(contentType).toBe(undefined)

    return input => JSON.stringify(input)
  })

  fastify.get('/', (req, reply) => {
    reply.compileSerializationSchema(getDefaultSchema())
    reply.send({ hello: 'world' })
  })

  await fastify.inject({ path: '/', method: 'GET' })
})
