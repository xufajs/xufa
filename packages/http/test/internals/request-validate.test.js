'use strict'


const Ajv = require('ajv')
const { kRequestCacheValidateFns, kRouteContext } = require('../../lib/symbols')
const Fastify = require('../..')

const defaultSchema = {
  type: 'object',
  required: ['hello'],
  properties: {
    hello: { type: 'string' },
    world: { type: 'string' }
  }
}

const requestSchema = {
  params: {
    type: 'object',
    properties: {
      id: {
        type: 'integer',
        minimum: 1
      }
    }
  },
  querystring: {
    type: 'object',
    properties: {
      foo: {
        type: 'string',
        enum: ['bar']
      }
    }
  },
  body: defaultSchema,
  headers: {
    type: 'object',
    properties: {
      'x-foo': {
        type: 'string'
      }
    }
  }
}

describe('#compileValidationSchema', () => {

test('Should return a function - Route without schema', async () => {
    const fastify = Fastify()

    expect.assertions(3)

    fastify.get('/', (req, reply) => {
      const validate = req.compileValidationSchema(defaultSchema)

      expect(validate instanceof Function).toBeTruthy()
      expect(validate({ hello: 'world' })).toBeTruthy()
      expect(validate({ world: 'foo' })).toBeFalsy()

      reply.send({ hello: 'world' })
    })

    await fastify.inject({
      path: '/',
      method: 'GET'
    })
  })
test('Validate function errors property should be null after validation when input is valid', async () => {
    const fastify = Fastify()

    expect.assertions(3)

    fastify.get('/', (req, reply) => {
      const validate = req.compileValidationSchema(defaultSchema)

      expect(validate({ hello: 'world' })).toBeTruthy()
      expect(Object.hasOwn(validate, 'errors')).toBeTruthy()
      expect(validate.errors).toBe(null)

      reply.send({ hello: 'world' })
    })

    await fastify.inject({
      path: '/',
      method: 'GET'
    })
  })
test('Validate function errors property should be an array of errors after validation when input is valid', async () => {
    const fastify = Fastify()

    expect.assertions(4)

    fastify.get('/', (req, reply) => {
      const validate = req.compileValidationSchema(defaultSchema)

      expect(validate({ world: 'foo' })).toBeFalsy()
      expect(Object.hasOwn(validate, 'errors')).toBeTruthy()
      expect(Array.isArray(validate.errors)).toBeTruthy()
      expect(validate.errors.length > 0).toBeTruthy()

      reply.send({ hello: 'world' })
    })

    await fastify.inject({
      path: '/',
      method: 'GET'
    })
  })
test('Should reuse the validate fn across multiple invocations - Route without schema', async () => {
      const fastify = Fastify()
      let validate = null
      let counter = 0

      expect.assertions(16)

      fastify.get('/', (req, reply) => {
        counter++
        if (counter > 1) {
          const newValidate = req.compileValidationSchema(defaultSchema)
          expect(validate).toBe(newValidate)
          validate = newValidate
        } else {
          validate = req.compileValidationSchema(defaultSchema)
        }

        expect(validate instanceof Function).toBeTruthy()
        expect(validate({ hello: 'world' })).toBeTruthy()
        expect(validate({ world: 'foo' })).toBeFalsy()

        reply.send({ hello: 'world' })
      })

      await Promise.all([
        fastify.inject({
          path: '/',
          method: 'GET'
        }),
        fastify.inject({
          path: '/',
          method: 'GET'
        }),
        fastify.inject({
          path: '/',
          method: 'GET'
        }),
        fastify.inject({
          path: '/',
          method: 'GET'
        })
      ])

      expect(counter).toBe(4)
    })
test('Should return a function - Route with schema', async () => {
    const fastify = Fastify()

    expect.assertions(3)

    fastify.post(
      '/',
      {
        schema: {
          body: defaultSchema
        }
      },
      (req, reply) => {
        const validate = req.compileValidationSchema(defaultSchema)

        expect(validate instanceof Function).toBeTruthy()
        expect(validate({ hello: 'world' })).toBeTruthy()
        expect(validate({ world: 'foo' })).toBeFalsy()

        reply.send({ hello: 'world' })
      }
    )

    await fastify.inject({
      path: '/',
      method: 'POST',
      payload: {
        hello: 'world',
        world: 'foo'
      }
    })
  })
test('Should use the custom validator compiler for the route', async () => {
      const fastify = Fastify()
      let called = 0
      const custom = ({ schema, httpPart, url, method }) => {
        expect(schema).toBe(defaultSchema)
        expect(url).toBe('/')
        expect(method).toBe('GET')
        expect(httpPart).toBe('querystring')

        return input => {
          called++
          expect(input).toEqual({ hello: 'world' })
          return true
        }
      }

      expect.assertions(10)

      fastify.get('/', { validatorCompiler: custom }, (req, reply) => {
        const first = req.compileValidationSchema(defaultSchema, 'querystring')
        const second = req.compileValidationSchema(defaultSchema, 'querystring')

        expect(first).toBe(second)
        expect(first({ hello: 'world' })).toBeTruthy()
        expect(second({ hello: 'world' })).toBeTruthy()
        expect(called).toBe(2)

        reply.send({ hello: 'world' })
      })

      await fastify.inject({
        path: '/',
        method: 'GET'
      })
    })
test('Should instantiate a WeakMap when executed for first time', async () => {
      const fastify = Fastify()

      expect.assertions(5)

      fastify.get('/', (req, reply) => {
        expect(req[kRouteContext][kRequestCacheValidateFns]).toBe(null)
        expect(req.compileValidationSchema(defaultSchema) instanceof Function).toBeTruthy()
        expect(req[kRouteContext][kRequestCacheValidateFns] instanceof WeakMap).toBeTruthy()
        expect(req.compileValidationSchema(Object.assign({}, defaultSchema)) instanceof Function).toBeTruthy()
        expect(req[kRouteContext][kRequestCacheValidateFns] instanceof WeakMap).toBeTruthy()

        reply.send({ hello: 'world' })
      })

      await fastify.inject({
        path: '/',
        method: 'GET'
      })
    })
})

