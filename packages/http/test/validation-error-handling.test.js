'use strict'


const Joi = require('joi')
const Fastify = require('..')

const schema = {
  body: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      work: { type: 'string' }
    },
    required: ['name', 'work']
  }
}

function echoBody (req, reply) {
  reply.code(200).send(req.body.name)
}

test('should work with valid payload', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.post('/', { schema }, echoBody)

  const response = await fastify.inject({
    method: 'POST',
    payload: {
      name: 'michelangelo',
      work: 'sculptor, painter, architect and poet'
    },
    url: '/'
  })
  expect(response.payload).toEqual('michelangelo')
  expect(response.statusCode).toBe(200)
})

test('should fail immediately with invalid payload', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.post('/', { schema }, echoBody)

  const response = await fastify.inject({
    method: 'POST',
    payload: {
      hello: 'michelangelo'
    },
    url: '/'
  })

  expect(response.json()).toEqual({
    statusCode: 400,
    code: 'XUFA_ERR_VALIDATION',
    error: 'Bad Request',
    message: "body must have required property 'name'"
  })
  expect(response.statusCode).toBe(400)
})

test('should be able to use setErrorHandler specify custom validation error', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.post('/', { schema }, function (req, reply) {
    expect.fail('should not be here')
    reply.code(200).send(req.body.name)
  })

  fastify.setErrorHandler(function (error, request, reply) {
    if (error.validation) {
      reply.status(422).send(new Error('validation failed'))
    }
  })

  const response = await fastify.inject({
    method: 'POST',
    payload: {
      hello: 'michelangelo'
    },
    url: '/'
  })

  expect(JSON.parse(response.payload)).toEqual({
    statusCode: 422,
    error: 'Unprocessable Entity',
    message: 'validation failed'
  })
  expect(response.statusCode).toBe(422)
})

test('validation error has 400 statusCode set', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.setErrorHandler((error, request, reply) => {
    const errorResponse = {
      message: error.message,
      statusCode: error.statusCode || 500
    }

    reply.code(errorResponse.statusCode).send(errorResponse)
  })

  fastify.post('/', { schema }, echoBody)

  const response = await fastify.inject({
    method: 'POST',
    payload: {
      hello: 'michelangelo'
    },
    url: '/'
  })

  expect(response.json()).toEqual({
    statusCode: 400,
    message: "body must have required property 'name'"
  })
  expect(response.statusCode).toBe(400)
})

test('error inside custom error handler should have validationContext', async () => {
  expect.assertions(1)

  const fastify = Fastify()

  fastify.post('/', {
    schema,
    validatorCompiler: ({ schema, method, url, httpPart }) => {
      return function (data) {
        return { error: new Error('this failed') }
      }
    }
  }, function (req, reply) {
    expect.fail('should not be here')
    reply.code(200).send(req.body.name)
  })

  fastify.setErrorHandler(function (error, request, reply) {
    expect(error.validationContext).toBe('body')
    reply.status(500).send(error)
  })

  await fastify.inject({
    method: 'POST',
    payload: {
      name: 'michelangelo',
      work: 'artist'
    },
    url: '/'
  })
})

test('error inside custom error handler should have validationContext if specified by custom error handler', async () => {
  expect.assertions(1)

  const fastify = Fastify()

  fastify.post('/', {
    schema,
    validatorCompiler: ({ schema, method, url, httpPart }) => {
      return function (data) {
        const error = new Error('this failed')
        error.validationContext = 'customContext'
        return { error }
      }
    }
  }, function (req, reply) {
    expect.fail('should not be here')
    reply.code(200).send(req.body.name)
  })

  fastify.setErrorHandler(function (error, request, reply) {
    expect(error.validationContext).toBe('customContext')
    reply.status(500).send(error)
  })

  await fastify.inject({
    method: 'POST',
    payload: {
      name: 'michelangelo',
      work: 'artist'
    },
    url: '/'
  })
})

test('should be able to attach validation to request', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.post('/', { schema, attachValidation: true }, function (req, reply) {
    reply.code(400).send(req.validationError.validation)
  })

  const response = await fastify.inject({
    method: 'POST',
    payload: {
      hello: 'michelangelo'
    },
    url: '/'
  })

  expect(response.json()).toEqual([{
    keyword: 'required',
    instancePath: '',
    schemaPath: '#/required',
    params: { missingProperty: 'name' },
    message: 'must have required property \'name\''
  }])
  expect(response.statusCode).toBe(400)
})

