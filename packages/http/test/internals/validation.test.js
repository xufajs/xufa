'use strict'



const Ajv = require('ajv')
const ajv = new Ajv({ coerceTypes: true })

const validation = require('../../lib/validation')
const { normalizeSchema } = require('../../lib/schemas')
const symbols = require('../../lib/validation').symbols
const { kSchemaVisited } = require('../../lib/symbols')

for (const [part, symbol] of [
  ['params', symbols.paramsSchema],
  ['body', symbols.bodySchema],
  ['query', symbols.querystringSchema],
  ['headers', symbols.headersSchema]
]) {
  for (const async of [false, true]) {
    test(`validate reads only the validated ${part} once (${async ? 'async' : 'sync'})`, async () => {
      const request = {}
      const value = { hello: 'world' }
      let reads = 0
      let calls = 0

      for (const name of ['params', 'body', 'query', 'headers']) {
        Object.defineProperty(request, name, {
          get () {
            expect(name).toBe(part)
            reads++
            return value
          }
        })
      }

      const context = {
        [symbol]: data => {
          calls++
          expect(data).toBe(value)
          return async ? Promise.resolve(data) : true
        }
      }

      expect(await validation.validate(context, request)).toBe(false)
      expect(reads).toBe(1)
      expect(calls).toBe(1)
    })
  }
}

test('validate skips a body without a matching content-type schema', () => {
  const context = { [symbols.bodySchema]: { 'application/json': () => true } }
  const request = {
    mediaType: 'text/plain',
    get body () {
      expect.fail('an unvalidated body must not be read')
    }
  }

  expect(validation.validate(context, request)).toBe(false)
})

test('validate passes null for an undefined request part and preserves other values', () => {
  for (const value of [undefined, null, false, 0, '']) {
    let calls = 0
    const context = {
      [symbols.bodySchema]: data => {
        calls++
        expect(data).toBe(value === undefined ? null : value)
        return true
      }
    }

    expect(validation.validate(context, { body: value })).toBe(false)
    expect(calls).toBe(1)
  }
})