describe('#getValidationFunction', () => {

test('Should return a validation function', async () => {
    const fastify = Fastify()

    expect.assertions(1)

    fastify.get('/', (req, reply) => {
      const original = req.compileValidationSchema(defaultSchema)
      const referenced = req.getValidationFunction(defaultSchema)

      expect(original).toBe(referenced)

      reply.send({ hello: 'world' })
    })

    await fastify.inject({
      path: '/',
      method: 'GET'
    })
  })
test('Validate function errors property should be null after validation when input is valid', async () => {
    const fastify = Fastify()

    expect.assertions(3)

    fastify.get('/', (req, reply) => {
      req.compileValidationSchema(defaultSchema)
      const validate = req.getValidationFunction(defaultSchema)

      expect(validate({ hello: 'world' })).toBeTruthy()
      expect(Object.hasOwn(validate, 'errors')).toBeTruthy()
      expect(validate.errors).toBe(null)

      reply.send({ hello: 'world' })
    })

    await fastify.inject({
      path: '/',
      method: 'GET'
    })
  })
test('Validate function errors property should be an array of errors after validation when input is valid', async () => {
    const fastify = Fastify()

    expect.assertions(4)

    fastify.get('/', (req, reply) => {
      req.compileValidationSchema(defaultSchema)
      const validate = req.getValidationFunction(defaultSchema)

      expect(validate({ world: 'foo' })).toBeFalsy()
      expect(Object.hasOwn(validate, 'errors')).toBeTruthy()
      expect(Array.isArray(validate.errors)).toBeTruthy()
      expect(validate.errors.length > 0).toBeTruthy()

      reply.send({ hello: 'world' })
    })

    await fastify.inject({
      path: '/',
      method: 'GET'
    })
  })
test('Should return undefined if no schema compiled', async () => {
    const fastify = Fastify()

    expect.assertions(2)

    fastify.get('/', (req, reply) => {
      const validate = req.getValidationFunction(defaultSchema)
      expect(validate).toBeFalsy()

      const validateFn = req.getValidationFunction(42)
      expect(validateFn).toBeFalsy()

      reply.send({ hello: 'world' })
    })

    await fastify.inject('/')
  })
test('Should return the validation function from each HTTP part', async () => {
      const fastify = Fastify()
      let headerValidation = null
      let customValidation = null

      expect.assertions(15)

      fastify.post(
        '/:id',
        {
          schema: requestSchema
        },
        (req, reply) => {
          const { params } = req

          switch (params.id) {
            case 1:
              customValidation = req.compileValidationSchema(defaultSchema)
              expect(req.getValidationFunction('body')).toBeTruthy()
              expect(req.getValidationFunction('body')({ hello: 'world' })).toBeTruthy()
              expect(req.getValidationFunction('body')({ world: 'hello' })).toBeFalsy()
              break
            case 2:
              headerValidation = req.getValidationFunction('headers')
              expect(headerValidation).toBeTruthy()
              expect(headerValidation({ 'x-foo': 'world' })).toBeTruthy()
              expect(headerValidation({ 'x-foo': [] })).toBeFalsy()
              break
            case 3:
              expect(req.getValidationFunction('params')).toBeTruthy()
              expect(req.getValidationFunction('params')({ id: 123 })).toBeTruthy()
              expect(req.getValidationFunction('params'({ id: 1.2 }))).toBeFalsy()
              break
            case 4:
              expect(req.getValidationFunction('querystring')).toBeTruthy()
              expect(req.getValidationFunction('querystring')({ foo: 'bar' })).toBeTruthy()
              expect(req.getValidationFunction('querystring')({ foo: 'not-bar' })).toBeFalsy()
              break
            case 5:
              expect(customValidation).toBe(req.getValidationFunction(defaultSchema))
              expect(customValidation({ hello: 'world' })).toBeTruthy()
              expect(customValidation({})).toBeFalsy()
              expect(headerValidation).toBe(req.getValidationFunction('headers'))
              break
            default:
              expect.fail('Invalid id')
          }

          reply.send({ hello: 'world' })
        }
      )

      const promises = []

      for (let i = 1; i < 6; i++) {
        promises.push(
          fastify.inject({
            path: `/${i}`,
            method: 'post',
            query: { foo: 'bar' },
            payload: {
              hello: 'world'
            },
            headers: {
              'x-foo': 'x-bar'
            }
          })
        )
      }

      await Promise.all(promises)
    })
test('Should not set a WeakMap if there is no schema', async () => {
    const fastify = Fastify()

    expect.assertions(1)

    fastify.get('/', (req, reply) => {
      req.getValidationFunction(defaultSchema)
      req.getValidationFunction('body')

      expect(req[kRouteContext][kRequestCacheValidateFns]).toBe(null)
      reply.send({ hello: 'world' })
    })

    await fastify.inject({
      path: '/',
      method: 'GET'
    })
  })
})

