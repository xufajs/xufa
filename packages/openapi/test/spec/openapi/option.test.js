'use strict'


const Fastify = require('@xufa/http')
const Swagger = require('@apidevtools/swagger-parser')
const yaml = require('yaml')
const fastifySwagger = require('../../../index')
const { readPackageJson } = require('../../../lib/util/read-package-json')
const { openapiOption, openapiWebHookOption } = require('../../../examples/options')

test('openapi should have default version', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, { openapi: {} })

  await fastify.ready()

  const openapiObject = fastify.swagger()
  expect(openapiObject.openapi).toBe('3.0.3')
})

test('openapi version can be overridden', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, { openapi: { openapi: '3.1.0' } })

  await fastify.ready()

  const openapiObject = fastify.swagger()
  expect(openapiObject.openapi).toBe('3.1.0')
})

test('openapi should have default info properties', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, { openapi: {} })

  await fastify.ready()

  const openapiObject = fastify.swagger()
  const pkg = readPackageJson()
  expect(openapiObject.info.title).toBe(pkg.name)
  expect(openapiObject.info.version).toBe(pkg.version)
})

test('openapi basic properties', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

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

  const openapiObject = fastify.swagger()
  expect(openapiObject.info).toBe(openapiOption.openapi.info)
  expect(openapiObject.servers).toBe(openapiOption.openapi.servers)
  expect(openapiObject.paths).toBeTruthy()
  expect(openapiObject.paths['/']).toBeTruthy()
})

test('openapi components', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  openapiOption.openapi.components.schemas = {
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

  await fastify.register(fastifySwagger, openapiOption)

  fastify.get('/', () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  expect(JSON.parse(JSON.stringify(openapiObject.components.schemas))).toEqual(openapiOption.openapi.components.schemas)
  delete openapiOption.openapi.components.schemas // remove what we just added
})

test('openapi paths', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  openapiOption.openapi.paths = {
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

  await fastify.register(fastifySwagger, openapiOption)

  fastify.get('/status', () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  expect(openapiObject.paths).toEqual(openapiOption.openapi.paths)
  delete openapiOption.openapi.paths // remove what we just added
})

test('openapi paths are merged with the registered routes', async () => {
  expect.assertions(6)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    openapi: {
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

  const openapiObject = fastify.swagger()
  expect(Object.keys(openapiObject.paths).sort()).toEqual(['/dynamic', '/mixed', '/static'])
  expect(openapiObject.paths['/static'].post.summary).toBe('static route')
  expect(openapiObject.paths['/dynamic'].get.summary).toBe('dynamic route')
  expect(openapiObject.paths['/mixed'].post.summary).toBe('static post')
  expect(openapiObject.paths['/mixed'].get.summary).toBe('dynamic get')

  await Swagger.validate(structuredClone(openapiObject))
  expect(true).toBeTruthy()
})

test('hide support when property set in transform() - property', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    ...openapiOption,
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

  const openapiObject = fastify.swagger()
  expect(openapiObject.paths['/']).toBe(undefined)
})

test('hide support - tags Default', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

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

  const openapiObject = fastify.swagger()
  expect(openapiObject.paths['/']).toBe(undefined)
})

test('hide support - tags Custom', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, { ...openapiOption, hiddenTag: 'NOP' })

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

  const openapiObject = fastify.swagger()
  expect(openapiObject.paths['/']).toBe(undefined)
})

test('hide support - hidden untagged', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, { ...openapiOption, hideUntagged: true })

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

  const openapiObject = fastify.swagger()
  expect(openapiObject.paths['/']).toBe(undefined)
})

test('basePath support', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    openapi: Object.assign({}, openapiOption.openapi, {
      servers: [
        {
          url: 'http://localhost/prefix'
        }
      ]
    })
  })

  fastify.get('/prefix/endpoint', {}, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  expect(openapiObject.paths['/prefix/endpoint']).toBe(undefined)
  expect(openapiObject.paths['/endpoint']).toBeTruthy()
})