test('attached validationError exposes the same message sent by the default handler', async () => {
  expect.assertions(4)

  const fastify = Fastify()

  fastify.post('/attached', { schema, attachValidation: true }, function (req, reply) {
    reply.code(400).send({
      message: req.validationError.message,
      code: req.validationError.code,
      statusCode: req.validationError.statusCode,
      validationContext: req.validationError.validationContext
    })
  })

  fastify.post('/default', { schema }, echoBody)

  const payload = { hello: 'michelangelo' }
  const attached = await fastify.inject({ method: 'POST', payload, url: '/attached' })
  const notAttached = await fastify.inject({ method: 'POST', payload, url: '/default' })

  const attachedBody = attached.json()

  expect(attachedBody).toEqual({
    message: "body must have required property 'name'",
    code: 'XUFA_ERR_VALIDATION',
    statusCode: 400,
    validationContext: 'body'
  })

  expect(attachedBody.message).toBe(notAttached.json().message)
  expect(attached.statusCode).toBe(400)
  expect(notAttached.statusCode).toBe(400)
})

test('should respect when attachValidation is explicitly set to false', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.post('/', { schema, attachValidation: false }, function (req, reply) {
    expect.fail('should not be here')
    reply.code(200).send(req.validationError.validation)
  })

  const response = await fastify.inject({
    method: 'POST',
    payload: {
      hello: 'michelangelo'
    },
    url: '/'
  })

  expect(JSON.parse(response.payload)).toEqual({
    statusCode: 400,
    code: 'XUFA_ERR_VALIDATION',
    error: 'Bad Request',
    message: "body must have required property 'name'"
  })
  expect(response.statusCode).toBe(400)
})

test('Attached validation error should take precedence over setErrorHandler', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.post('/', { schema, attachValidation: true }, function (req, reply) {
    reply.code(400).send('Attached: ' + req.validationError)
  })

  fastify.setErrorHandler(function (error, request, reply) {
    expect.fail('should not be here')
    if (error.validation) {
      reply.status(422).send(new Error('validation failed'))
    }
  })

  const response = await fastify.inject({
    method: 'POST',
    payload: {
      hello: 'michelangelo'
    },
    url: '/'
  })

  expect(response.payload).toEqual("Attached: Error: body must have required property 'name'")
  expect(response.statusCode).toBe(400)
})

test('should handle response validation error', async () => {
  expect.assertions(2)

  const response = {
    200: {
      type: 'object',
      required: ['name', 'work'],
      properties: {
        name: { type: 'string' },
        work: { type: 'string' }
      }
    }
  }

  const fastify = Fastify()

  fastify.get('/', { schema: { response } }, function (req, reply) {
    try {
      reply.code(200).send({ work: 'actor' })
    } catch (error) {
      reply.code(500).send(error)
    }
  })

  const injectResponse = await fastify.inject({
    method: 'GET',
    payload: { },
    url: '/'
  })

  expect(injectResponse.statusCode).toBe(500)
  expect(injectResponse.payload).toBe('{"statusCode":500,"error":"Internal Server Error","message":"\\"name\\" is required!"}')
})

test('should handle response validation error with promises', async () => {
  expect.assertions(2)

  const response = {
    200: {
      type: 'object',
      required: ['name', 'work'],
      properties: {
        name: { type: 'string' },
        work: { type: 'string' }
      }
    }
  }

  const fastify = Fastify()

  fastify.get('/', { schema: { response } }, function (req, reply) {
    return Promise.resolve({ work: 'actor' })
  })

  const injectResponse = await fastify.inject({
    method: 'GET',
    payload: { },
    url: '/'
  })

  expect(injectResponse.statusCode).toBe(500)
  expect(injectResponse.payload).toBe('{"statusCode":500,"error":"Internal Server Error","message":"\\"name\\" is required!"}')
})

test('should return a defined output message parsing AJV errors', async () => {
  expect.assertions(2)

  const body = {
    type: 'object',
    required: ['name', 'work'],
    properties: {
      name: { type: 'string' },
      work: { type: 'string' }
    }
  }

  const fastify = Fastify()

  fastify.post('/', { schema: { body } }, function (req, reply) {
    expect.fail()
  })

  const response = await fastify.inject({
    method: 'POST',
    payload: { },
    url: '/'
  })

  expect(response.statusCode).toBe(400)
  expect(response.payload).toBe('{"statusCode":400,"code":"XUFA_ERR_VALIDATION","error":"Bad Request","message":"body must have required property \'name\'"}')
})