describe('#validate', () => {

test('Should return true/false if input valid - Route without schema', async () => {
      const fastify = Fastify()

      expect.assertions(2)

      fastify.get('/', (req, reply) => {
        const isNotValid = req.validateInput({ world: 'string' }, defaultSchema)
        const isValid = req.validateInput({ hello: 'string' }, defaultSchema)

        expect(isNotValid).toBeFalsy()
        expect(isValid).toBeTruthy()

        reply.send({ hello: 'world' })
      })

      await fastify.inject({
        path: '/',
        method: 'GET'
      })
    })
test('Should use the custom validator compiler for the route', async () => {
      const fastify = Fastify()
      let called = 0
      const custom = ({ schema, httpPart, url, method }) => {
        expect(schema).toBe(defaultSchema)
        expect(url).toBe('/')
        expect(method).toBe('GET')
        expect(httpPart).toBe('querystring')

        return input => {
          called++
          expect(input).toEqual({ hello: 'world' })
          return true
        }
      }

      expect.assertions(9)

      fastify.get('/', { validatorCompiler: custom }, (req, reply) => {
        const ok = req.validateInput(
          { hello: 'world' },
          defaultSchema,
          'querystring'
        )
        const ok2 = req.validateInput({ hello: 'world' }, defaultSchema)

        expect(ok).toBeTruthy()
        expect(ok2).toBeTruthy()
        expect(called).toBe(2)

        reply.send({ hello: 'world' })
      })

      await fastify.inject({
        path: '/',
        method: 'GET'
      })
    })
test('Should return true/false if input valid - With Schema for Route defined', async () => {
      const fastify = Fastify()

      expect.assertions(8)

      fastify.post(
        '/:id',
        {
          schema: requestSchema
        },
        (req, reply) => {
          const { params } = req

          switch (params.id) {
            case 1:
              expect(req.validateInput({ hello: 'world' }, 'body')).toBeTruthy()
              expect(req.validateInput({ hello: [], world: 'foo' }, 'body')).toBeFalsy()
              break
            case 2:
              expect(req.validateInput({ foo: 'something' }, 'querystring')).toBeFalsy()
              expect(req.validateInput({ foo: 'bar' }, 'querystring')).toBeTruthy()
              break
            case 3:
              expect(req.validateInput({ 'x-foo': [] }, 'headers')).toBeFalsy()
              expect(req.validateInput({ 'x-foo': 'something' }, 'headers')).toBeTruthy()
              break
            case 4:
              expect(req.validateInput({ id: params.id }, 'params')).toBeTruthy()
              expect(req.validateInput({ id: 0 }, 'params')).toBeFalsy()
              break
            default:
              expect.fail('Invalid id')
          }

          reply.send({ hello: 'world' })
        }
      )

      const promises = []

      for (let i = 1; i < 5; i++) {
        promises.push(
          fastify.inject({
            path: `/${i}`,
            method: 'post',
            query: { foo: 'bar' },
            payload: {
              hello: 'world'
            },
            headers: {
              'x-foo': 'x-bar'
            }
          })
        )
      }

      await Promise.all(promises)
    })
test('Should throw if missing validation fn for HTTP part and not schema provided', async () => {
      const fastify = Fastify()

      expect.assertions(10)

      fastify.get('/:id', (req, reply) => {
        const { params } = req

        switch (parseInt(params.id)) {
          case 1:
            req.validateInput({}, 'body')
            break
          case 2:
            req.validateInput({}, 'querystring')
            break
          case 3:
            req.validateInput({}, 'query')
            break
          case 4:
            req.validateInput({ 'x-foo': [] }, 'headers')
            break
          case 5:
            req.validateInput({ id: 0 }, 'params')
            break
          default:
            expect.fail('Invalid id')
        }
      })

      const promises = []

      for (let i = 1; i < 6; i++) {
        promises.push(
          (async j => {
            const response = await fastify.inject(`/${j}`)

            const result = response.json()
            expect(result.statusCode).toBe(500)
            expect(result.code).toBe('XUFA_ERR_REQ_INVALID_VALIDATION_INVOCATION')
          })(i)
        )
      }

      await Promise.all(promises)
    })
test('Should throw if missing validation fn for HTTP part and not valid schema provided', async () => {
      const fastify = Fastify()

      expect.assertions(10)

      fastify.get('/:id', (req, reply) => {
        const { params } = req

        switch (parseInt(params.id)) {
          case 1:
            req.validateInput({}, 1, 'body')
            break
          case 2:
            req.validateInput({}, [], 'querystring')
            break
          case 3:
            req.validateInput({}, '', 'query')
            break
          case 4:
            req.validateInput({ 'x-foo': [] }, null, 'headers')
            break
          case 5:
            req.validateInput({ id: 0 }, () => {}, 'params')
            break
          default:
            expect.fail('Invalid id')
        }
      })

      const promises = []

      for (let i = 1; i < 6; i++) {
        promises.push(
          (async j => {
            const response = await fastify.inject({
              path: `/${j}`,
              method: 'GET'
            })

            const result = response.json()
            expect(result.statusCode).toBe(500)
            expect(result.code).toBe('XUFA_ERR_REQ_INVALID_VALIDATION_INVOCATION')
          })(i)
        )
      }

      await Promise.all(promises)
    })
test('Should throw if invalid schema passed', async () => {
    const fastify = Fastify()

    expect.assertions(10)

    fastify.get('/:id', (req, reply) => {
      const { params } = req

      switch (parseInt(params.id)) {
        case 1:
          req.validateInput({}, 1)
          break
        case 2:
          req.validateInput({}, '')
          break
        case 3:
          req.validateInput({}, [])
          break
        case 4:
          req.validateInput({ 'x-foo': [] }, null)
          break
        case 5:
          req.validateInput({ id: 0 }, () => {})
          break
        default:
          expect.fail('Invalid id')
      }
    })

    const promises = []

    for (let i = 1; i < 6; i++) {
      promises.push(
        (async j => {
          const response = await fastify.inject({
            path: `/${j}`,
            method: 'GET'
          })

          const result = response.json()
          expect(result.statusCode).toBe(500)
          expect(result.code).toBe('XUFA_ERR_REQ_INVALID_VALIDATION_INVOCATION')
        })(i)
      )
    }

    await Promise.all(promises)
  })
test('Should set a WeakMap if compiling the very first schema', async () => {
      const fastify = Fastify()

      expect.assertions(3)

      fastify.get('/', (req, reply) => {
        expect(req[kRouteContext][kRequestCacheValidateFns]).toBe(null)
        expect(req.validateInput({ hello: 'world' }, defaultSchema)).toBe(true)
        expect(req[kRouteContext][kRequestCacheValidateFns] instanceof WeakMap).toBeTruthy()

        reply.send({ hello: 'world' })
      })

      await fastify.inject({
        path: '/',
        method: 'GET'
      })
    })
})