test('basePath maintained when stripBasePath is set to false', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    stripBasePath: false,
    openapi: Object.assign({}, openapiOption.openapi, {
      servers: [
        {
          url: 'http://localhost/foo'
        }
      ]
    })
  })

  fastify.get('/foo/endpoint', {}, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  expect(openapiObject.paths.endpoint).toBe(undefined)
  expect(openapiObject.paths['/endpoint']).toBe(undefined)
  expect(openapiObject.paths['/foo/endpoint']).toBeTruthy()
})

test('relative basePath support', async () => {
  const fastify = Fastify()
  await fastify.register(fastifySwagger, {
    openapi: Object.assign({}, openapiOption.openapi, {
      servers: [
        {
          url: '/foo'
        }
      ]
    })
  })

  fastify.get('/foo/endpoint', {}, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  expect(openapiObject.paths['/foo/endpoint']).toBe(undefined)
  expect(openapiObject.paths['/endpoint']).toBeTruthy()
})

test('basePath containing variables support', async () => {
  const fastify = Fastify()
  await fastify.register(fastifySwagger, {
    openapi: Object.assign({}, openapiOption.openapi, {
      servers: [
        {
          url: 'http://localhost:{port}/{basePath}',
          variables: {
            port: {
              default: 8080
            },
            basePath: {
              default: 'foo'
            }
          }
        }
      ]
    })
  })

  fastify.get('/foo/endpoint', {}, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  expect(openapiObject.paths['/foo/endpoint']).toBe(undefined)
  expect(openapiObject.paths['/endpoint']).toBeTruthy()
})

test('throw when a basePath with variables but no corresponding default values is provided', async () => {
  const fastify = Fastify()
  await fastify.register(fastifySwagger, {
    openapi: Object.assign({}, openapiOption.openapi, {
      servers: [
        {
          url: 'http://localhost/{basePath}/foo',
          variables: {
            basePath: {}
          }
        }
      ]
    })
  })

  fastify.get('/foo/endpoint', {}, () => {})

  await fastify.ready()
  expect(fastify.swagger).toThrow()
})

test('cache - json', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

  await fastify.ready()

  fastify.swagger()
  const openapiObject = fastify.swagger()
  expect(typeof openapiObject).toBe('object')

  await Swagger.validate(openapiObject)
  expect(true).toBeTruthy()
})

test('cache - yaml', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

  await fastify.ready()

  fastify.swagger({ yaml: true })
  const swaggerYaml = fastify.swagger({ yaml: true })
  expect(typeof swaggerYaml).toBe('string')
  yaml.parse(swaggerYaml)
  expect(true).toBeTruthy()
})

