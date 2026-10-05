'use strict'


const Fastify = require('@xufa/http')
const fastifySwagger = require('..')
const Joi = require('joi')
const Convert = require('joi-to-json')

const params = Joi
  .object()
  .keys({
    property: Joi.string().required()
  })
const opts = {
  schema: { params }
}
const convertible = ['params', 'body', 'querystring']
const validTransform = ({ schema, url }) => {
  const newSchema = Object.keys(schema).reduce((transformed, key) => {
    transformed[key] = convertible.includes(key)
      ? Convert(schema[key])
      : schema[key]
    return transformed
  },
  {})
  return { schema: newSchema, url }
}
const valid = {
  transform: validTransform
}

const invalid = {
  transform: 'wrong type'
}

test('transform should fail with a value other than Function', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, invalid)

  fastify.setValidatorCompiler(({ schema }) => params.validate(schema))
  fastify.get('/example', opts, () => {})

  await fastify.ready()
  expect(fastify.swagger).toThrow()
})

test('transform should work with a Function', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, valid)

  fastify.setValidatorCompiler(({ schema }) => params.validate(schema))
  fastify.get('/example', opts, () => {})

  await fastify.ready()
  expect(fastify.swagger).not.toThrow()
})

test('transform can access route', async () => {
  expect.assertions(5)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    openapi: { info: { version: '1.0.0' } },
    transform: ({ route }) => {
      expect(route).toBeTruthy()
      expect(route.method).toBe('GET')
      expect(route.url).toBe('/example')
      expect(route.constraints.version).toBe('1.0.0')
      return { schema: route.schema, url: route.url }
    }
  })
  fastify.get('/example', { constraints: { version: '1.0.0' } }, () => {})

  await fastify.ready()
  expect(fastify.swagger).not.toThrow()
})

test('transform can access openapi object', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    openapi: { info: { version: '1.0.0' } },
    transform: ({ route, openapiObject }) => {
      expect(openapiObject).toBeTruthy()
      expect(openapiObject.openapi).toBe('3.0.3')
      expect(openapiObject.info.version).toBe('1.0.0')
      return {
        schema: route.schema,
        url: route.url
      }
    }
  })
  fastify.get('/example', () => {})

  await fastify.ready()
  expect(fastify.swagger).not.toThrow()
})

test('transform can access swagger object', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    swagger: { info: { version: '1.0.0' } },
    transform: ({ route, swaggerObject }) => {
      expect(swaggerObject).toBeTruthy()
      expect(swaggerObject.swagger).toBe('2.0')
      expect(swaggerObject.info.version).toBe('1.0.0')
      return {
        schema: route.schema,
        url: route.url
      }
    }
  })
  fastify.get('/example', () => {})

  await fastify.ready()
  expect(fastify.swagger).not.toThrow()
})

test('transform can hide routes based on openapi version', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    openapi: { info: { version: '2.0.0' } },
    transform: ({ schema, route, openapiObject }) => {
      const transformedSchema = Object.assign({}, schema)
      if (route?.constraints?.version !== openapiObject.info.version) transformedSchema.hide = true
      return { schema: transformedSchema, url: route.url }
    }
  })
  fastify.get('/example', { constraints: { version: '1.0.0' } }, () => {})

  await fastify.ready()
  const openapiObject = fastify.swagger()
  expect(openapiObject.paths['/example']).toBe(undefined)
})

test('endpoint transform should fail with a value other than Function', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {})

  fastify.setValidatorCompiler(({ schema }) => params.validate(schema))
  fastify.get('/example', {
    ...opts,
    config: {
      swaggerTransform: 'wrong type'
    }
  }, () => {})

  await fastify.ready()
  expect(fastify.swagger).toThrow()
})

test('endpoint transform should work with a Function', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, valid)

  fastify.setValidatorCompiler(({ schema }) => params.validate(schema))
  fastify.get('/example', {
    ...opts,
    config: { swaggerTransform: validTransform }
  }, () => {})

  await fastify.ready()
  expect(fastify.swagger).not.toThrow()
})

test('endpoint transform can access route', async () => {
  expect.assertions(5)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    openapi: { info: { version: '1.0.0' } }
  })
  fastify.get('/example', {
    constraints: { version: '1.0.0' },
    config: {
      swaggerTransform: ({ route }) => {
        expect(route).toBeTruthy()
        expect(route.method).toBe('GET')
        expect(route.url).toBe('/example')
        expect(route.constraints.version).toBe('1.0.0')
        return { schema: route.schema, url: route.url }
      }
    }
  }, () => {})

  await fastify.ready()
  expect(fastify.swagger).not.toThrow()
})