test('should return a defined output message parsing JOI errors', async () => {
  expect.assertions(2)

  const body = Joi.object().keys({
    name: Joi.string().required(),
    work: Joi.string().required()
  }).required()

  const fastify = Fastify()

  fastify.post('/', {
    schema: { body },
    validatorCompiler: ({ schema, method, url, httpPart }) => {
      return data => schema.validate(data)
    }
  },
  function (req, reply) {
    expect.fail()
  })

  const response = await fastify.inject({
    method: 'POST',
    payload: {},
    url: '/'
  })

  expect(response.statusCode).toBe(400)
  expect(response.payload).toBe('{"statusCode":400,"code":"XUFA_ERR_VALIDATION","error":"Bad Request","message":"\\"name\\" is required"}')
})

test('should return a defined output message parsing JOI error details', async () => {
  expect.assertions(2)

  const body = Joi.object().keys({
    name: Joi.string().required(),
    work: Joi.string().required()
  }).required()

  const fastify = Fastify()

  fastify.post('/', {
    schema: { body },
    validatorCompiler: ({ schema, method, url, httpPart }) => {
      return data => {
        const validation = schema.validate(data)
        return { error: validation.error.details }
      }
    }
  },
  function (req, reply) {
    expect.fail()
  })

  const response = await fastify.inject({
    method: 'POST',
    payload: {},
    url: '/'
  })

  expect(response.statusCode).toBe(400)
  expect(response.payload).toBe('{"statusCode":400,"code":"XUFA_ERR_VALIDATION","error":"Bad Request","message":"body \\"name\\" is required"}')
})

test('the custom error formatter context must be the server instance', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.setSchemaErrorFormatter(function (errors, dataVar) {
    expect(this).toEqual(fastify)
    return new Error('my error')
  })

  fastify.post('/', { schema }, echoBody)

  const response = await fastify.inject({
    method: 'POST',
    payload: {
      hello: 'michelangelo'
    },
    url: '/'
  })

  expect(response.json()).toEqual({
    statusCode: 400,
    code: 'XUFA_ERR_VALIDATION',
    error: 'Bad Request',
    message: 'my error'
  })
  expect(response.statusCode).toBe(400)
})

test('the custom error formatter context must be the server instance in options', async () => {
  expect.assertions(3)

  const fastify = Fastify({
    schemaErrorFormatter: function (errors, dataVar) {
      expect(this).toEqual(fastify)
      return new Error('my error')
    }
  })

  fastify.post('/', { schema }, echoBody)

  const response = await fastify.inject({
    method: 'POST',
    payload: {
      hello: 'michelangelo'
    },
    url: '/'
  })

  expect(response.json()).toEqual({
    statusCode: 400,
    code: 'XUFA_ERR_VALIDATION',
    error: 'Bad Request',
    message: 'my error'
  })
  expect(response.statusCode).toBe(400)
})

test('should call custom error formatter', async () => {
  expect.assertions(8)

  const fastify = Fastify({
    schemaErrorFormatter: (errors, dataVar) => {
      expect(errors.length).toBe(1)
      expect(errors[0].message).toBe("must have required property 'name'")
      expect(errors[0].keyword).toBe('required')
      expect(errors[0].schemaPath).toBe('#/required')
      expect(errors[0].params).toEqual({
        missingProperty: 'name'
      })
      expect(dataVar).toBe('body')
      return new Error('my error')
    }
  })

  fastify.post('/', { schema }, echoBody)

  const response = await fastify.inject({
    method: 'POST',
    payload: {
      hello: 'michelangelo'
    },
    url: '/'
  })

  expect(response.json()).toEqual({
    statusCode: 400,
    code: 'XUFA_ERR_VALIDATION',
    error: 'Bad Request',
    message: 'my error'
  })
  expect(response.statusCode).toBe(400)
})

