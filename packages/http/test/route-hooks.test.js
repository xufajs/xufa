'use strict'

const { Readable } = require('node:stream')

const Fastify = require('@xufa/http')

function endRouteHook (doneOrPayload, done, doneValue) {
  if (typeof doneOrPayload === 'function') {
    doneOrPayload(doneValue)
  } else {
    done(doneValue)
  }
}

function testExecutionHook (hook) {
  test(`${hook}`, (testDone) => {
    expect.assertions(3)
    const fastify = Fastify()

    fastify.post('/', {
      [hook]: (req, reply, doneOrPayload, done) => {
        expect('hook called').toBeTruthy()
        endRouteHook(doneOrPayload, done)
      }
    }, (req, reply) => {
      reply.send(req.body)
    })

    fastify.inject({
      method: 'POST',
      url: '/',
      payload: { hello: 'world' }
    }, (err, res) => {
      expect(err).toBeFalsy()
      const payload = JSON.parse(res.payload)
      expect(payload).toEqual({ hello: 'world' })
      testDone()
    })
  })

  test(`${hook} option should be called after ${hook} hook`, (testDone) => {
    expect.assertions(3)
    const fastify = Fastify()
    const checker = Object.defineProperty({ calledTimes: 0 }, 'check', {
      get: function () { return ++this.calledTimes }
    })

    fastify.addHook(hook, (req, reply, doneOrPayload, done) => {
      expect(checker.check).toBe(1)
      endRouteHook(doneOrPayload, done)
    })

    fastify.post('/', {
      [hook]: (req, reply, doneOrPayload, done) => {
        expect(checker.check).toBe(2)
        endRouteHook(doneOrPayload, done)
      }
    }, (req, reply) => {
      reply.send({})
    })

    fastify.inject({
      method: 'POST',
      url: '/',
      payload: { hello: 'world' }
    }, (err, res) => {
      expect(err).toBeFalsy()
      testDone()
    })
  })

  test(`${hook} option could accept an array of functions`, (testDone) => {
    expect.assertions(3)
    const fastify = Fastify()
    const checker = Object.defineProperty({ calledTimes: 0 }, 'check', {
      get: function () { return ++this.calledTimes }
    })

    fastify.post('/', {
      [hook]: [
        (req, reply, doneOrPayload, done) => {
          expect(checker.check).toBe(1)
          endRouteHook(doneOrPayload, done)
        },
        (req, reply, doneOrPayload, done) => {
          expect(checker.check).toBe(2)
          endRouteHook(doneOrPayload, done)
        }
      ]
    }, (req, reply) => {
      reply.send({})
    })

    fastify.inject({
      method: 'POST',
      url: '/',
      payload: { hello: 'world' }
    }, (err, res) => {
      expect(err).toBeFalsy()
      testDone()
    })
  })

  test(`${hook} option could accept an array of async functions`, (testDone) => {
    expect.assertions(3)
    const fastify = Fastify()
    const checker = Object.defineProperty({ calledTimes: 0 }, 'check', {
      get: function () { return ++this.calledTimes }
    })

    fastify.post('/', {
      [hook]: [
        async (req, reply) => {
          expect(checker.check).toBe(1)
        },
        async (req, reply) => {
          expect(checker.check).toBe(2)
        }
      ]
    }, (req, reply) => {
      reply.send({})
    })

    fastify.inject({
      method: 'POST',
      url: '/',
      payload: { hello: 'world' }
    }, (err, res) => {
      expect(err).toBeFalsy()
      testDone()
    })
  })

  test(`${hook} option does not interfere with ${hook} hook`, (testDone) => {
    expect.assertions(7)
    const fastify = Fastify()
    const checker = Object.defineProperty({ calledTimes: 0 }, 'check', {
      get: function () { return ++this.calledTimes }
    })

    fastify.addHook(hook, (req, reply, doneOrPayload, done) => {
      expect(checker.check).toBe(1)
      endRouteHook(doneOrPayload, done)
    })

    fastify.post('/', {
      [hook]: (req, reply, doneOrPayload, done) => {
        expect(checker.check).toBe(2)
        endRouteHook(doneOrPayload, done)
      }
    }, handler)

    fastify.post('/no', handler)

    function handler (req, reply) {
      reply.send({})
    }

    fastify.inject({
      method: 'post',
      url: '/'
    }, (err, res) => {
      expect(err).toBeFalsy()
      expect(checker.calledTimes).toBe(2)

      checker.calledTimes = 0

      fastify.inject({
        method: 'post',
        url: '/no'
      }, (err, res) => {
        expect(err).toBeFalsy()
        expect(checker.calledTimes).toBe(1)
        testDone()
      })
    })
  })
}