test('endpoint transform can access openapi object', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    openapi: { info: { version: '1.0.0' } }
  })
  fastify.get('/example', {
    config: {
      swaggerTransform: ({ route, openapiObject }) => {
        expect(openapiObject).toBeTruthy()
        expect(openapiObject.openapi).toBe('3.0.3')
        expect(openapiObject.info.version).toBe('1.0.0')
        return {
          schema: route.schema,
          url: route.url
        }
      }
    }
  }, () => {})

  await fastify.ready()
  expect(fastify.swagger).not.toThrow()
})

test('endpoint transform can access swagger object', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    swagger: { info: { version: '1.0.0' } }
  })
  fastify.get('/example', {
    config: {
      swaggerTransform: ({ route, swaggerObject }) => {
        expect(swaggerObject).toBeTruthy()
        expect(swaggerObject.swagger).toBe('2.0')
        expect(swaggerObject.info.version).toBe('1.0.0')
        return {
          schema: route.schema,
          url: route.url
        }
      }
    }
  }, () => {})

  await fastify.ready()
  expect(fastify.swagger).not.toThrow()
})

test('endpoint transform can hide routes based on openapi version', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    openapi: { info: { version: '2.0.0' } }
  })
  fastify.get('/example', {
    constraints: { version: '1.0.0' },
    config: {
      swaggerTransform: ({ schema, route, openapiObject }) => {
        const transformedSchema = Object.assign({}, schema)
        if (route?.constraints?.version !== openapiObject.info.version) transformedSchema.hide = true
        return { schema: transformedSchema, url: route.url }
      }
    }
  }, () => {})

  await fastify.ready()
  const openapiObject = fastify.swagger()
  expect(openapiObject.paths['/example']).toBe(undefined)
})

test('endpoint transform takes precedence over global swagger transform', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    swagger: { info: { version: '1.0.0' } },
    transform: ({ schema, url }) => {
      expect.fail('the global transform function should be ignored')
      return validTransform({ schema, url })
    }

  })
  fastify.get('/example', {
    config: {
      swaggerTransform: ({ schema, route }) => {
        const transformedSchema = Object.assign({}, schema)
        expect(transformedSchema).toBeTruthy()
        return { schema: transformedSchema, url: route.url }
      }
    }
  }, () => {})

  await fastify.ready()
  expect(fastify.swagger).not.toThrow()
})

test('endpoint transform takes precedence over global openapi transform', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    openapi: { info: { version: '2.0.0' } },
    transform: ({ schema, url }) => {
      expect.fail('the global transform function should be ignored')
      return validTransform({ schema, url })
    }

  })
  fastify.get('/example', {
    config: {
      swaggerTransform: ({ schema, route }) => {
        const transformedSchema = Object.assign({}, schema)
        expect(transformedSchema).toBeTruthy()
        return { schema: transformedSchema, url: route.url }
      }
    }
  }, () => {})

  await fastify.ready()
  expect(fastify.swagger).not.toThrow()
})

test('endpoint transform with value "false" disables the global swagger transform', async () => {
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    swagger: { info: { version: '1.0.0' } },
    transform: () => { throw Error('should not be run') }
  })
  fastify.get('/example/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: {
            type: 'string'
          }
        }
      }
    },
    config: {
      swaggerTransform: false
    }
  }, () => {})

  await fastify.ready()
  expect(fastify.swagger).not.toThrow()
})

test('endpoint transform with value "false" disables the global openapi transform', async () => {
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    openapi: { info: { version: '2.0.0' } },
    transform: () => { throw Error('should not be run') }
  })
  fastify.get('/example/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: {
            type: 'string'
          }
        }
      }
    },
    config: {
      swaggerTransform: false
    }
  }, () => {})

  await fastify.ready()
  expect(fastify.swagger).not.toThrow()
})

test('transformObject can modify the openapi object', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    openapi: { info: { version: '2.0.0' } },
    transformObject: ({ openapiObject }) => {
      openapiObject.info.title = 'Transformed'
      return openapiObject
    }
  })

  await fastify.ready()
  const openapiObject = fastify.swagger()
  expect(openapiObject.info.title).toBe('Transformed')
})

test('transformObject can modify the swagger object', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    swagger: { info: { version: '2.0.0' } },
    transformObject: ({ swaggerObject }) => {
      swaggerObject.info.title = 'Transformed'
      return swaggerObject
    }
  })

  await fastify.ready()
  const swaggerObject = fastify.swagger()
  expect(swaggerObject.info.title).toBe('Transformed')
})
