'use strict'

const path = require('node:path')

const Fastify = require('@xufa/http')
const fastifySwagger = require('../../index')
const fastifySwaggerDynamic = require('../../lib/mode/dynamic')
const Swagger = require('@apidevtools/swagger-parser')
const readFileSync = require('node:fs').readFileSync
const resolve = require('node:path').resolve
const yaml = require('yaml')

test('specification validation check works', async () => {
  const specificationTests = [
    {
      specification: '',
      error: 'Error: specification is missing in the module options'
    },
    {
      specification: '123',
      error: 'Error: specification is not an object'
    },
    {
      specification: {},
      error: 'Error: both specification.path and specification.document are missing, should be path to the file or swagger document spec'
    },
    {
      specification: {
        path: 123
      },
      error: 'Error: specification.path is not a string'
    },
    {
      specification: {
        path: '/hello/lionel.richie'
      },
      error: 'Error: /hello/lionel.richie does not exist'
    },
    {
      specification: {
        path: './examples/example-static-specification.yaml',
        postProcessor: 'hello'
      },
      error: 'Error: specification.postProcessor should be a function'
    }
  ]

  expect.assertions(specificationTests.length * 2)

  for (const specificationTest of specificationTests) {
    try {
      const fastify = Fastify()
      await fastify.register(fastifySwagger, {
        mode: 'static',
        specification: specificationTest.specification
      })
    } catch (err) {
      expect(err).not.toBe(undefined)
      expect(err.toString()).toBe(specificationTest.error)
    }
  }
})

test('registering plugin with invalid mode throws an error', async () => {
  const config = {
    mode: 'error'
  }

  expect.assertions(1)
  const fastify = Fastify()

  try {
    await fastify.register(fastifySwagger, config)
  } catch (err) {
    expect(err.message).toBe('unsupported mode, should be one of [\'static\', \'dynamic\']')
  }
})

test('unsupported file extension in specification.path throws an error', async () => {
  const config = {
    mode: 'static',
    specification: {
      path: './examples/example-static-specification.js'
    }
  }

  expect.assertions(1)
  const fastify = Fastify()

  try {
    await fastify.register(fastifySwagger, config)
  } catch (err) {
    expect(err.message).toBe('specification.path extension name is not supported, should be one from [\'.yaml\', \'.json\']')
  }
})

test('non-string specification.baseDir throws an error ', async () => {
  const config = {
    mode: 'static',
    specification: {
      path: './examples/example-static-specification.yaml',
      baseDir: 1
    }
  }

  expect.assertions(1)
  const fastify = Fastify()

  try {
    await fastify.register(fastifySwagger, config)
  } catch (err) {
    expect(err.message).toBe('specification.baseDir should be string')
  }
})

test('valid specification.baseDir is handled properly /1', async () => {
  const config = {
    mode: 'static',
    specification: {
      path: './examples/example-static-specification.json',
      baseDir: __dirname
    }
  }

  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, config)
  await fastify.ready()
  expect(JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'examples', 'example-static-specification.json'), 'utf8'))).toEqual(fastify.swagger({ json: true }))
})

test('valid specification.baseDir is handled properly /2', async () => {
  const config = {
    mode: 'static',
    specification: {
      path: './examples/example-static-specification.json',
      baseDir: __dirname + '/' // eslint-disable-line n/no-path-concat
    }
  }

  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, config)
  await fastify.ready()
  expect(JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'examples', 'example-static-specification.json'), 'utf8'))).toEqual(fastify.swagger({ json: true }))
})

test('valid yaml-specification is converted properly to json', async () => {
  const config = {
    mode: 'static',
    specification: {
      path: './examples/example-static-specification.yaml'
    }
  }

  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, config)
  await fastify.ready()
  expect(JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'examples', 'example-static-specification.json'), 'utf8'))).toEqual(fastify.swagger())
})

test('valid specification yaml is properly handled as yaml', async () => {
  const config = {
    mode: 'static',
    specification: {
      path: './examples/example-static-specification.yaml',
      baseDir: __dirname
    }
  }

  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, config)
  await fastify.ready()
  expect(readFileSync(resolve(__dirname, '..', '..', 'examples', 'example-static-specification.yaml'), 'utf8')).toBe(fastify.swagger({ yaml: true }))
})

test('non-object specification.document throws an error', async () => {
  const config = {
    mode: 'static',
    specification: {
      document: 'doc'
    }
  }

  expect.assertions(1)
  const fastify = new Fastify()

  await expect((async () => await fastify.register(fastifySwagger, config))()).rejects.toThrow(new Error('specification.document is not an object'))
})

test('object specification.document', async () => {
  const config = {
    mode: 'static',
    specification: {
      document: {
        type: 'object'
      }
    }
  }

  expect.assertions(1)
  const fastify = new Fastify()
  fastify.register(fastifySwagger, config)
  await fastify.ready()
  expect(fastify.swagger()).toEqual({ type: 'object' })
})

test('inserts default opts in fastifySwagger', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger)

  expect(true).toBeTruthy()
})

test('inserts default package name', async () => {
  const config = {
    mode: 'dynamic',
    specification: {
      path: './examples/example-static-specification.json'
    }
  }

  expect.assertions(1)
  const fastify = Fastify()
  await fastify.register(fastifySwagger, config)

  const originalPathJoin = path.join
  const testPackageJSON = path.join(__dirname, '../../examples/test-package.json')

  path.join = (...args) => {
    if (args[3] === 'package.json') {
      return testPackageJSON
    }
    return originalPathJoin(...args)
  }

  await fastify.ready()

  expect(fastify.swagger()).toEqual({
    swagger: '2.0',
    info: { version: '1.0.0', title: 'test' },
    definitions: {},
    paths: {}
  })
})