test('should catch error inside formatter and return message', async () => {
  expect.assertions(2)

  const fastify = Fastify({
    schemaErrorFormatter: (errors, dataVar) => {
      throw new Error('abc')
    }
  })

  fastify.post('/', { schema }, echoBody)

  const response = await fastify.inject({
    method: 'POST',
    payload: {
      hello: 'michelangelo'
    },
    url: '/'
  })

  expect(response.json()).toEqual({
    statusCode: 500,
    error: 'Internal Server Error',
    message: 'abc'
  })
  expect(response.statusCode).toBe(500)
})

test('cannot create a fastify instance with wrong type of errorFormatter', async () => {
  expect.assertions(3)

  try {
    Fastify({
      schemaErrorFormatter: async (errors, dataVar) => {
        return new Error('should not execute')
      }
    })
  } catch (err) {
    expect(err.code).toBe('XUFA_ERR_SCHEMA_ERROR_FORMATTER_NOT_FN')
  }

  try {
    Fastify({
      schemaErrorFormatter: 500
    })
  } catch (err) {
    expect(err.code).toBe('XUFA_ERR_SCHEMA_ERROR_FORMATTER_NOT_FN')
  }

  try {
    const fastify = Fastify()
    fastify.setSchemaErrorFormatter(500)
  } catch (err) {
    expect(err.code).toBe('XUFA_ERR_SCHEMA_ERROR_FORMATTER_NOT_FN')
  }
})

test('should register a route based schema error formatter', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.post('/', {
    schema,
    schemaErrorFormatter: (errors, dataVar) => {
      return new Error('abc')
    }
  }, echoBody)

  const response = await fastify.inject({
    method: 'POST',
    payload: {
      hello: 'michelangelo'
    },
    url: '/'
  })

  expect(response.json()).toEqual({
    statusCode: 400,
    code: 'XUFA_ERR_VALIDATION',
    error: 'Bad Request',
    message: 'abc'
  })
  expect(response.statusCode).toBe(400)
})

test('prefer route based error formatter over global one', async () => {
  expect.assertions(6)

  const fastify = Fastify({
    schemaErrorFormatter: (errors, dataVar) => {
      return new Error('abc123')
    }
  })

  fastify.post('/', {
    schema,
    schemaErrorFormatter: (errors, dataVar) => {
      return new Error('123')
    }
  }, echoBody)

  fastify.post('/abc', {
    schema,
    schemaErrorFormatter: (errors, dataVar) => {
      return new Error('abc')
    }
  }, echoBody)

  fastify.post('/test', { schema }, echoBody)

  const response1 = await fastify.inject({
    method: 'POST',
    payload: {
      hello: 'michelangelo'
    },
    url: '/'
  })

  expect(response1.json()).toEqual({
    statusCode: 400,
    code: 'XUFA_ERR_VALIDATION',
    error: 'Bad Request',
    message: '123'
  })
  expect(response1.statusCode).toBe(400)

  const response2 = await fastify.inject({
    method: 'POST',
    payload: {
      hello: 'michelangelo'
    },
    url: '/abc'
  })

  expect(response2.json()).toEqual({
    statusCode: 400,
    code: 'XUFA_ERR_VALIDATION',
    error: 'Bad Request',
    message: 'abc'
  })
  expect(response2.statusCode).toBe(400)

  const response3 = await fastify.inject({
    method: 'POST',
    payload: {
      hello: 'michelangelo'
    },
    url: '/test'
  })

  expect(response3.json()).toEqual({
    statusCode: 400,
    code: 'XUFA_ERR_VALIDATION',
    error: 'Bad Request',
    message: 'abc123'
  })
  expect(response3.statusCode).toBe(400)
})

test('adding schemaErrorFormatter', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.setSchemaErrorFormatter((errors, dataVar) => {
    return new Error('abc')
  })

  fastify.post('/', { schema }, echoBody)

  const response = await fastify.inject({
    method: 'POST',
    payload: {
      hello: 'michelangelo'
    },
    url: '/'
  })

  expect(response.json()).toEqual({
    statusCode: 400,
    code: 'XUFA_ERR_VALIDATION',
    error: 'Bad Request',
    message: 'abc'
  })
  expect(response.statusCode).toBe(400)
})