function testBeforeHandlerHook (hook) {
  test(`${hook} option should be unique per route`, (testDone) => {
    expect.assertions(4)
    const fastify = Fastify()

    fastify.post('/', {
      [hook]: (req, reply, doneOrPayload, done) => {
        req.hello = 'earth'
        endRouteHook(doneOrPayload, done)
      }
    }, (req, reply) => {
      reply.send({ hello: req.hello })
    })

    fastify.post('/no', (req, reply) => {
      reply.send(req.body)
    })

    fastify.inject({
      method: 'POST',
      url: '/',
      payload: { hello: 'world' }
    }, (err, res) => {
      expect(err).toBeFalsy()
      const payload = JSON.parse(res.payload)
      expect(payload).toEqual({ hello: 'earth' })
    })

    fastify.inject({
      method: 'POST',
      url: '/no',
      payload: { hello: 'world' }
    }, (err, res) => {
      expect(err).toBeFalsy()
      const payload = JSON.parse(res.payload)
      expect(payload).toEqual({ hello: 'world' })
      testDone()
    })
  })

  test(`${hook} option should handle errors`, (testDone) => {
    expect.assertions(3)
    const fastify = Fastify()

    fastify.post('/', {
      [hook]: (req, reply, doneOrPayload, done) => {
        endRouteHook(doneOrPayload, done, new Error('kaboom'))
      }
    }, (req, reply) => {
      reply.send(req.body)
    })

    fastify.inject({
      method: 'POST',
      url: '/',
      payload: { hello: 'world' }
    }, (err, res) => {
      expect(err).toBeFalsy()
      const payload = JSON.parse(res.payload)
      expect(res.statusCode).toBe(500)
      expect(payload).toEqual({
        message: 'kaboom',
        error: 'Internal Server Error',
        statusCode: 500
      })
      testDone()
    })
  })

  test(`${hook} option should handle throwing objects`, (testDone) => {
    expect.assertions(4)
    const fastify = Fastify()

    const myError = { myError: 'kaboom' }

    fastify.setErrorHandler(async (error, request, reply) => {
      expect(error).toEqual(myError)
      return reply.code(500).send({ this: 'is', my: 'error' })
    })

    fastify.get('/', {
      [hook]: async () => {
        throw myError
      }
    }, (req, reply) => {
      expect.fail('the handler must not be called')
    })

    fastify.inject({
      url: '/',
      method: 'GET'
    }, (err, res) => {
      expect(err).toBeFalsy()
      expect(res.statusCode).toBe(500)
      expect(res.json()).toEqual({ this: 'is', my: 'error' })
      testDone()
    })
  })

  test(`${hook} option should handle throwing objects by default`, (testDone) => {
    expect.assertions(3)
    const fastify = Fastify()

    fastify.get('/', {
      [hook]: async () => {
        // eslint-disable-next-line no-throw-literal
        throw { myError: 'kaboom', message: 'i am an error' }
      }
    }, (req, reply) => {
      expect.fail('the handler must not be called')
    })

    fastify.inject({
      url: '/',
      method: 'GET'
    }, (err, res) => {
      expect(err).toBeFalsy()
      expect(res.statusCode).toBe(500)
      expect(res.json()).toEqual({ myError: 'kaboom', message: 'i am an error' })
      testDone()
    })
  })

  test(`${hook} option should handle errors with custom status code`, (testDone) => {
    expect.assertions(3)
    const fastify = Fastify()

    fastify.post('/', {
      [hook]: (req, reply, doneOrPayload, done) => {
        reply.code(401)
        endRouteHook(doneOrPayload, done, new Error('go away'))
      }
    }, (req, reply) => {
      reply.send(req.body)
    })

    fastify.inject({
      method: 'POST',
      url: '/',
      payload: { hello: 'world' }
    }, (err, res) => {
      expect(err).toBeFalsy()
      const payload = JSON.parse(res.payload)
      expect(res.statusCode).toBe(401)
      expect(payload).toEqual({
        message: 'go away',
        error: 'Unauthorized',
        statusCode: 401
      })
      testDone()
    })
  })

  test(`${hook} option should keep the context`, (testDone) => {
    expect.assertions(3)
    const fastify = Fastify()

    fastify.decorate('foo', 42)

    fastify.post('/', {
      [hook]: function (req, reply, doneOrPayload, done) {
        expect(this.foo).toBe(42)
        this.foo += 1
        endRouteHook(doneOrPayload, done)
      }
    }, function (req, reply) {
      reply.send({ foo: this.foo })
    })

    fastify.inject({
      method: 'POST',
      url: '/',
      payload: { hello: 'world' }
    }, (err, res) => {
      expect(err).toBeFalsy()
      const payload = JSON.parse(res.payload)
      expect(payload).toEqual({ foo: 43 })
      testDone()
    })
  })

  test(`${hook} option should keep the context (array)`, (testDone) => {
    expect.assertions(3)
    const fastify = Fastify()

    fastify.decorate('foo', 42)

    fastify.post('/', {
      [hook]: [function (req, reply, doneOrPayload, done) {
        expect(this.foo).toBe(42)
        this.foo += 1
        endRouteHook(doneOrPayload, done)
      }]
    }, function (req, reply) {
      reply.send({ foo: this.foo })
    })

    fastify.inject({
      method: 'POST',
      url: '/',
      payload: { hello: 'world' }
    }, (err, res) => {
      expect(err).toBeFalsy()
      const payload = JSON.parse(res.payload)
      expect(payload).toEqual({ foo: 43 })
      testDone()
    })
  })
}

