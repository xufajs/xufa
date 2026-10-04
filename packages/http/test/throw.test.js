'use strict'


const Fastify = require('..')

test('Fastify should throw on wrong options', async () => {
  expect.assertions(2)
  try {
    Fastify('lol')
    expect.fail()
  } catch (e) {
    expect(e.message).toBe('Options must be an object')
    expect(true).toBeTruthy()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Fastify should throw on multiple assignment to the same route', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  fastify.get('/', () => {})

  try {
    fastify.get('/', () => {})
    expect.fail('Should throw fastify duplicated route declaration')
  } catch (error) {
    expect(error.code).toBe('XUFA_ERR_DUPLICATED_ROUTE')
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Fastify should throw on multiple assignment to the same route with array method', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  fastify.route({ method: ['GET', 'POST'], url: '/', handler: () => {} })

  try {
    fastify.route({ method: ['GET', 'POST'], url: '/', handler: () => {} })
    expect.fail('Should throw fastify duplicated route declaration')
  } catch (error) {
    expect(error.code).toBe('XUFA_ERR_DUPLICATED_ROUTE')
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Fastify should throw for an invalid schema, printing the error route - headers', async () => {
  expect.assertions(1)

  const badSchema = {
    type: 'object',
    properties: {
      bad: {
        type: 'bad-type'
      }
    }
  }
  const fastify = Fastify()
  fastify.get('/', { schema: { headers: badSchema } }, () => {})
  fastify.get('/not-loaded', { schema: { headers: badSchema } }, () => {})

  await expect(fastify.ready()).rejects.toThrow(expect.objectContaining({ code: 'XUFA_ERR_SCH_VALIDATION_BUILD', message: expect.stringMatching(/Failed building the validation schema for GET: \//) }))
})

test('Fastify should throw for an invalid schema, printing the error route - body', async () => {
  expect.assertions(1)
  const badSchema = {
    type: 'object',
    properties: {
      bad: {
        type: 'bad-type'
      }
    }
  }

  const fastify = Fastify()
  fastify.register((instance, opts, done) => {
    instance.post('/form', { schema: { body: badSchema } }, () => {})
    done()
  }, { prefix: 'hello' })

  await expect(fastify.ready()).rejects.toThrow(expect.objectContaining({ code: 'XUFA_ERR_SCH_VALIDATION_BUILD', message: expect.stringMatching(/Failed building the validation schema for POST: \/hello\/form/) }))
})

test('Should throw on unsupported method', async () => {
  expect.assertions(1)
  const fastify = Fastify()
  try {
    fastify.route({
      method: 'TROLL',
      url: '/',
      schema: {},
      handler: function (req, reply) {}
    })
    expect.fail()
  } catch (e) {
    expect(true).toBeTruthy()
  }
})

test('Should throw on missing handler', async () => {
  expect.assertions(1)
  const fastify = Fastify()
  try {
    fastify.route({
      method: 'GET',
      url: '/'
    })
    expect.fail()
  } catch (e) {
    expect(true).toBeTruthy()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Should throw if one method is unsupported', async () => {
  expect.assertions(1)
  const fastify = Fastify()
  try {
    fastify.route({
      method: ['GET', 'TROLL'],
      url: '/',
      schema: {},
      handler: function (req, reply) {}
    })
    expect.fail()
  } catch (e) {
    expect(true).toBeTruthy()
  }
})

test('Should throw on duplicate content type parser', async () => {
  expect.assertions(1)
  const fastify = Fastify()
  function customParser (req, payload, done) { done(null, '') }

  fastify.addContentTypeParser('application/qq', customParser)
  try {
    fastify.addContentTypeParser('application/qq', customParser)
    expect.fail()
  } catch (e) {
    expect(true).toBeTruthy()
  }
})

test('Should throw on duplicate decorator', async () => {
  expect.assertions(1)

  const fastify = Fastify()
  const fooObj = {}

  fastify.decorate('foo', fooObj)
  try {
    fastify.decorate('foo', fooObj)
    expect.fail()
  } catch (e) {
    expect(true).toBeTruthy()
  }
})

test('Should not throw on duplicate decorator encapsulation', async () => {
  expect.assertions(1)
  const fastify = Fastify()
  const foo2Obj = {}

  fastify.decorate('foo2', foo2Obj)

  fastify.register(function (fastify, opts, done) {
    expect(() => {
      fastify.decorate('foo2', foo2Obj)
    }).not.toThrow()
    done()
  })

  await fastify.ready()
})

test('Should throw on duplicate request decorator', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.decorateRequest('foo', null)
  try {
    fastify.decorateRequest('foo', null)
    expect.fail()
  } catch (e) {
    expect(e.code).toBe('XUFA_ERR_DEC_ALREADY_PRESENT')
    expect(e.message).toBe('The decorator \'foo\' has already been added!')
  }
})

test('Should throw if request decorator dependencies are not met', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  try {
    fastify.decorateRequest('bar', null, ['world'])
    expect.fail()
  } catch (e) {
    expect(e.code).toBe('XUFA_ERR_DEC_MISSING_DEPENDENCY')
    expect(e.message).toBe('The decorator is missing dependency \'world\'.')
  }
})

test('Should throw on duplicate reply decorator', async () => {
  expect.assertions(1)

  const fastify = Fastify()

  fastify.decorateReply('foo', null)
  try {
    fastify.decorateReply('foo', null)
    expect.fail()
  } catch (e) {
    expect(/has already been added/.test(e.message)).toBeTruthy()
  }
})

test('Should throw if reply decorator dependencies are not met', async () => {
  expect.assertions(1)

  const fastify = Fastify()

  try {
    fastify.decorateReply('bar', null, ['world'])
    expect.fail()
  } catch (e) {
    expect(/missing dependency/.test(e.message)).toBeTruthy()
  }
})

test('Should throw if handler as the third parameter to the shortcut method is missing and the second parameter is not a function and also not an object', async () => {
  expect.assertions(5)

  const fastify = Fastify()

  try {
    fastify.get('/foo/1', '')
    expect.fail()
  } catch (e) {
    expect(true).toBeTruthy()
  }

  try {
    fastify.get('/foo/2', 1)
    expect.fail()
  } catch (e) {
    expect(true).toBeTruthy()
  }

  try {
    fastify.get('/foo/3', [])
    expect.fail()
  } catch (e) {
    expect(true).toBeTruthy()
  }

  try {
    fastify.get('/foo/4', undefined)
    expect.fail()
  } catch (e) {
    expect(true).toBeTruthy()
  }

  try {
    fastify.get('/foo/5', null)
    expect.fail()
  } catch (e) {
    expect(true).toBeTruthy()
  }
})

test('Should throw if handler as the third parameter to the shortcut method is missing and the second parameter is not a function and also not an object', async () => {
  expect.assertions(5)

  const fastify = Fastify()

  try {
    fastify.get('/foo/1', '')
    expect.fail()
  } catch (e) {
    expect(true).toBeTruthy()
  }

  try {
    fastify.get('/foo/2', 1)
    expect.fail()
  } catch (e) {
    expect(true).toBeTruthy()
  }

  try {
    fastify.get('/foo/3', [])
    expect.fail()
  } catch (e) {
    expect(true).toBeTruthy()
  }

  try {
    fastify.get('/foo/4', undefined)
    expect.fail()
  } catch (e) {
    expect(true).toBeTruthy()
  }

  try {
    fastify.get('/foo/5', null)
    expect.fail()
  } catch (e) {
    expect(true).toBeTruthy()
  }
})

test('Should throw if there is handler function as the third parameter to the shortcut method and options as the second parameter is not an object', async () => {
  expect.assertions(5)

  const fastify = Fastify()

  try {
    fastify.get('/foo/1', '', (req, res) => {})
    expect.fail()
  } catch (e) {
    expect(true).toBeTruthy()
  }

  try {
    fastify.get('/foo/2', 1, (req, res) => {})
    expect.fail()
  } catch (e) {
    expect(true).toBeTruthy()
  }

  try {
    fastify.get('/foo/3', [], (req, res) => {})
    expect.fail()
  } catch (e) {
    expect(true).toBeTruthy()
  }

  try {
    fastify.get('/foo/4', undefined, (req, res) => {})
    expect.fail()
  } catch (e) {
    expect(true).toBeTruthy()
  }

  try {
    fastify.get('/foo/5', null, (req, res) => {})
    expect.fail()
  } catch (e) {
    expect(true).toBeTruthy()
  }
})

test('Should throw if found duplicate handler as the third parameter to the shortcut method and in options', async () => {
  expect.assertions(1)

  const fastify = Fastify()

  try {
    fastify.get('/foo/abc', {
      handler: (req, res) => {}
    }, (req, res) => {})
    expect.fail()
  } catch (e) {
    expect(true).toBeTruthy()
  }
})