test('plugin override', async () => {
  expect.assertions(10)

  const fastify = Fastify({
    schemaErrorFormatter: (errors, dataVar) => {
      return new Error('B')
    }
  })

  fastify.register((instance, opts, done) => {
    instance.setSchemaErrorFormatter((errors, dataVar) => {
      return new Error('C')
    })

    instance.post('/d', {
      schema,
      schemaErrorFormatter: (errors, dataVar) => {
        return new Error('D')
      }
    }, function (req, reply) {
      reply.code(200).send(req.body.name)
    })

    instance.post('/c', { schema }, echoBody)

    instance.register((subinstance, opts, done) => {
      subinstance.post('/stillC', { schema }, echoBody)
      done()
    })

    done()
  })

  fastify.post('/b', { schema }, echoBody)

  fastify.post('/', {
    schema,
    schemaErrorFormatter: (errors, dataVar) => {
      return new Error('A')
    }
  }, echoBody)

  const response1 = await fastify.inject({
    method: 'POST',
    payload: {
      hello: 'michelangelo'
    },
    url: '/'
  })

  expect(response1.json()).toEqual({
    statusCode: 400,
    code: 'XUFA_ERR_VALIDATION',
    error: 'Bad Request',
    message: 'A'
  })
  expect(response1.statusCode).toBe(400)

  const response2 = await fastify.inject({
    method: 'POST',
    payload: {
      hello: 'michelangelo'
    },
    url: '/b'
  })

  expect(response2.json()).toEqual({
    statusCode: 400,
    code: 'XUFA_ERR_VALIDATION',
    error: 'Bad Request',
    message: 'B'
  })
  expect(response2.statusCode).toBe(400)

  const response3 = await fastify.inject({
    method: 'POST',
    payload: {
      hello: 'michelangelo'
    },
    url: '/c'
  })

  expect(response3.json()).toEqual({
    statusCode: 400,
    code: 'XUFA_ERR_VALIDATION',
    error: 'Bad Request',
    message: 'C'
  })
  expect(response3.statusCode).toBe(400)

  const response4 = await fastify.inject({
    method: 'POST',
    payload: {
      hello: 'michelangelo'
    },
    url: '/d'
  })

  expect(response4.json()).toEqual({
    statusCode: 400,
    code: 'XUFA_ERR_VALIDATION',
    error: 'Bad Request',
    message: 'D'
  })
  expect(response4.statusCode).toBe(400)

  const response5 = await fastify.inject({
    method: 'POST',
    payload: {
      hello: 'michelangelo'
    },
    url: '/stillC'
  })

  expect(response5.json()).toEqual({
    statusCode: 400,
    code: 'XUFA_ERR_VALIDATION',
    error: 'Bad Request',
    message: 'C'
  })
  expect(response5.statusCode).toBe(400)
})

describe('sync and async must work in the same way', () => {
const throwingRouteValidator = {
    schema: {
      body: {
        type: 'object',
        properties: { name: { type: 'string' } }
      }
    },
    validatorCompiler: () => {
      return function (inputData) {
        // This custom validator throws a sync error instead of returning `{ error }`
        throw new Error('Custom validation failed')
      }
    },
    handler (request, reply) { reply.send({ success: true }) }
  }
test('async preValidation with custom validator should trigger error handler when validator throws', async () => {
    expect.assertions(4)

    const fastify = Fastify()
    fastify.setErrorHandler((error, request, reply) => {
      expect(error instanceof Error).toBeTruthy()
      expect(error.message).toBe('Custom validation failed')
      reply.status(500).send({ error: error.message })
    })

    // Add async preValidation hook
    fastify.addHook('preValidation', async (request, reply) => {
      await Promise.resolve('ok')
    })
    fastify.post('/async', throwingRouteValidator)

    const response = await fastify.inject({
      method: 'POST',
      url: '/async',
      payload: { name: 'test' }
    })
    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ error: 'Custom validation failed' })
  })
test('sync preValidation with custom validator should trigger error handler when validator throws', async () => {
    expect.assertions(4)

    const fastify = Fastify()
    fastify.setErrorHandler((error, request, reply) => {
      expect(error instanceof Error).toBeTruthy()
      expect(error.message).toBe('Custom validation failed')
      reply.status(500).send({ error: error.message })
    })

    // Add sync preValidation hook
    fastify.addHook('preValidation', (request, reply, next) => { next() })
    fastify.post('/sync', throwingRouteValidator)

    const response = await fastify.inject({
      method: 'POST',
      url: '/sync',
      payload: { name: 'test' }
    })
    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ error: 'Custom validation failed' })
  })
})