test('inserts default package name - openapi', async () => {
  const config = {
    mode: 'dynamic',
    openapi: {
      servers: []
    },
    specification: {
      path: './examples/example-static-specification.json'
    }
  }

  expect.assertions(1)
  const fastify = Fastify()
  await fastify.register(fastifySwagger, config)

  const originalPathJoin = path.join
  const testPackageJSON = path.join(__dirname, '../../examples/test-package.json')

  path.join = (...args) => {
    if (args[3] === 'package.json') {
      return testPackageJSON
    }
    return originalPathJoin(...args)
  }

  await fastify.ready()

  expect(fastify.swagger()).toEqual({
    openapi: '3.0.3',
    info: { version: '1.0.0', title: 'test' },
    components: { schemas: {} },
    paths: {},
    servers: []
  })
})

test('throws an error if cannot parse package\'s JSON', async () => {
  const config = {
    mode: 'dynamic',
    specification: {
      path: './examples/example-static-specification.json'
    }
  }

  expect.assertions(1)
  const fastify = Fastify()
  await fastify.register(fastifySwagger, config)

  const originalPathJoin = path.join
  const testPackageJSON = path.join(__dirname, '')

  path.join = (...args) => {
    if (args[3] === 'package.json') {
      return testPackageJSON
    }
    return originalPathJoin(...args)
  }

  await fastify.ready()

  expect(fastify.swagger()).toEqual({
    swagger: '2.0',
    info: { version: '1.0.0', title: '' },
    definitions: {},
    paths: {}
  })
})

test('throws an error if cannot parse package\'s JSON - openapi', async () => {
  const config = {
    mode: 'dynamic',
    openapi: {
      servers: []
    },
    specification: {
      path: './examples/example-static-specification.json'
    }
  }

  expect.assertions(1)
  const fastify = Fastify()
  await fastify.register(fastifySwagger, config)

  const originalPathJoin = path.join
  const testPackageJSON = path.join(__dirname, '')

  path.join = (...args) => {
    if (args[3] === 'package.json') {
      return testPackageJSON
    }
    return originalPathJoin(...args)
  }

  await fastify.ready()

  expect(fastify.swagger()).toEqual({
    openapi: '3.0.3',
    info: { version: '1.0.0', title: '' },
    components: { schemas: {} },
    paths: {},
    servers: []
  })
})

test('inserts default opts in fastifySwaggerDynamic (dynamic.js)', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwaggerDynamic)

  expect(true).toBeTruthy()
})

test('should still return valid swagger object when missing package.json', async () => {
  const config = {
    mode: 'dynamic',
    specification: {
      path: './examples/example-static-specification.json'
    }
  }

  expect.assertions(2)
  const fastify = Fastify()
  await fastify.register(fastifySwagger, config)

  const originalPathJoin = path.join
  const testPackageJSON = path.join(__dirname, 'missing.json')

  path.join = (...args) => {
    if (args[3] === 'package.json') {
      return testPackageJSON
    }
    return originalPathJoin(...args)
  }

  await fastify.ready()

  const swaggerObject = fastify.swagger()
  expect(typeof swaggerObject).toBe('object')

  await Swagger.validate(swaggerObject)
  expect(true).toBeTruthy()
})

test('.swagger() returns cache.swaggerObject on second request in static mode', async () => {
  const config = {
    mode: 'static',
    specification: {
      path: './examples/example-static-specification.json'
    }
  }

  expect.assertions(3)
  const fastify = Fastify()
  await fastify.register(fastifySwagger, config)
  await fastify.ready()

  const swaggerJson1 = fastify.swagger()
  expect(typeof swaggerJson1).toBe('object')

  const swaggerJson2 = fastify.swagger()
  expect(typeof swaggerJson2).toBe('object')
  expect(swaggerJson1).toBe(swaggerJson2)
})

test('.swagger({ yaml: true }) returns cache.swaggerString on second request in static mode', async () => {
  const config = {
    mode: 'static',
    specification: {
      path: './examples/example-static-specification.yaml'
    }
  }

  expect.assertions(3)
  const fastify = Fastify()
  await fastify.register(fastifySwagger, config)
  await fastify.ready()

  const swaggerYaml1 = fastify.swagger({ yaml: true })
  expect(typeof swaggerYaml1).toBe('string')

  const swaggerYaml2 = fastify.swagger({ yaml: true })
  expect(typeof swaggerYaml2).toBe('string')
  expect(swaggerYaml1).toBe(swaggerYaml2)
})

test('postProcessor works, swagger route returns updated yaml', async () => {
  const config = {
    mode: 'static',
    specification: {
      path: './examples/example-static-specification.yaml',
      postProcessor: function (swaggerObject) {
        swaggerObject.servers[0].url = 'http://localhost:4000/'
        return swaggerObject
      }
    }
  }

  const expectedYaml = `openapi: 3.0.0
info:
  description: Test swagger specification
  version: 1.0.0
  title: Test swagger specification
  contact:
    email: super.developer@gmail.com
servers:
  - url: http://localhost:4000/
    description: Localhost (uses test data)
paths:
  /status:
    get:
      description: Status route, so we can check if server is alive
      tags:
        - Status
      responses:
        "200":
          description: Server is alive
          content:
            application/json:
              schema:
                type: object
                properties:
                  health:
                    type: boolean
                  date:
                    type: string
                example:
                  health: true
                  date: 2018-02-19T15:36:46.758Z
`

  expect.assertions(3)
  const fastify = Fastify()
  await fastify.register(fastifySwagger, config)
  await fastify.ready()

  // check that yaml is there
  const res = fastify.swagger({ yaml: true })

  expect(typeof res).toBe('string')
  yaml.parse(res)
  expect(res).toBe(expectedYaml)
  expect(true).toBeTruthy()
})