test('move examples from "x-examples" to examples field', async () => {
  expect.assertions(3)
  const fastify = Fastify({
    ajv: {
      plugins: [
        function (ajv) {
          ajv.addKeyword({ keyword: 'x-examples' })
        }
      ]
    }
  })

  await fastify.register(fastifySwagger, openapiOption)

  const opts = {
    schema: {
      body: {
        type: 'object',
        required: ['hello'],
        properties: {
          hello: {
            type: 'object',
            properties: {
              lorem: {
                type: 'string'
              }
            }
          }
        },
        'x-examples': {
          'lorem ipsum': {
            summary: 'Roman statesman',
            value: { lorem: 'ipsum' }
          }
        }
      }
    }
  }

  fastify.post('/', opts, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  const content = openapiObject.paths['/'].post.requestBody.content['application/json']
  const schema = content.schema

  expect(schema).toBeTruthy()
  expect(schema['x-examples']).toBe(undefined)
  expect(content.examples).toEqual({
    'lorem ipsum': {
      summary: 'Roman statesman',
      value: { lorem: 'ipsum' }
    }
  })
})

describe('parameter & header examples', () => {
test('uses .example if has single example', async () => {
    expect.assertions(2)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const [params, querystring, headers] = Array(3).fill({
      type: 'object',
      properties: {
        hello: {
          type: 'string',
          examples: ['world']
        }
      }
    })
    fastify.post('/', { schema: { params, querystring, headers } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const { parameters } = openapiObject.paths['/'].post

    expect(parameters.every(({ example }) => example === 'world')).toBeTruthy()
    expect(parameters.every(param => !Object.hasOwn(param, 'examples'))).toBeTruthy()
  })
test('uses .examples if has multiple examples', async () => {
    expect.assertions(2)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const [params, querystring, headers] = Array(3).fill({
      type: 'object',
      properties: {
        hello: {
          type: 'string',
          examples: ['world', 'universe']
        }
      }
    })
    fastify.post('/', { schema: { params, querystring, headers } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const { parameters } = openapiObject.paths['/'].post
    const examples = parameters.map(({ examples }) => examples)
    expect(examples).toEqual(Array(3).fill({
      world: { value: 'world' },
      universe: { value: 'universe' }
    }))
    expect(parameters.every(param => !Object.hasOwn(param, 'example'))).toBeTruthy()
  })
})

describe('request body examples', () => {
test('uses .example field if has single top-level string example', async () => {
    expect.assertions(4)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const body = {
      type: 'string',
      examples: ['hello']
    }
    fastify.post('/', { schema: { body } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.requestBody.content['application/json']
    const schema = content.schema

    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.example).toEqual('hello')
    expect(content.examples).toBe(undefined)
  })
test('uses .examples field if has multiple top-level string examples', async () => {
    expect.assertions(4)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const body = {
      type: 'string',
      examples: ['hello', 'world']
    }
    fastify.post('/', { schema: { body } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.requestBody.content['application/json']
    const schema = content.schema

    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.example).toBe(undefined)
    expect(content.examples).toEqual({
      hello: { value: 'hello' },
      world: { value: 'world' }
    })
  })
test('uses .example field if has single top-level numeric example', async () => {
    expect.assertions(4)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const body = {
      type: 'number',
      examples: [0]
    }
    fastify.post('/', { schema: { body } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.requestBody.content['application/json']
    const schema = content.schema

    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.example).toEqual(0)
    expect(content.examples).toBe(undefined)
  })
test('uses .examples field if has multiple top-level numeric examples', async () => {
    expect.assertions(4)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const body = {
      type: 'number',
      examples: [0, 1]
    }
    fastify.post('/', { schema: { body } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.requestBody.content['application/json']
    const schema = content.schema

    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.example).toBe(undefined)
    expect(content.examples).toEqual({
      0: { value: 0 },
      1: { value: 1 }
    })
  })
test('uses .example field if has single top-level object example', async () => {
    expect.assertions(5)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const body = {
      type: 'object',
      properties: {
        hello: {
          type: 'string'
        }
      },
      examples: [{ hello: 'world' }]
    }
    fastify.post('/', { schema: { body } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.requestBody.content['application/json']
    const schema = content.schema

    expect(schema.properties).toBeTruthy()
    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.example).toEqual({ hello: 'world' })
    expect(content.examples).toBe(undefined)
  })
test('uses .examples field if has multiple top-level object examples', async () => {
    expect.assertions(5)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const body = {
      type: 'object',
      properties: {
        hello: {
          type: 'string'
        }
      },
      examples: [{ hello: 'world' }, { hello: 'universe' }]
    }
    fastify.post('/', { schema: { body } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.requestBody.content['application/json']
    const schema = content.schema

    expect(schema.properties).toBeTruthy()
    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.examples).toEqual({
      example1: { value: { hello: 'world' } },
      example2: { value: { hello: 'universe' } }
    })
    expect(content.example).toBe(undefined)
  })
test('uses .example field if has single top-level array example', async () => {
    expect.assertions(5)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const body = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          hello: {
            type: 'string'
          }
        }
      },
      examples: [[{ hello: 'world' }]]
    }
    fastify.post('/', { schema: { body } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.requestBody.content['application/json']
    const schema = content.schema

    expect(schema.items).toBeTruthy()
    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.example).toEqual([{ hello: 'world' }])
    expect(content.examples).toBe(undefined)
  })
test('uses .examples field if has multiple top-level array examples', async () => {
    expect.assertions(5)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const body = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          hello: {
            type: 'string'
          }
        }
      },
      examples: [[{ hello: 'world' }], [{ hello: 'universe' }]]
    }
    fastify.post('/', { schema: { body } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.requestBody.content['application/json']
    const schema = content.schema

    expect(schema.items).toBeTruthy()
    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.examples).toEqual({
      example1: { value: [{ hello: 'world' }] },
      example2: { value: [{ hello: 'universe' }] }
    })
    expect(content.example).toBe(undefined)
  })
test('uses .example field if has single nested string example', async () => {
    expect.assertions(9)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const body = {
      type: 'object',
      properties: {
        flat: {
          type: 'string',
          examples: ['world']
        },
        deep: {
          type: 'object',
          properties: {
            field: {
              type: 'string',
              examples: ['universe']
            }
          }
        }
      }
    }
    fastify.post('/', { schema: { body } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.requestBody.content['application/json']
    const schema = content.schema

    expect(schema.properties).toBeTruthy()
    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.example).toBe(undefined)
    expect(content.examples).toBe(undefined)
    expect(schema.properties.flat.examples).toBe(undefined)
    expect(schema.properties.deep.properties.field.examples).toBe(undefined)
    expect(schema.properties.flat.example).toEqual('world')
    expect(schema.properties.deep.properties.field.example).toEqual('universe')
  })
test('uses .example field if has multiple nested numeric examples', async () => {
    expect.assertions(9)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const body = {
      type: 'object',
      properties: {
        flat: {
          type: 'number',
          examples: [0, 1]
        },
        deep: {
          type: 'object',
          properties: {
            field: {
              type: 'number',
              examples: [1, 0]
            }
          }
        }
      }
    }
    fastify.post('/', { schema: { body } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.requestBody.content['application/json']
    const schema = content.schema

    expect(schema.properties).toBeTruthy()
    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.example).toBe(undefined)
    expect(content.examples).toBe(undefined)
    expect(schema.properties.flat.examples).toBe(undefined)
    expect(schema.properties.deep.properties.field.examples).toBe(undefined)
    expect(schema.properties.flat.example).toEqual(0)
    expect(schema.properties.deep.properties.field.example).toEqual(1)
  })
test('uses .example if has single nested array example', async () => {
    expect.assertions(7)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const body = {
      type: 'array',
      items: {
        type: 'array',
        items: {
          type: 'string'
        },
        examples: [['world', 'universe']]
      }
    }
    fastify.post('/', { schema: { body } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.requestBody.content['application/json']
    const schema = content.schema

    expect(schema.items).toBeTruthy()
    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.example).toBe(undefined)
    expect(content.examples).toBe(undefined)
    expect(schema.items.examples).toBe(undefined)
    expect(schema.items.example).toEqual(['world', 'universe'])
  })
test('uses .example if has multiple nested array examples', async () => {
    expect.assertions(7)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const body = {
      type: 'array',
      contains: {
        type: 'array',
        items: {
          type: 'string'
        },
        examples: [['world', 'universe'], ['world', 'universe']]
      }
    }
    fastify.post('/', { schema: { body } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.requestBody.content['application/json']
    const schema = content.schema

    expect(schema.contains).toBeTruthy()
    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.example).toBe(undefined)
    expect(content.examples).toBe(undefined)
    expect(schema.contains.examples).toBe(undefined)
    expect(schema.contains.example).toEqual(['world', 'universe'])
  })
test('uses .example if has single nested object example', async () => {
    expect.assertions(7)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const body = {
      type: 'object',
      properties: {
        deep: {
          type: 'object',
          properties: {
            hello: {
              type: 'string'
            }
          },
          examples: [{ hello: 'world' }]
        }
      }
    }
    fastify.post('/', { schema: { body } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.requestBody.content['application/json']
    const schema = content.schema

    expect(schema.properties).toBeTruthy()
    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.example).toBe(undefined)
    expect(content.examples).toBe(undefined)
    expect(schema.properties.deep.examples).toBe(undefined)
    expect(schema.properties.deep.example).toEqual({ hello: 'world' })
  })
test('uses .example if has multiple nested object examples', async () => {
    expect.assertions(7)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const body = {
      type: 'object',
      properties: {
        deep: {
          type: 'object',
          properties: {
            hello: {
              type: 'string'
            }
          },
          examples: [{ hello: 'world' }, { hello: 'universe' }]
        }
      }
    }
    fastify.post('/', { schema: { body } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.requestBody.content['application/json']
    const schema = content.schema

    expect(schema.properties).toBeTruthy()
    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.example).toBe(undefined)
    expect(content.examples).toBe(undefined)
    expect(schema.properties.deep.examples).toBe(undefined)
    expect(schema.properties.deep.example).toEqual({ hello: 'world' })
  })
})

describe('response examples', () => {
test('uses .example field if has single top-level string example', async () => {
    expect.assertions(4)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const response = {
      type: 'string',
      examples: ['hello']
    }
    fastify.post('/', { schema: { response: { 200: response } } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.responses['200'].content['application/json']
    const schema = content.schema

    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.example).toEqual('hello')
    expect(content.examples).toBe(undefined)
  })
test('uses .examples field if has multiple top-level string examples', async () => {
    expect.assertions(4)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const response = {
      type: 'string',
      examples: ['hello', 'world']
    }
    fastify.post('/', { schema: { response: { 200: response } } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.responses['200'].content['application/json']
    const schema = content.schema

    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.example).toBe(undefined)
    expect(content.examples).toEqual({
      hello: { value: 'hello' },
      world: { value: 'world' }
    })
  })
test('uses .example field if has single top-level numeric example', async () => {
    expect.assertions(4)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const response = {
      type: 'number',
      examples: [0]
    }
    fastify.post('/', { schema: { response: { 200: response } } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.responses['200'].content['application/json']
    const schema = content.schema

    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.example).toEqual(0)
    expect(content.examples).toBe(undefined)
  })
test('uses .examples field if has multiple top-level numeric examples', async () => {
    expect.assertions(4)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const response = {
      type: 'number',
      examples: [0, 1]
    }
    fastify.post('/', { schema: { response: { 200: response } } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.responses['200'].content['application/json']
    const schema = content.schema

    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.example).toBe(undefined)
    expect(content.examples).toEqual({
      0: { value: 0 },
      1: { value: 1 }
    })
  })
test('uses .example field if has single top-level object example', async () => {
    expect.assertions(5)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const response = {
      type: 'object',
      properties: {
        hello: {
          type: 'string'
        }
      },
      examples: [{ hello: 'world' }]
    }
    fastify.post('/', { schema: { response: { 200: response } } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.responses['200'].content['application/json']
    const schema = content.schema

    expect(schema.properties).toBeTruthy()
    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.example).toEqual({ hello: 'world' })
    expect(content.examples).toBe(undefined)
  })
test('uses .examples field if has multiple top-level object examples', async () => {
    expect.assertions(5)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const response = {
      type: 'object',
      properties: {
        hello: {
          type: 'string'
        }
      },
      examples: [{ hello: 'world' }, { hello: 'universe' }]
    }
    fastify.post('/', { schema: { response: { 200: response } } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.responses['200'].content['application/json']
    const schema = content.schema

    expect(schema.properties).toBeTruthy()
    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.examples).toEqual({
      example1: { value: { hello: 'world' } },
      example2: { value: { hello: 'universe' } }
    })
    expect(content.example).toBe(undefined)
  })
test('uses .example field if has single top-level array example', async () => {
    expect.assertions(5)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const response = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          hello: {
            type: 'string'
          }
        }
      },
      examples: [[{ hello: 'world' }]]
    }
    fastify.post('/', { schema: { response: { 200: response } } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.responses['200'].content['application/json']
    const schema = content.schema

    expect(schema.items).toBeTruthy()
    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.example).toEqual([{ hello: 'world' }])
    expect(content.examples).toBe(undefined)
  })
test('uses .examples field if has multiple top-level array examples', async () => {
    expect.assertions(5)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const response = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          hello: {
            type: 'string'
          }
        }
      },
      examples: [[{ hello: 'world' }], [{ hello: 'universe' }]]
    }
    fastify.post('/', { schema: { response: { 200: response } } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.responses['200'].content['application/json']
    const schema = content.schema

    expect(schema.items).toBeTruthy()
    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.examples).toEqual({
      example1: { value: [{ hello: 'world' }] },
      example2: { value: [{ hello: 'universe' }] }
    })
    expect(content.example).toBe(undefined)
  })
test('uses .example field if has single nested string example', async () => {
    expect.assertions(9)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const response = {
      type: 'object',
      properties: {
        flat: {
          type: 'string',
          examples: ['world']
        },
        deep: {
          type: 'object',
          properties: {
            field: {
              type: 'string',
              examples: ['universe']
            }
          }
        }
      }
    }
    fastify.post('/', { schema: { response: { 200: response } } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.responses['200'].content['application/json']
    const schema = content.schema

    expect(schema.properties).toBeTruthy()
    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.example).toBe(undefined)
    expect(content.examples).toBe(undefined)
    expect(schema.properties.flat.examples).toBe(undefined)
    expect(schema.properties.deep.properties.field.examples).toBe(undefined)
    expect(schema.properties.flat.example).toEqual('world')
    expect(schema.properties.deep.properties.field.example).toEqual('universe')
  })
test('uses .example field if has multiple nested numeric examples', async () => {
    expect.assertions(9)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const response = {
      type: 'object',
      properties: {
        flat: {
          type: 'number',
          examples: [0, 1]
        },
        deep: {
          type: 'object',
          properties: {
            field: {
              type: 'number',
              examples: [1, 0]
            }
          }
        }
      }
    }
    fastify.post('/', { schema: { response: { 200: response } } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.responses['200'].content['application/json']
    const schema = content.schema

    expect(schema.properties).toBeTruthy()
    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.example).toBe(undefined)
    expect(content.examples).toBe(undefined)
    expect(schema.properties.flat.examples).toBe(undefined)
    expect(schema.properties.deep.properties.field.examples).toBe(undefined)
    expect(schema.properties.flat.example).toEqual(0)
    expect(schema.properties.deep.properties.field.example).toEqual(1)
  })
test('uses .example if has single nested array example', async () => {
    expect.assertions(7)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const response = {
      type: 'array',
      items: {
        type: 'array',
        items: {
          type: 'string'
        },
        examples: [['world', 'universe']]
      }
    }
    fastify.post('/', { schema: { response: { 200: response } } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.responses['200'].content['application/json']
    const schema = content.schema

    expect(schema.items).toBeTruthy()
    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.example).toBe(undefined)
    expect(content.examples).toBe(undefined)
    expect(schema.items.examples).toBe(undefined)
    expect(schema.items.example).toEqual(['world', 'universe'])
  })
test('uses .example if has multiple nested array examples', async () => {
    expect.assertions(7)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const response = {
      type: 'array',
      contains: {
        type: 'array',
        items: {
          type: 'string'
        },
        examples: [['world', 'universe'], ['world', 'universe']]
      }
    }
    fastify.post('/', { schema: { response: { 200: response } } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.responses['200'].content['application/json']
    const schema = content.schema

    expect(schema.contains).toBeTruthy()
    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.example).toBe(undefined)
    expect(content.examples).toBe(undefined)
    expect(schema.contains.examples).toBe(undefined)
    expect(schema.contains.example).toEqual(['world', 'universe'])
  })
test('uses .example if has single nested object example', async () => {
    expect.assertions(7)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const response = {
      type: 'object',
      properties: {
        deep: {
          type: 'object',
          properties: {
            hello: {
              type: 'string'
            }
          },
          examples: [{ hello: 'world' }]
        }
      }
    }
    fastify.post('/', { schema: { response: { 200: response } } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.responses['200'].content['application/json']
    const schema = content.schema

    expect(schema.properties).toBeTruthy()
    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.example).toBe(undefined)
    expect(content.examples).toBe(undefined)
    expect(schema.properties.deep.examples).toBe(undefined)
    expect(schema.properties.deep.example).toEqual({ hello: 'world' })
  })
test('uses .example if has multiple nested object examples', async () => {
    expect.assertions(7)
    const fastify = Fastify()
    await fastify.register(fastifySwagger, openapiOption)
    const response = {
      type: 'object',
      properties: {
        deep: {
          type: 'object',
          properties: {
            hello: {
              type: 'string'
            }
          },
          examples: [{ hello: 'world' }, { hello: 'universe' }]
        }
      }
    }
    fastify.post('/', { schema: { response: { 200: response } } }, () => {})
    await fastify.ready()
    const openapiObject = fastify.swagger()
    const content = openapiObject.paths['/'].post.responses['200'].content['application/json']
    const schema = content.schema

    expect(schema.properties).toBeTruthy()
    expect(schema.example).toBe(undefined)
    expect(schema.examples).toBe(undefined)
    expect(content.example).toBe(undefined)
    expect(content.examples).toBe(undefined)
    expect(schema.properties.deep.examples).toBe(undefined)
    expect(schema.properties.deep.example).toEqual({ hello: 'world' })
  })
})

test('copy example of body from component to media', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

  const body = {
    type: 'object',
    properties: {
      hello: {
        type: 'string'
      }
    },
    examples: [{ hello: 'world' }]
  }

  const opts = {
    schema: {
      body
    }
  }

  fastify.post('/', opts, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  const content = openapiObject.paths['/'].post.requestBody.content['application/json']
  const schema = content.schema

  expect(schema).toBeTruthy()
  expect(schema.properties).toBeTruthy()
  expect(schema.example).toBe(undefined)
  expect(content.example).toEqual({ hello: 'world' })
})

test('copy example of response from component to media', async () => {
  expect.assertions(3)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

  const response = {
    type: 'object',
    properties: {
      hello: {
        type: 'string'
      }
    },
    examples: [{ hello: 'world' }]
  }

  const opts = {
    schema: {
      response: { 200: response }
    }
  }

  fastify.post('/', opts, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  const content = openapiObject.paths['/'].post.responses['200'].content['application/json']
  const schema = content.schema

  expect(schema).toBeTruthy()
  expect(schema.properties).toBeTruthy()
  expect(content.example).toEqual({ hello: 'world' })
})

test('copy example of parameters from component to media', async () => {
  expect.assertions(7)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

  const portSchema = {
    type: 'number',
    examples: [8080]
  }

  const opts = {
    schema: {
      headers: {
        type: 'object',
        properties: {
          'X-Port': portSchema
        }
      },
      querystring: {
        type: 'object',
        properties: {
          port: portSchema
        }
      },
      params: {
        type: 'object',
        properties: {
          port: portSchema
        }
      }
    }
  }

  fastify.post('/:port', opts, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  const parameters = openapiObject.paths['/{port}'].post.parameters

  expect(parameters).toBeTruthy()

  const paramsMap = new Map(parameters.map(param => [param.in, param]))

  const headerParam = paramsMap.get('header')
  expect(headerParam).toBeTruthy()
  expect(headerParam.example).toEqual(8080)

  const queryParam = paramsMap.get('query')
  expect(queryParam).toBeTruthy()
  expect(queryParam.example).toEqual(8080)

  const pathParam = paramsMap.get('path')
  expect(pathParam).toBeTruthy()
  expect(pathParam.example).toEqual(8080)
})

test('move examples of body from component to media', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

  const body = {
    type: 'object',
    properties: {
      hello: {
        type: 'string'
      }
    },
    examples: [{ hello: 'world' }, { hello: 'lorem' }]
  }

  const opts = {
    schema: {
      body
    }
  }

  fastify.post('/', opts, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  const content = openapiObject.paths['/'].post.requestBody.content['application/json']
  const schema = content.schema

  expect(schema).toBeTruthy()
  expect(schema.properties).toBeTruthy()
  expect(schema.examples).toBe(undefined)
  expect(content.examples).toEqual({ example1: { value: { hello: 'world' } }, example2: { value: { hello: 'lorem' } } })
})

test('move examples of response from component to media', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

  const response = {
    type: 'object',
    properties: {
      hello: {
        type: 'string'
      }
    },
    examples: [{ hello: 'world' }, { hello: 'lorem' }]
  }

  const opts = {
    schema: {
      response: { 200: response }
    }
  }

  fastify.post('/', opts, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  const content = openapiObject.paths['/'].post.responses['200'].content['application/json']
  const schema = content.schema

  expect(schema).toBeTruthy()
  expect(schema.properties).toBeTruthy()
  expect(schema.examples).toBe(undefined)
  expect(content.examples).toEqual({ example1: { value: { hello: 'world' } }, example2: { value: { hello: 'lorem' } } })
})

test('move examples of parameters from component to media', async () => {
  expect.assertions(7)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

  const portSchema = {
    type: 'number',
    examples: [8080, 80]
  }

  const opts = {
    schema: {
      headers: {
        type: 'object',
        properties: {
          'X-Port': portSchema
        }
      },
      querystring: {
        type: 'object',
        properties: {
          port: portSchema
        }
      },
      params: {
        type: 'object',
        properties: {
          port: portSchema
        }
      }
    }
  }

  fastify.post('/:port', opts, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  const parameters = openapiObject.paths['/{port}'].post.parameters

  expect(parameters).toBeTruthy()

  const paramsMap = new Map(parameters.map(param => [param.in, param]))

  const expectedExamples = {
    80: { value: 80 },
    8080: { value: 8080 }
  }

  const headerParam = paramsMap.get('header')
  expect(headerParam).toBeTruthy()
  expect(headerParam.examples).toEqual(expectedExamples)

  const queryParam = paramsMap.get('query')
  expect(queryParam).toBeTruthy()
  expect(queryParam.examples).toEqual(expectedExamples)

  const pathParam = paramsMap.get('path')
  expect(pathParam).toBeTruthy()
  expect(pathParam.examples).toEqual(expectedExamples)
})

test('marks request body as required', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

  const body = {
    type: 'object',
    required: ['hello'],
    properties: {
      hello: {
        type: 'string'
      }
    }
  }

  const opts = {
    schema: {
      body
    }
  }

  fastify.post('/', opts, () => {})

  await fastify.ready()
  const openapiObject = fastify.swagger()
  const schema = openapiObject.paths['/'].post.requestBody.content['application/json'].schema
  const requestBody = openapiObject.paths['/'].post.requestBody

  expect(schema).toBeTruthy()
  expect(schema.properties).toBeTruthy()
  expect(body.required).toEqual(['hello'])
  expect(requestBody.required).toEqual(true)
})

test('marks request body as required even when all properties are optional', async () => {
  expect.assertions(3)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

  const body = {
    type: 'object',
    properties: {
      hello: {
        type: 'string'
      }
    }
  }

  const opts = {
    schema: {
      body
    }
  }

  fastify.put('/', opts, () => {})

  await fastify.ready()
  const openapiObject = fastify.swagger()
  const requestBody = openapiObject.paths['/'].put.requestBody

  expect(requestBody).toBeTruthy()
  expect(requestBody.required).toBe(true)
  expect(requestBody.content['application/json'].schema).toBeTruthy()
})

test('openapi webhooks properties', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiWebHookOption)

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
    },
    webhooks: {
      newPet: {
        post: {
          requestBody: {
            description: 'Information about a new pet in the system',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Pet'
                }
              }
            }
          },
          responses: {
            200: {
              description:
                'Return a 200 status to indicate that the data was received successfully'
            }
          }
        }
      }
    }
  }

  fastify.post('/', opts, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  expect(openapiObject.webhooks).toBe(openapiWebHookOption.openapi.webhooks)
})

test('webhooks options for openapi 3.1.0 must valid format', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiWebHookOption)

  await fastify.ready()

  fastify.swagger()
  const openapiObject = fastify.swagger()
  expect(typeof openapiObject).toBe('object')

  await Swagger.validate(openapiObject)
  expect(true).toBeTruthy()
})

test('openapi 3.2.0: $self and tag summary, parent and kind are passed through', async () => {
  expect.assertions(3)
  const fastify = Fastify()

  const openapi32Option = {
    openapi: {
      openapi: '3.2.0',
      $self: 'https://example.com/openapi.json',
      info: {
        title: 'Test openapi 3.2',
        version: '1.0.0'
      },
      tags: [
        { name: 'products', summary: 'Products', kind: 'nav' },
        { name: 'books', summary: 'Books', parent: 'products', kind: 'nav' }
      ]
    }
  }

  await fastify.register(fastifySwagger, openapi32Option)

  fastify.get('/books', { schema: { tags: ['books'] } }, () => {})

  await fastify.ready()

  const openapiObject = fastify.swagger()
  expect(openapiObject.openapi).toBe('3.2.0')
  expect(openapiObject.$self).toBe('https://example.com/openapi.json')
  expect(openapiObject.tags).toEqual(openapi32Option.openapi.tags)
})

test('$self is not added when it is not configured', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, openapiOption)

  await fastify.ready()

  const openapiObject = fastify.swagger()
  expect('$self' in openapiObject).toBe(false)
})

module.exports = { openapiOption }
