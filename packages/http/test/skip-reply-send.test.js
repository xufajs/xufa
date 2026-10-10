'use strict'


const split = require('split2')
const net = require('node:net')
const Fastify = require('..')

const lifecycleHooks = [
  'onRequest',
  'preParsing',
  'preValidation',
  'preHandler',
  'preSerialization',
  'onSend',
  'onTimeout',
  'onResponse',
  'onError'
]

test('skip automatic reply.send() with reply.hijack and a body', async () => {
  const stream = split(JSON.parse)
  const app = Fastify({
    logger: {
      stream
    }
  })

  stream.on('data', (line) => {
    expect(line.level).not.toBe(40) // there are no errors
    expect(line.level).not.toBe(50) // there are no errors
  })

  app.get('/', (req, reply) => {
    reply.hijack()
    reply.raw.end('hello world')

    return Promise.resolve('this will be skipped')
  })

  await app.inject({
    method: 'GET',
    url: '/'
  }).then((res) => {
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('hello world')
  })
})

test('skip automatic reply.send() with reply.hijack and no body', async () => {
  const stream = split(JSON.parse)
  const app = Fastify({
    logger: {
      stream
    }
  })

  stream.on('data', (line) => {
    expect(line.level).not.toBe(40) // there are no error
    expect(line.level).not.toBe(50) // there are no error
  })

  app.get('/', (req, reply) => {
    reply.hijack()
    reply.raw.end('hello world')

    return Promise.resolve()
  })

  await app.inject({
    method: 'GET',
    url: '/'
  }).then((res) => {
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('hello world')
  })
})

test('skip automatic reply.send() with reply.hijack and an error', async () => {
  const stream = split(JSON.parse)
  const app = Fastify({
    logger: {
      stream
    }
  })

  let errorSeen = false

  stream.on('data', (line) => {
    if (line.level === 50) {
      errorSeen = true
      expect(line.err.message).toBe('kaboom')
      expect(line.msg).toBe('Promise errored, but reply.sent = true was set')
    }
  })

  app.get('/', (req, reply) => {
    reply.hijack()
    reply.raw.end('hello world')

    return Promise.reject(new Error('kaboom'))
  })

  await app.inject({
    method: 'GET',
    url: '/'
  }).then((res) => {
    expect(errorSeen).toBe(true)
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('hello world')
  })
})