test('Symbols', async () => {
  expect.assertions(5)
  expect(typeof symbols.responseSchema).toBe('symbol')
  expect(typeof symbols.bodySchema).toBe('symbol')
  expect(typeof symbols.querystringSchema).toBe('symbol')
  expect(typeof symbols.paramsSchema).toBe('symbol')
  expect(typeof symbols.headersSchema).toBe('symbol')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

;['compileSchemasForValidation',
  'compileSchemasForSerialization'].forEach(func => {
  test(`${func} schema - missing schema`, async () => {
    expect.assertions(2)
    const context = {}
    validation[func](context)
    expect(typeof context[symbols.bodySchema]).toBe('undefined')
    expect(typeof context[symbols.responseSchema]).toBe('undefined')
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

  test(`${func} schema - missing output schema`, async () => {
    expect.assertions(1)
    const context = { schema: {} }
    validation[func](context, null)
    expect(typeof context[symbols.responseSchema]).toBe('undefined')
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
})

test('build schema - output schema', async () => {
  expect.assertions(2)
  const opts = {
    schema: {
      response: {
        '2xx': {
          type: 'object',
          properties: {
            hello: { type: 'string' }
          }
        },
        201: {
          type: 'object',
          properties: {
            hello: { type: 'number' }
          }
        }
      }
    }
  }
  validation.compileSchemasForSerialization(opts, ({ schema, method, url, httpPart }) => ajv.compile(schema))
  expect(typeof opts[symbols.responseSchema]['2xx']).toBe('function')
  expect(typeof opts[symbols.responseSchema]['201']).toBe('function')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('build schema - body schema', async () => {
  expect.assertions(1)
  const opts = {
    schema: {
      body: {
        type: 'object',
        properties: {
          hello: { type: 'string' }
        }
      }
    }
  }
  validation.compileSchemasForValidation(opts, ({ schema, method, url, httpPart }) => ajv.compile(schema))
  expect(typeof opts[symbols.bodySchema]).toBe('function')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('build schema - body with multiple content type schemas', async () => {
  expect.assertions(2)
  const opts = {
    schema: {
      body: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                hello: { type: 'string' }
              }
            }
          },
          'text/plain': {
            schema: { type: 'string' }
          }
        }
      }
    }
  }
  validation.compileSchemasForValidation(opts, ({ schema, method, url, httpPart }) => ajv.compile(schema))
  expect(opts[symbols.bodySchema]['application/json']).toBeTruthy()
  expect(opts[symbols.bodySchema]['text/plain']).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('build schema - avoid repeated normalize schema', async () => {
  expect.assertions(3)
  const serverConfig = {}
  const opts = {
    schema: {
      query: {
        type: 'object',
        properties: {
          hello: { type: 'string' }
        }
      }
    }
  }
  opts.schema = normalizeSchema(opts.schema, serverConfig)
  expect(kSchemaVisited).not.toBe(undefined)
  expect(opts.schema[kSchemaVisited]).toBe(true)
  expect(opts.schema).toBe(normalizeSchema(opts.schema, serverConfig))

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('build schema - query schema', async () => {
  expect.assertions(2)
  const serverConfig = {}
  const opts = {
    schema: {
      query: {
        type: 'object',
        properties: {
          hello: { type: 'string' }
        }
      }
    }
  }
  opts.schema = normalizeSchema(opts.schema, serverConfig)
  validation.compileSchemasForValidation(opts, ({ schema, method, url, httpPart }) => ajv.compile(schema))
  expect(typeof opts[symbols.querystringSchema].schema.type === 'string').toBeTruthy()
  expect(typeof opts[symbols.querystringSchema]).toBe('function')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('build schema - query schema abbreviated', async () => {
  expect.assertions(2)
  const serverConfig = {}
  const opts = {
    schema: {
      query: {
        type: 'object',
        properties: {
          hello: { type: 'string' }
        }
      }
    }
  }
  opts.schema = normalizeSchema(opts.schema, serverConfig)
  validation.compileSchemasForValidation(opts, ({ schema, method, url, httpPart }) => ajv.compile(schema))
  expect(typeof opts[symbols.querystringSchema].schema.type === 'string').toBeTruthy()
  expect(typeof opts[symbols.querystringSchema]).toBe('function')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('build schema - querystring schema', async () => {
  expect.assertions(2)
  const opts = {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          hello: { type: 'string' }
        }
      }
    }
  }
  validation.compileSchemasForValidation(opts, ({ schema, method, url, httpPart }) => ajv.compile(schema))
  expect(typeof opts[symbols.querystringSchema].schema.type === 'string').toBeTruthy()
  expect(typeof opts[symbols.querystringSchema]).toBe('function')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('build schema - querystring schema abbreviated', async () => {
  expect.assertions(2)
  const serverConfig = {}
  const opts = {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          hello: { type: 'string' }
        }
      }
    }
  }
  opts.schema = normalizeSchema(opts.schema, serverConfig)
  validation.compileSchemasForValidation(opts, ({ schema, method, url, httpPart }) => ajv.compile(schema))
  expect(typeof opts[symbols.querystringSchema].schema.type === 'string').toBeTruthy()
  expect(typeof opts[symbols.querystringSchema]).toBe('function')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('build schema - must throw if querystring and query schema exist', async () => {
  expect.assertions(2)
  try {
    const serverConfig = {}
    const opts = {
      schema: {
        query: {
          type: 'object',
          properties: {
            hello: { type: 'string' }
          }
        },
        querystring: {
          type: 'object',
          properties: {
            hello: { type: 'string' }
          }
        }
      }
    }
    opts.schema = normalizeSchema(opts.schema, serverConfig)
  } catch (err) {
    expect(err.code).toBe('XUFA_ERR_SCH_DUPLICATE')
    expect(err.message).toBe('Schema with \'querystring\' already present!')
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('build schema - params schema', async () => {
  expect.assertions(1)
  const opts = {
    schema: {
      params: {
        type: 'object',
        properties: {
          hello: { type: 'string' }
        }
      }
    }
  }
  validation.compileSchemasForValidation(opts, ({ schema, method, url, httpPart }) => ajv.compile(schema))
  expect(typeof opts[symbols.paramsSchema]).toBe('function')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('build schema - headers schema', async () => {
  expect.assertions(1)
  const opts = {
    schema: {
      headers: {
        type: 'object',
        properties: {
          'content-type': { type: 'string' }
        }
      }
    }
  }
  validation.compileSchemasForValidation(opts, ({ schema, method, url, httpPart }) => ajv.compile(schema))
  expect(typeof opts[symbols.headersSchema]).toBe('function')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('build schema - headers are lowercase', async () => {
  expect.assertions(1)
  const opts = {
    schema: {
      headers: {
        type: 'object',
        properties: {
          'Content-Type': { type: 'string' }
        }
      }
    }
  }
  validation.compileSchemasForValidation(opts, ({ schema, method, url, httpPart }) => {
    expect(schema.properties['content-type']).toBeTruthy()
    return () => { }
  })

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('build schema - headers are not lowercased in case of custom object', async () => {
  expect.assertions(1)

  class Headers { }
  const opts = {
    schema: {
      headers: new Headers()
    }
  }
  validation.compileSchemasForValidation(opts, ({ schema, method, url, httpPart }) => {
    expect(schema).toBeTruthy()
    return () => { }
  })

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('build schema - headers are not lowercased in case of custom validator provided', async () => {
  expect.assertions(1)

  class Headers { }
  const opts = {
    schema: {
      headers: new Headers()
    }
  }
  validation.compileSchemasForValidation(opts, ({ schema, method, url, httpPart }) => {
    expect(schema).toBeTruthy()
    return () => { }
  }, true)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('build schema - uppercased headers are not included', async () => {
  expect.assertions(1)
  const opts = {
    schema: {
      headers: {
        type: 'object',
        properties: {
          'Content-Type': { type: 'string' }
        }
      }
    }
  }
  validation.compileSchemasForValidation(opts, ({ schema, method, url, httpPart }) => {
    expect('Content-Type' in schema.properties).toBeFalsy()
    return () => { }
  })

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('build schema - mixed schema types are individually skipped or normalized', async () => {
  expect.assertions(2)

  class CustomSchemaClass { }

  const testCases = [{
    schema: {
      body: new CustomSchemaClass()
    },
    assertions: (schema) => {
      expect(schema.body).toBeTruthy()
    }
  }, {
    schema: {
      response: {
        200: new CustomSchemaClass()
      }
    },
    assertions: (schema) => {
      expect(schema.response[200]).toBeTruthy()
    }
  }]

  testCases.forEach((testCase) => {
    const result = normalizeSchema(testCase.schema, {})
    testCase.assertions(result)
  })

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