describe('Nested Context', () => {

describe('Level_1', () => {

describe('#compileValidationSchema', () => {

test('Should return a function - Route without schema', async () => {
        const fastify = Fastify()

        fastify.register((instance, opts, next) => {
          instance.get('/', (req, reply) => {
            const validate = req.compileValidationSchema(defaultSchema)

            expect(validate).toBeTruthy()
            expect(validate({ hello: 'world' })).toBeTruthy()
            expect(validate({ world: 'foo' })).toBeFalsy()

            reply.send({ hello: 'world' })
          })

          next()
        })

        expect.assertions(3)

        await fastify.inject({
          path: '/',
          method: 'GET'
        })
      })
test('Should reuse the validate fn across multiple invocations - Route without schema', async () => {
          const fastify = Fastify()
          let validate = null
          let counter = 0

          expect.assertions(16)

          fastify.register((instance, opts, next) => {
            instance.get('/', (req, reply) => {
              counter++
              if (counter > 1) {
                const newValidate = req.compileValidationSchema(defaultSchema)
                expect(validate).toBe(newValidate)
                validate = newValidate
              } else {
                validate = req.compileValidationSchema(defaultSchema)
              }

              expect(validate).toBeTruthy()
              expect(validate({ hello: 'world' })).toBeTruthy()
              expect(validate({ world: 'foo' })).toBeFalsy()

              reply.send({ hello: 'world' })
            })

            next()
          })

          await Promise.all([
            fastify.inject('/'),
            fastify.inject('/'),
            fastify.inject('/'),
            fastify.inject('/')
          ])

          expect(counter).toBe(4)
        })
test('Should return a function - Route with schema', async () => {
        const fastify = Fastify()

        expect.assertions(3)

        fastify.register((instance, opts, next) => {
          instance.post(
            '/',
            {
              schema: {
                body: defaultSchema
              }
            },
            (req, reply) => {
              const validate = req.compileValidationSchema(defaultSchema)

              expect(validate).toBeTruthy()
              expect(validate({ hello: 'world' })).toBeTruthy()
              expect(validate({ world: 'foo' })).toBeFalsy()

              reply.send({ hello: 'world' })
            }
          )

          next()
        })

        await fastify.inject({
          path: '/',
          method: 'POST',
          payload: {
            hello: 'world',
            world: 'foo'
          }
        })
      })
test('Should use the custom validator compiler for the route', async () => {
          const fastify = Fastify()
          let called = 0

          expect.assertions(10)

          fastify.register((instance, opts, next) => {
            const custom = ({ schema, httpPart, url, method }) => {
              expect(schema).toBe(defaultSchema)
              expect(url).toBe('/')
              expect(method).toBe('GET')
              expect(httpPart).toBe('querystring')

              return input => {
                called++
                expect(input).toEqual({ hello: 'world' })
                return true
              }
            }

            fastify.get('/', { validatorCompiler: custom }, (req, reply) => {
              const first = req.compileValidationSchema(
                defaultSchema,
                'querystring'
              )
              const second = req.compileValidationSchema(
                defaultSchema,
                'querystring'
              )

              expect(first).toBe(second)
              expect(first({ hello: 'world' })).toBeTruthy()
              expect(second({ hello: 'world' })).toBeTruthy()
              expect(called).toBe(2)

              reply.send({ hello: 'world' })
            })

            next()
          })

          await fastify.inject('/')
        })
test('Should compile the custom validation - nested with schema.headers', async () => {
        const fastify = Fastify()
        let called = false

        const schemaWithHeaders = {
          headers: {
            'x-foo': {
              type: 'string'
            }
          }
        }

        const custom = ({ schema, httpPart, url, method }) => {
          if (called) return () => true
          // only custom validators keep the same headers object
          expect(schema).toBe(schemaWithHeaders.headers)
          expect(url).toBe('/')
          expect(httpPart).toBe('headers')
          called = true
          return () => true
        }

        expect.assertions(4)

        fastify.setValidatorCompiler(custom)

        fastify.register((instance, opts, next) => {
          instance.get('/', { schema: schemaWithHeaders }, (req, reply) => {
            expect(called).toBe(true)

            reply.send({ hello: 'world' })
          })

          next()
        })

        await fastify.inject('/')
      })
})
describe('#getValidationFunction', () => {

test('Should return a validation function', async () => {
        const fastify = Fastify()

        expect.assertions(1)

        fastify.register((instance, opts, next) => {
          instance.get('/', (req, reply) => {
            const original = req.compileValidationSchema(defaultSchema)
            const referenced = req.getValidationFunction(defaultSchema)

            expect(original).toBe(referenced)

            reply.send({ hello: 'world' })
          })

          next()
        })

        await fastify.inject('/')
      })
test('Should return undefined if no schema compiled', async () => {
        const fastify = Fastify()

        expect.assertions(1)

        fastify.register((instance, opts, next) => {
          instance.get('/', (req, reply) => {
            const validate = req.getValidationFunction(defaultSchema)

            expect(validate).toBeFalsy()

            reply.send({ hello: 'world' })
          })

          next()
        })

        await fastify.inject('/')
      })
test('Should return the validation function from each HTTP part', async () => {
          const fastify = Fastify()
          let headerValidation = null
          let customValidation = null

          expect.assertions(15)

          fastify.register((instance, opts, next) => {
            instance.post(
              '/:id',
              {
                schema: requestSchema
              },
              (req, reply) => {
                const { params } = req

                switch (params.id) {
                  case 1:
                    customValidation = req.compileValidationSchema(
                      defaultSchema
                    )
                    expect(req.getValidationFunction('body')).toBeTruthy()
                    expect(req.getValidationFunction('body')({ hello: 'world' })).toBeTruthy()
                    expect(req.getValidationFunction('body')({ world: 'hello' })).toBeFalsy()
                    break
                  case 2:
                    headerValidation = req.getValidationFunction('headers')
                    expect(headerValidation).toBeTruthy()
                    expect(headerValidation({ 'x-foo': 'world' })).toBeTruthy()
                    expect(headerValidation({ 'x-foo': [] })).toBeFalsy()
                    break
                  case 3:
                    expect(req.getValidationFunction('params')).toBeTruthy()
                    expect(req.getValidationFunction('params')({ id: 123 })).toBeTruthy()
                    expect(req.getValidationFunction('params'({ id: 1.2 }))).toBeFalsy()
                    break
                  case 4:
                    expect(req.getValidationFunction('querystring')).toBeTruthy()
                    expect(req.getValidationFunction('querystring')({ foo: 'bar' })).toBeTruthy()
                    expect(req.getValidationFunction('querystring')({
                      foo: 'not-bar'
                    })).toBeFalsy()
                    break
                  case 5:
                    expect(customValidation).toBe(req.getValidationFunction(defaultSchema))
                    expect(customValidation({ hello: 'world' })).toBeTruthy()
                    expect(customValidation({})).toBeFalsy()
                    expect(headerValidation).toBe(req.getValidationFunction('headers'))
                    break
                  default:
                    expect.fail('Invalid id')
                }

                reply.send({ hello: 'world' })
              }
            )

            next()
          })
          const promises = []

          for (let i = 1; i < 6; i++) {
            promises.push(
              fastify.inject({
                path: `/${i}`,
                method: 'post',
                query: { foo: 'bar' },
                payload: {
                  hello: 'world'
                },
                headers: {
                  'x-foo': 'x-bar'
                }
              })
            )
          }

          await Promise.all(promises)
        })
test('Should return a validation function - nested', async () => {
        const fastify = Fastify()
        let called = false
        const custom = ({ schema, httpPart, url, method }) => {
          expect(schema).toBe(defaultSchema)
          expect(url).toBe('/')
          expect(method).toBe('GET')
          expect(httpPart).toBeFalsy()

          called = true
          return () => true
        }

        expect.assertions(6)

        fastify.setValidatorCompiler(custom)

        fastify.register((instance, opts, next) => {
          instance.get('/', (req, reply) => {
            const original = req.compileValidationSchema(defaultSchema)
            const referenced = req.getValidationFunction(defaultSchema)

            expect(original).toBe(referenced)
            expect(called).toBe(true)

            reply.send({ hello: 'world' })
          })

          next()
        })

        await fastify.inject('/')
      })
test('Should return undefined if no schema compiled - nested', async () => {
          const fastify = Fastify()
          let called = 0
          const custom = ({ schema, httpPart, url, method }) => {
            called++
            return () => true
          }

          expect.assertions(3)

          fastify.setValidatorCompiler(custom)

          fastify.get('/', (req, reply) => {
            const validate = req.compileValidationSchema(defaultSchema)

            expect(typeof validate).toBe('function')

            reply.send({ hello: 'world' })
          })

          fastify.register(
            (instance, opts, next) => {
              instance.get('/', (req, reply) => {
                const validate = req.getValidationFunction(defaultSchema)

                expect(validate).toBeFalsy()
                expect(called).toBe(1)

                reply.send({ hello: 'world' })
              })

              next()
            },
            { prefix: '/nested' }
          )

          await fastify.inject('/')
          await fastify.inject('/nested')
        })
test('Should per-route defined validation compiler', async () => {
        const fastify = Fastify()
        let validateParent
        let validateChild
        let calledParent = 0
        let calledChild = 0
        const customParent = ({ schema, httpPart, url, method }) => {
          calledParent++
          return () => true
        }

        const customChild = ({ schema, httpPart, url, method }) => {
          calledChild++
          return () => true
        }

        expect.assertions(5)

        fastify.setValidatorCompiler(customParent)

        fastify.get('/', (req, reply) => {
          validateParent = req.compileValidationSchema(defaultSchema)

          expect(typeof validateParent).toBe('function')

          reply.send({ hello: 'world' })
        })

        fastify.register(
          (instance, opts, next) => {
            instance.get(
              '/',
              {
                validatorCompiler: customChild
              },
              (req, reply) => {
                const validate1 = req.compileValidationSchema(defaultSchema)
                validateChild = req.getValidationFunction(defaultSchema)

                expect(validate1).toBe(validateChild)
                expect(validateParent).not.toBe(validateChild)
                expect(calledParent).toBe(1)
                expect(calledChild).toBe(1)

                reply.send({ hello: 'world' })
              }
            )

            next()
          },
          { prefix: '/nested' }
        )

        await fastify.inject('/')
        await fastify.inject('/nested')
      })
})
describe('#validate', () => {

test('Should return true/false if input valid - Route without schema', async () => {
          const fastify = Fastify()

          expect.assertions(2)

          fastify.register((instance, opts, next) => {
            instance.get('/', (req, reply) => {
              const isNotValid = req.validateInput(
                { world: 'string' },
                defaultSchema
              )
              const isValid = req.validateInput({ hello: 'string' }, defaultSchema)

              expect(isNotValid).toBeFalsy()
              expect(isValid).toBeTruthy()

              reply.send({ hello: 'world' })
            })

            next()
          })

          await fastify.inject('/')
        })
test('Should use the custom validator compiler for the route', async () => {
          const fastify = Fastify()
          let parentCalled = 0
          let childCalled = 0
          const customParent = () => {
            parentCalled++

            return () => true
          }

          const customChild = ({ schema, httpPart, url, method }) => {
            expect(schema).toBe(defaultSchema)
            expect(url).toBe('/')
            expect(method).toBe('GET')
            expect(httpPart).toBe('querystring')

            return input => {
              childCalled++
              expect(input).toEqual({ hello: 'world' })
              return true
            }
          }

          expect.assertions(10)

          fastify.setValidatorCompiler(customParent)

          fastify.register((instance, opts, next) => {
            instance.get(
              '/',
              { validatorCompiler: customChild },
              (req, reply) => {
                const ok = req.validateInput(
                  { hello: 'world' },
                  defaultSchema,
                  'querystring'
                )
                const ok2 = req.validateInput({ hello: 'world' }, defaultSchema)

                expect(ok).toBeTruthy()
                expect(ok2).toBeTruthy()
                expect(childCalled).toBe(2)
                expect(parentCalled).toBe(0)

                reply.send({ hello: 'world' })
              }
            )

            next()
          })

          await fastify.inject('/')
        })
test('Should return true/false if input valid - With Schema for Route defined and scoped validator compiler', async () => {
          const validator = new Ajv()
          const fastify = Fastify()
          const childCounter = {
            query: 0,
            body: 0,
            params: 0,
            headers: 0
          }
          let parentCalled = 0

          const parent = () => {
            parentCalled++
            return () => true
          }
          const child = ({ schema, httpPart, url, method }) => {
            httpPart = httpPart === 'querystring' ? 'query' : httpPart
            const validate = validator.compile(schema)

            return input => {
              childCounter[httpPart]++
              return validate(input)
            }
          }

          expect.assertions(13)

          fastify.setValidatorCompiler(parent)
          fastify.register((instance, opts, next) => {
            instance.setValidatorCompiler(child)
            instance.post(
              '/:id',
              {
                schema: requestSchema
              },
              (req, reply) => {
                const { params } = req

                switch (parseInt(params.id)) {
                  case 1:
                    expect(req.validateInput({ hello: 'world' }, 'body')).toBeTruthy()
                    expect(req.validateInput({ hello: [], world: 'foo' }, 'body')).toBeFalsy()
                    break
                  case 2:
                    expect(req.validateInput({ foo: 'something' }, 'querystring')).toBeFalsy()
                    expect(req.validateInput({ foo: 'bar' }, 'querystring')).toBeTruthy()
                    break
                  case 3:
                    expect(req.validateInput({ 'x-foo': [] }, 'headers')).toBeFalsy()
                    expect(req.validateInput({ 'x-foo': 'something' }, 'headers')).toBeTruthy()
                    break
                  case 4:
                    expect(req.validateInput({ id: 1 }, 'params')).toBeTruthy()
                    expect(req.validateInput({ id: params.id }, 'params')).toBeFalsy()
                    break
                  default:
                    expect.fail('Invalid id')
                }

                reply.send({ hello: 'world' })
              }
            )

            next()
          })

          const promises = []

          for (let i = 1; i < 5; i++) {
            promises.push(
              fastify.inject({
                path: `/${i}`,
                method: 'post',
                query: {},
                payload: {
                  hello: 'world'
                }
              })
            )
          }

          await Promise.all(promises)

          expect(childCounter.query).toBe(6) // 4 calls made + 2 custom validations
          expect(childCounter.headers).toBe(6) // 4 calls made + 2 custom validations
          expect(childCounter.body).toBe(6) // 4 calls made + 2 custom validations
          expect(childCounter.params).toBe(6) // 4 calls made + 2 custom validations
          expect(parentCalled).toBe(0)
        })
})
})
})