function testHandlerOrBeforeHandlerHook (test, hookOrHandler) {
  const idx = hookOrHandler === 'handler' ? lifecycleHooks.indexOf('preHandler') : lifecycleHooks.indexOf(hookOrHandler)
  const previousHooks = lifecycleHooks.slice(0, idx)
  const nextHooks = lifecycleHooks.slice(idx + 1)

  describe(`Hijacking inside ${hookOrHandler} skips all the following hooks and handler execution`, () => {
test('Sending a response using reply.raw => onResponse hook is called', async () => {
      const stream = split(JSON.parse)
      const app = Fastify({
        logger: {
          stream
        }
      })

      stream.on('data', (line) => {
        expect(line.level).not.toBe(40) // there are no errors
        expect(line.level).not.toBe(50) // there are no errors
      })

      previousHooks.forEach(h => app.addHook(h, async (req, reply) => expect(`${h} should be called`).toBeTruthy()))

      if (hookOrHandler === 'handler') {
        app.get('/', (req, reply) => {
          reply.hijack()
          reply.raw.end(`hello from ${hookOrHandler}`)
        })
      } else {
        app.addHook(hookOrHandler, async (req, reply) => {
          reply.hijack()
          reply.raw.end(`hello from ${hookOrHandler}`)
        })
        app.get('/', (req, reply) => expect.fail('Handler should not be called'))
      }

      nextHooks.forEach(h => {
        if (h === 'onResponse') {
          app.addHook(h, async (req, reply) => expect(`${h} should be called`).toBeTruthy())
        } else {
          app.addHook(h, async (req, reply) => expect.fail(`${h} should not be called`))
        }
      })

      await app.inject({
        method: 'GET',
        url: '/'
      }).then((res) => {
        expect(res.statusCode).toBe(200)
        expect(res.body).toBe(`hello from ${hookOrHandler}`)
      })
    })
test('Sending a response using req.socket => onResponse not called', (testDone) => {
      const stream = split(JSON.parse)
      const app = Fastify({
        logger: {
          stream
        }
      })
      onTestFinished(() => app.close())

      stream.on('data', (line) => {
        expect(line.level).not.toBe(40) // there are no errors
        expect(line.level).not.toBe(50) // there are no errors
      })

      previousHooks.forEach(h => app.addHook(h, async (req, reply) => expect(`${h} should be called`).toBeTruthy()))

      if (hookOrHandler === 'handler') {
        app.get('/', (req, reply) => {
          reply.hijack()
          req.socket.write('HTTP/1.1 200 OK\r\n\r\n')
          req.socket.write(`hello from ${hookOrHandler}`)
          req.socket.end()
        })
      } else {
        app.addHook(hookOrHandler, async (req, reply) => {
          reply.hijack()
          req.socket.write('HTTP/1.1 200 OK\r\n\r\n')
          req.socket.write(`hello from ${hookOrHandler}`)
          req.socket.end()
        })
        app.get('/', (req, reply) => expect.fail('Handler should not be called'))
      }

      nextHooks.forEach(h => app.addHook(h, async (req, reply) => expect.fail(`${h} should not be called`)))

      app.listen({ port: 0 }, err => {
        expect(err).toBeFalsy()
        const client = net.createConnection({ port: (app.server.address()).port }, () => {
          client.write('GET / HTTP/1.1\r\nHost: fastify.test\r\n\r\n')

          let chunks = ''
          client.setEncoding('utf8')
          client.on('data', data => {
            chunks += data
          })

          client.on('end', function () {
            expect(chunks).toMatch(new RegExp(`hello from ${hookOrHandler}`, 'i'))
            testDone()
          })
        })
      })
    })
test('Throwing an error does not trigger any hooks', async () => {
      const stream = split(JSON.parse)
      const app = Fastify({
        logger: {
          stream
        }
      })
      onTestFinished(() => app.close())

      let errorSeen = false
      stream.on('data', (line) => {
        if (hookOrHandler === 'handler') {
          if (line.level === 40) {
            errorSeen = true
            expect(line.err.code).toBe('XUFA_ERR_REP_ALREADY_SENT')
          }
        } else {
          expect(line.level).not.toBe(40) // there are no errors
          expect(line.level).not.toBe(50) // there are no errors
        }
      })

      previousHooks.forEach(h => app.addHook(h, async (req, reply) => expect(`${h} should be called`).toBeTruthy()))

      if (hookOrHandler === 'handler') {
        app.get('/', (req, reply) => {
          reply.hijack()
          throw new Error('This will be skipped')
        })
      } else {
        app.addHook(hookOrHandler, async (req, reply) => {
          reply.hijack()
          throw new Error('This will be skipped')
        })
        app.get('/', (req, reply) => expect.fail('Handler should not be called'))
      }

      nextHooks.forEach(h => app.addHook(h, async (req, reply) => expect.fail(`${h} should not be called`)))

      await Promise.race([
        app.inject({ method: 'GET', url: '/' }),
        new Promise((resolve, reject) => setTimeout(resolve, 1000))
      ])

      if (hookOrHandler === 'handler') {
        expect(errorSeen).toBe(true)
      }
    })
test('Calling reply.send() after hijacking logs a warning', async () => {
      const stream = split(JSON.parse)
      const app = Fastify({
        logger: {
          stream
        }
      })

      let errorSeen = false

      stream.on('data', (line) => {
        if (line.level === 40) {
          errorSeen = true
          expect(line.err.code).toBe('XUFA_ERR_REP_ALREADY_SENT')
        }
      })

      previousHooks.forEach(h => app.addHook(h, async (req, reply) => expect(`${h} should be called`).toBeTruthy()))

      if (hookOrHandler === 'handler') {
        app.get('/', (req, reply) => {
          reply.hijack()
          reply.send('hello from reply.send()')
        })
      } else {
        app.addHook(hookOrHandler, async (req, reply) => {
          reply.hijack()
          return reply.send('hello from reply.send()')
        })
        app.get('/', (req, reply) => expect.fail('Handler should not be called'))
      }

      nextHooks.forEach(h => app.addHook(h, async (req, reply) => expect.fail(`${h} should not be called`)))

      await Promise.race([
        app.inject({ method: 'GET', url: '/' }),
        new Promise((resolve, reject) => setTimeout(resolve, 1000))
      ])

      expect(errorSeen).toBe(true)
    })
})
}

testHandlerOrBeforeHandlerHook(test, 'onRequest')
testHandlerOrBeforeHandlerHook(test, 'preParsing')
testHandlerOrBeforeHandlerHook(test, 'preValidation')
testHandlerOrBeforeHandlerHook(test, 'preHandler')
testHandlerOrBeforeHandlerHook(test, 'handler')
