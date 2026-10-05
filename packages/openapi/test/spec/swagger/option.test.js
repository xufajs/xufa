'use strict'


const Fastify = require('@xufa/http')
const Swagger = require('@apidevtools/swagger-parser')
const yaml = require('yaml')
const fastifySwagger = require('../../../index')
const { readPackageJson } = require('../../../lib/util/read-package-json')
const { swaggerOption } = require('../../../examples/options')

test('swagger should have default version', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger)

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  expect(swaggerObject.swagger).toBe('2.0')
})

test('swagger should have default info properties', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.register(fastifySwagger)

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  const pkg = readPackageJson()

  expect(swaggerObject.info.title).toBe(pkg.name)
  expect(swaggerObject.info.version).toBe(pkg.version)
})

test('swagger basic properties', async () => {
  expect.assertions(5)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, swaggerOption)

  const opts = {
    schema: {
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
  expect(swaggerObject.info).toBe(swaggerOption.swagger.info)
  expect(swaggerObject.host).toBe(swaggerOption.swagger.host)
  expect(swaggerObject.schemes).toBe(swaggerOption.swagger.schemes)
  expect(swaggerObject.paths).toBeTruthy()
  expect(swaggerObject.paths['/']).toBeTruthy()
})

test('swagger definitions', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  swaggerOption.swagger.definitions = {
    ExampleModel: {
      type: 'object',
      properties: {
        id: {
          type: 'integer',
          description: 'Some id'
        },
        name: {
          type: 'string',
          description: 'Name of smthng'
        }
      }
    }
  }

  await fastify.register(fastifySwagger, swaggerOption)

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  expect(JSON.parse(JSON.stringify(swaggerObject.definitions))).toEqual(swaggerOption.swagger.definitions)
  delete swaggerOption.swagger.definitions // remove what we just added
})

test('swagger paths', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  swaggerOption.swagger.paths = {
    '/status': {
      get: {
        description: 'Status route, so we can check if server is alive',
        tags: [
          'Status'
        ],
        responses: {
          200: {
            description: 'Server is alive',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    health: {
                      type: 'boolean'
                    },
                    date: {
                      type: 'string'
                    }
                  },
                  example: {
                    health: true,
                    date: '2018-02-19T15:36:46.758Z'
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  await fastify.register(fastifySwagger, swaggerOption)

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  expect(swaggerObject.paths).toEqual(swaggerOption.swagger.paths)
  delete swaggerOption.swagger.paths // remove what we just added
})

test('swagger paths are merged with the registered routes', async () => {
  expect.assertions(6)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    swagger: {
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/static': {
          post: {
            summary: 'static route',
            responses: { 200: { description: 'OK' } }
          }
        },
        '/mixed': {
          get: {
            summary: 'static get',
            responses: { 200: { description: 'OK' } }
          },
          post: {
            summary: 'static post',
            responses: { 200: { description: 'OK' } }
          }
        }
      }
    }
  })

  fastify.get('/dynamic', { schema: { summary: 'dynamic route' } }, () => {})
  fastify.get('/mixed', { schema: { summary: 'dynamic get' } }, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  expect(Object.keys(swaggerObject.paths).sort()).toEqual(['/dynamic', '/mixed', '/static'])
  expect(swaggerObject.paths['/static'].post.summary).toBe('static route')
  expect(swaggerObject.paths['/dynamic'].get.summary).toBe('dynamic route')
  expect(swaggerObject.paths['/mixed'].post.summary).toBe('static post')
  expect(swaggerObject.paths['/mixed'].get.summary).toBe('dynamic get')

  await Swagger.validate(structuredClone(swaggerObject))
  expect(true).toBeTruthy()
})

test('swagger tags', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, swaggerOption)

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  expect(swaggerObject.tags).toBe(swaggerOption.swagger.tags)
})

test('swagger externalDocs', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, swaggerOption)

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  expect(swaggerObject.externalDocs).toBe(swaggerOption.swagger.externalDocs)
})

test('basePath support', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    swagger: Object.assign({}, swaggerOption.swagger, {
      basePath: '/prefix'
    })
  })

  fastify.get('/prefix/endpoint', {}, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  expect(swaggerObject.paths['/prefix/endpoint']).toBe(undefined)
  expect(swaggerObject.paths['/endpoint']).toBeTruthy()
})

test('basePath support with prefix', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    prefix: '/prefix',
    swagger: Object.assign({}, swaggerOption.swagger, {
      basePath: '/prefix'
    })
  })

  fastify.get('/endpoint', {}, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  expect(swaggerObject.paths['/prefix/endpoint']).toBe(undefined)
  expect(swaggerObject.paths['/endpoint']).toBeTruthy()
})

test('basePath ensure leading slash', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    swagger: Object.assign({}, swaggerOption.swagger, {
      basePath: '/'
    })
  })

  fastify.get('/endpoint', {}, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  expect(swaggerObject.paths.endpoint).toBe(undefined)
  expect(swaggerObject.paths['/endpoint']).toBeTruthy()
})

test('basePath with prefix ensure leading slash', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    prefix: '/',
    swagger: Object.assign({}, swaggerOption.swagger, {
      basePath: '/'
    })
  })

  fastify.get('/endpoint', {}, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  expect(swaggerObject.paths.endpoint).toBe(undefined)
  expect(swaggerObject.paths['/endpoint']).toBeTruthy()
})

test('basePath maintained when stripBasePath is set to false', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    stripBasePath: false,
    swagger: Object.assign({}, swaggerOption.swagger, {
      basePath: '/foo'
    })
  })

  fastify.get('/foo/endpoint', {}, () => {})

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  expect(swaggerObject.paths.endpoint).toBe(undefined)
  expect(swaggerObject.paths['/endpoint']).toBe(undefined)
  expect(swaggerObject.paths['/foo/endpoint']).toBeTruthy()
})

// hide testing

test('hide support - property', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, swaggerOption)

  const opts = {
    schema: {
      hide: true,
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
  expect(swaggerObject.paths['/']).toBe(undefined)
})

test('hide support when property set in transform() - property', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    ...swaggerOption,
    transform: ({ schema, url }) => {
      return { schema: { ...schema, hide: true }, url }
    }
  })

  const opts = {
    schema: {
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
  expect(swaggerObject.paths['/']).toBe(undefined)
})

test('hide support - tags Default', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, swaggerOption)

  const opts = {
    schema: {
      tags: ['X-HIDDEN'],
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
  expect(swaggerObject.paths['/']).toBe(undefined)
})

test('hide support - tags Custom', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, { ...swaggerOption, hiddenTag: 'NOP' })

  const opts = {
    schema: {
      tags: ['NOP'],
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
  expect(swaggerObject.paths['/']).toBe(undefined)
})

test('hide support - hidden untagged', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, { ...swaggerOption, hideUntagged: true })

  const opts = {
    schema: {
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
  expect(swaggerObject.paths['/']).toBe(undefined)
})

test('cache - json', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, swaggerOption)

  await fastify.ready()

  fastify.swagger()
  const swaggerObject = fastify.swagger()
  expect(typeof swaggerObject).toBe('object')

  await Swagger.validate(swaggerObject)
  expect(true).toBeTruthy()
})

test('cache - yaml', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, swaggerOption)

  await fastify.ready()

  fastify.swagger({ yaml: true })
  const swaggerYaml = fastify.swagger({ yaml: true })
  expect(typeof swaggerYaml).toBe('string')
  yaml.parse(swaggerYaml)
  expect(true).toBeTruthy()
})

module.exports = { swaggerOption }