testExecutionHook('preHandler')
testExecutionHook('onSend')
testExecutionHook('onRequest')
testExecutionHook('onResponse')
testExecutionHook('preValidation')
testExecutionHook('preParsing')
// hooks that comes before the handler
testBeforeHandlerHook('preHandler')
testBeforeHandlerHook('onRequest')
testBeforeHandlerHook('preValidation')
testBeforeHandlerHook('preParsing')

test('preValidation option should be called before preHandler hook', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.addHook('preHandler', (req, reply, done) => {
    expect(req.called).toBeTruthy()
    done()
  })

  fastify.post('/', {
    preValidation: (req, reply, done) => {
      req.called = true
      done()
    }
  }, (req, reply) => {
    reply.send(req.body)
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    payload: { hello: 'world' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    const payload = JSON.parse(res.payload)
    expect(payload).toEqual({ hello: 'world' })
    testDone()
  })
})

test('preSerialization option should be able to modify the payload', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.get('/only', {
    preSerialization: (req, reply, payload, done) => {
      done(null, { hello: 'another world' })
    }
  }, (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.inject({
    method: 'GET',
    url: '/only'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ hello: 'another world' })
    testDone()
  })
})

test('preParsing option should be called before preValidation hook', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.addHook('preValidation', (req, reply, done) => {
    expect(req.called).toBeTruthy()
    done()
  })

  fastify.post('/', {
    preParsing: (req, reply, payload, done) => {
      req.called = true
      done()
    }
  }, (req, reply) => {
    reply.send(req.body)
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    payload: { hello: 'world' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    const payload = JSON.parse(res.payload)
    expect(payload).toEqual({ hello: 'world' })
    testDone()
  })
})

test('preParsing option should be able to modify the payload', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.post('/only', {
    preParsing: (req, reply, payload, done) => {
      const stream = new Readable()
      stream.receivedEncodedLength = parseInt(req.headers['content-length'], 10)
      stream.push(JSON.stringify({ hello: 'another world' }))
      stream.push(null)
      done(null, stream)
    }
  }, (req, reply) => {
    reply.send(req.body)
  })

  fastify.inject({
    method: 'POST',
    url: '/only',
    payload: { hello: 'world' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ hello: 'another world' })
    testDone()
  })
})

test('preParsing option should be able to supply statusCode', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.post('/only', {
    preParsing: async (req, reply, payload) => {
      const stream = new Readable({
        read () {
          const error = new Error('kaboom')
          error.statusCode = 408
          this.destroy(error)
        }
      })
      stream.receivedEncodedLength = 20
      return stream
    },
    onError: async (req, res, err) => {
      expect(err.statusCode).toBe(408)
    }
  }, (req, reply) => {
    expect.fail('should not be called')
  })

  fastify.inject({
    method: 'POST',
    url: '/only',
    payload: { hello: 'world' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(408)
    expect(JSON.parse(res.payload)).toEqual({
      statusCode: 408,
      error: 'Request Timeout',
      message: 'kaboom'
    })
    testDone()
  })
})

test('onRequest option should be called before preParsing', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.addHook('preParsing', (req, reply, payload, done) => {
    expect(req.called).toBeTruthy()
    done()
  })

  fastify.post('/', {
    onRequest: (req, reply, done) => {
      req.called = true
      done()
    }
  }, (req, reply) => {
    reply.send(req.body)
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    payload: { hello: 'world' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    const payload = JSON.parse(res.payload)
    expect(payload).toEqual({ hello: 'world' })
    testDone()
  })
})

test('onTimeout on route', async () => {
  expect.assertions(3)
  const fastify = Fastify({ connectionTimeout: 500 })

  fastify.get('/timeout', {
    handler (request, reply) { },
    onTimeout (request, reply, done) {
      expect('onTimeout called').toBeTruthy()
      done()
    }
  })

  const address = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  try {
    await fetch(`${address}/timeout`)
    expect.fail('Should have thrown an error')
  } catch (err) {
    expect(err instanceof Error).toBeTruthy()
    expect(err.message).toBe('fetch failed')
  }
})

test('onError on route', (testDone) => {
  expect.assertions(3)

  const fastify = Fastify()

  const err = new Error('kaboom')

  fastify.get('/',
    {
      onError (request, reply, error, done) {
        expect(error).toEqual(err)
        done()
      }
    },
    (req, reply) => {
      reply.send(err)
    })

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({
      error: 'Internal Server Error',
      message: 'kaboom',
      statusCode: 500
    })
    testDone()
  })
})
