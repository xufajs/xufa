'use strict'

const Ajv = require('ajv')
const Joi = require('joi')
const yup = require('yup')


module.exports.payloadMethod = function (method, t) {
  
  const fastify = require('..')()
  const upMethod = method.toUpperCase()
  const loMethod = method.toLowerCase()

  const opts = {
    schema: {
      body: {
        type: 'object',
        properties: {
          hello: {
            type: 'integer'
          }
        }
      }
    }
  }

  const ajv = new Ajv({ coerceTypes: true, removeAdditional: true })
  const optsWithCustomValidator = {
    schema: {
      body: {
        type: 'object',
        properties: {
          hello: {
            type: 'integer'
          }
        },
        additionalProperties: false
      }
    },
    validatorCompiler: function ({ schema, method, url, httpPart }) {
      return ajv.compile(schema)
    }
  }

  const optsWithJoiValidator = {
    schema: {
      body: Joi.object().keys({
        hello: Joi.string().required()
      }).required()
    },
    validatorCompiler: function ({ schema, method, url, httpPart }) {
      return schema.validate.bind(schema)
    }
  }

  const yupOptions = {
    strict: true, // don't coerce
    abortEarly: false, // return all errors
    stripUnknown: true, // remove additional properties
    recursive: true
  }

  const optsWithYupValidator = {
    schema: {
      body: yup.object().shape({
        hello: yup.string().required()
      }).required()
    },
    validatorCompiler: function ({ schema, method, url, httpPart }) {
      return data => {
        try {
          const result = schema.validateSync(data, yupOptions)
          return { value: result }
        } catch (e) {
          return { error: [e] }
        }
      }
    }
  }

  test(`${upMethod} can be created`, async () => {
    expect.assertions(1)
    try {
      fastify[loMethod]('/', opts, function (req, reply) {
        reply.send(req.body)
      })
      fastify[loMethod]('/custom', optsWithCustomValidator, function (req, reply) {
        reply.send(req.body)
      })
      fastify[loMethod]('/joi', optsWithJoiValidator, function (req, reply) {
        reply.send(req.body)
      })
      fastify[loMethod]('/yup', optsWithYupValidator, function (req, reply) {
        reply.send(req.body)
      })

      fastify.register(function (fastify2, opts, done) {
        fastify2.setValidatorCompiler(function schema ({ schema, method, url, httpPart }) {
          return body => ({ error: new Error('From custom schema compiler!') })
        })
        const withInstanceCustomCompiler = {
          schema: {
            body: {
              type: 'object',
              properties: { },
              additionalProperties: false
            }
          }
        }
        fastify2[loMethod]('/plugin', withInstanceCustomCompiler, (req, reply) => reply.send({ hello: 'never here!' }))

        const optsWithCustomValidator2 = {
          schema: {
            body: {
              type: 'object',
              properties: { },
              additionalProperties: false
            }
          },
          validatorCompiler: function ({ schema, method, url, httpPart }) {
            return function (body) {
              return { error: new Error('Always fail!') }
            }
          }
        }
        fastify2[loMethod]('/plugin/custom', optsWithCustomValidator2, (req, reply) => reply.send({ hello: 'never here!' }))

        done()
      })
      expect(true).toBeTruthy()
    } catch (e) {
      expect.fail()
    }
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

  describe('listening', () => {
let err = null
afterAll(() => { fastify.close() })
beforeAll(async () => {
try {
await fastify.listen({ port: 0 })
} catch (error) {
err = error
}
expect(err).toBeFalsy()
})
test(`${upMethod} - correctly replies`, async () => {
      if (upMethod === 'HEAD') {
        expect.assertions(2)
        const result = await fetch('http://localhost:' + fastify.server.address().port, {
          method: upMethod
        })
        expect(result.ok).toBeTruthy()
        expect(result.status).toBe(200)
      } else {
        expect.assertions(3)

        const result = await fetch('http://localhost:' + fastify.server.address().port, {
          method: upMethod,
          body: JSON.stringify({ hello: 42 }),
          headers: {
            'Content-Type': 'application/json'
          }
        })

        expect(result.ok).toBeTruthy()
        expect(result.status).toBe(200)
        expect(await result.json()).toEqual({ hello: 42 })
      }
    })
test(`${upMethod} - 400 on bad parameters`, async () => {
      expect.assertions(3)

      const result = await fetch('http://localhost:' + fastify.server.address().port, {
        method: upMethod,
        body: JSON.stringify({ hello: 'world' }),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      expect(result.ok).toBeFalsy()
      expect(result.status).toBe(400)
      expect(await result.json()).toEqual({
        error: 'Bad Request',
        message: 'body/hello must be integer',
        statusCode: 400,
        code: 'XUFA_ERR_VALIDATION'
      })
    })
test(`${upMethod} - input-validation coerce`, async () => {
      expect.assertions(3)

      const restult = await fetch('http://localhost:' + fastify.server.address().port, {
        method: upMethod,
        body: JSON.stringify({ hello: '42' }),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      expect(restult.ok).toBeTruthy()
      expect(restult.status).toBe(200)
      expect(await restult.json()).toEqual({ hello: 42 })
    })
test(`${upMethod} - input-validation custom schema compiler`, async () => {
      expect.assertions(3)

      const result = await fetch('http://localhost:' + fastify.server.address().port + '/custom', {
        method: upMethod,
        body: JSON.stringify({ hello: '42', world: 55 }),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      expect(result.ok).toBeTruthy()
      expect(result.status).toBe(200)
      expect(await result.json()).toEqual({ hello: 42 })
    })
test(`${upMethod} - input-validation joi schema compiler ok`, async () => {
      expect.assertions(3)

      const result = await fetch('http://localhost:' + fastify.server.address().port + '/joi', {
        method: upMethod,
        body: JSON.stringify({ hello: '42' }),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      expect(result.ok).toBeTruthy()
      expect(result.status).toBe(200)
      expect(await result.json()).toEqual({ hello: '42' })
    })
test(`${upMethod} - input-validation joi schema compiler ko`, async () => {
      expect.assertions(3)

      const result = await fetch('http://localhost:' + fastify.server.address().port + '/joi', {
        method: upMethod,
        body: JSON.stringify({ hello: 44 }),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      expect(result.ok).toBeFalsy()
      expect(result.status).toBe(400)
      expect(await result.json()).toEqual({
        error: 'Bad Request',
        message: '"hello" must be a string',
        statusCode: 400,
        code: 'XUFA_ERR_VALIDATION'
      })
    })
test(`${upMethod} - input-validation yup schema compiler ok`, async () => {
      expect.assertions(3)

      const result = await fetch('http://localhost:' + fastify.server.address().port + '/yup', {
        method: upMethod,
        body: JSON.stringify({ hello: '42' }),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      expect(result.ok).toBeTruthy()
      expect(result.status).toBe(200)
      expect(await result.json()).toEqual({ hello: '42' })
    })
test(`${upMethod} - input-validation yup schema compiler ko`, async () => {
      expect.assertions(3)

      const result = await fetch('http://localhost:' + fastify.server.address().port + '/yup', {
        method: upMethod,
        body: JSON.stringify({ hello: 44 }),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      expect(result.ok).toBeFalsy()
      expect(result.status).toBe(400)
      expect(await result.json()).toEqual({
        error: 'Bad Request',
        message: 'body hello must be a `string` type, but the final value was: `44`.',
        statusCode: 400,
        code: 'XUFA_ERR_VALIDATION'
      })
    })
test(`${upMethod} - input-validation instance custom schema compiler encapsulated`, async () => {
      expect.assertions(3)

      const result = await fetch('http://localhost:' + fastify.server.address().port + '/plugin', {
        method: upMethod,
        body: JSON.stringify({}),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      expect(result.ok).toBeFalsy()
      expect(result.status).toBe(400)
      expect(await result.json()).toEqual({
        error: 'Bad Request',
        message: 'From custom schema compiler!',
        statusCode: 400,
        code: 'XUFA_ERR_VALIDATION'
      })
    })
test(`${upMethod} - input-validation custom schema compiler encapsulated`, async () => {
      expect.assertions(3)

      const result = await fetch('http://localhost:' + fastify.server.address().port + '/plugin/custom', {
        method: upMethod,
        body: JSON.stringify({}),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      expect(result.ok).toBeFalsy()
      expect(result.status).toBe(400)
      expect(await result.json()).toEqual({
        error: 'Bad Request',
        message: 'Always fail!',
        statusCode: 400,
        code: 'XUFA_ERR_VALIDATION'
      })
    })
})
}
