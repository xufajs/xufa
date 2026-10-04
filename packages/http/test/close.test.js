'use strict'

const net = require('node:net')
const http = require('node:http')

const Fastify = require('..')
const { Client } = require('undici')
const split = require('split2')
const { sleep } = require('./helper')

test('close callback', (testDone) => {
  expect.assertions(7)
  const fastify = Fastify()
  fastify.addHook('onClose', onClose)
  function onClose (instance, done) {
    expect(typeof fastify === typeof this).toBeTruthy()
    expect(typeof fastify === typeof instance).toBeTruthy()
    expect(fastify).toBe(this)
    expect(fastify).toBe(instance)
    done()
  }

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    fastify.close((err) => {
      expect(err).toBeFalsy()
      expect('close callback').toBeTruthy()
      testDone()
    })
  })
})

test('inside register', (done) => {
  expect.assertions(5)
  const fastify = Fastify()
  fastify.register(function (f, opts, done) {
    f.addHook('onClose', onClose)
    function onClose (instance, done) {
      expect(instance.prototype === fastify.prototype).toBeTruthy()
      expect(instance).toBe(f)
      done()
    }

    done()
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    fastify.close((err) => {
      expect(err).toBeFalsy()
      expect('close callback').toBeTruthy()
      done()
    })
  })
})

test('close order', (done) => {
  expect.assertions(5)
  const fastify = Fastify()
  const order = [1, 2, 3]

  fastify.register(function (f, opts, done) {
    f.addHook('onClose', (instance, done) => {
      expect(order.shift()).toBe(1)
      done()
    })

    done()
  })

  fastify.addHook('onClose', (instance, done) => {
    expect(order.shift()).toBe(2)
    done()
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    fastify.close((err) => {
      expect(err).toBeFalsy()
      expect(order.shift()).toBe(3)
      done()
    })
  })
})

test('close order - async', async () => {
  expect.assertions(3)
  const fastify = Fastify()
  const order = [1, 2, 3]

  fastify.register(function (f, opts, done) {
    f.addHook('onClose', async instance => {
      expect(order.shift()).toBe(1)
    })

    done()
  })

  fastify.addHook('onClose', () => {
    expect(order.shift()).toBe(2)
  })

  await fastify.listen({ port: 0 })
  await fastify.close()

  expect(order.shift()).toBe(3)
})

test('should not throw an error if the server is not listening', (done) => {
  expect.assertions(2)
  const fastify = Fastify()
  fastify.addHook('onClose', onClose)
  function onClose (instance, done) {
    expect(instance.prototype === fastify.prototype).toBeTruthy()
    done()
  }

  fastify.close((err) => {
    expect(err).toBeFalsy()
    done()
  })
})

test('onClose should keep the context', (done) => {
  expect.assertions(4)
  const fastify = Fastify()
  fastify.register(plugin)

  function plugin (instance, opts, done) {
    instance.decorate('test', true)
    instance.addHook('onClose', onClose)
    expect(instance.prototype === fastify.prototype).toBeTruthy()

    function onClose (i, done) {
      expect(i.test).toBeTruthy()
      expect(i).toBe(instance)
      done()
    }

    done()
  }

  fastify.close((err) => {
    expect(err).toBeFalsy()
    done()
  })
})

test('Should return error while closing (promise) - injection', (done) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.addHook('onClose', (instance, done) => { done() })

  fastify.get('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    fastify.close()

    process.nextTick(() => {
      fastify.inject({
        method: 'GET',
        url: '/'
      }).catch(err => {
        expect(err).toBeTruthy()
        expect(err.code).toBe('XUFA_ERR_REOPENED_CLOSE_SERVER')
        done()
      })
    }, 100)
  })
})

test('Should return error while closing (callback) - injection', (done) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.addHook('onClose', (instance, done) => {
    setTimeout(done, 150)
  })

  fastify.get('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    fastify.close()

    setTimeout(() => {
      fastify.inject({
        method: 'GET',
        url: '/'
      }, (err, res) => {
        expect(err).toBeTruthy()
        expect(err.code).toBe('XUFA_ERR_REOPENED_CLOSE_SERVER')
        done()
      })
    }, 100)
  })
})

test('Current opened connection should NOT continue to work after closing and return "connection: close" header - return503OnClosing: false', (done) => {
  expect.assertions(4)
  const fastify = Fastify({
    return503OnClosing: false,
    forceCloseConnections: false
  })

  fastify.get('/', (req, reply) => {
    fastify.close()
    reply.send({ hello: 'world' })
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    const port = fastify.server.address().port
    const client = net.createConnection({ port }, () => {
      client.write('GET / HTTP/1.1\r\nHost: fastify.test\r\n\r\n')

      client.on('error', function () {
        // Depending on the Operating System
        // the socket could error or not.
        // However, it will always be closed.
      })

      client.on('close', function () {
        expect(true).toBeTruthy()
        done()
      })

      client.once('data', data => {
        expect(data.toString()).toMatch(/Connection:\s*keep-alive/i)
        expect(data.toString()).toMatch(/200 OK/i)

        client.write('GET / HTTP/1.1\r\nHost: fastify.test\r\n\r\n')
      })
    })
  })
})

test('Current opened connection should not accept new incoming connections', (done) => {
  expect.assertions(3)
  const fastify = Fastify({ forceCloseConnections: false })
  fastify.get('/', (req, reply) => {
    fastify.close()
    setTimeout(() => {
      reply.send({ hello: 'world' })
    }, 250)
  })

  fastify.listen({ port: 0 }, async err => {
    expect(err).toBeFalsy()
    const instance = new Client('http://localhost:' + fastify.server.address().port)
    let response = await instance.request({ path: '/', method: 'GET' })
    expect(response.statusCode).toBe(200)

    response = await instance.request({ path: '/', method: 'GET' })
    expect(response.statusCode).toBe(503)

    done()
  })
})

test('rejected incoming connections should be logged', (done) => {
  expect.assertions(2)
  const stream = split(JSON.parse)
  const fastify = Fastify({
    forceCloseConnections: false,
    logger: {
      stream,
      level: 'info'
    }
  })

  const messages = []
  stream.on('data', message => {
    messages.push(message)
  })
  fastify.get('/', (req, reply) => {
    fastify.close()
    setTimeout(() => {
      reply.send({ hello: 'world' })
    }, 250)
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    const instance = new Client('http://localhost:' + fastify.server.address().port)
    // initial request to trigger close
    instance.request({ path: '/', method: 'GET' })
    // subsequent request should be rejected
    instance.request({ path: '/', method: 'GET' }).then(() => {
      expect(messages.find(message => message.msg.includes('request aborted'))).toBeTruthy()
      done()
    })
  })
})

test('Cannot be reopened the closed server without listen callback', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.listen({ port: 0 })
  await fastify.close()

  try {
    await fastify.listen({ port: 0 })
  } catch (err) {
    expect(err).toBeTruthy()
    expect(err.code).toBe('XUFA_ERR_REOPENED_CLOSE_SERVER')
  }
})

test('Cannot be reopened the closed server has listen callback', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  await fastify.listen({ port: 0 })
  await fastify.close()

  await new Promise((resolve, reject) => {
    fastify.listen({ port: 0 }, err => {
      reject(err)
    })
  }).catch(err => {
    expect(err.code).toBe('XUFA_ERR_REOPENED_CLOSE_SERVER')
    expect(err).toBeTruthy()
  })
})

const server = http.createServer()
const noSupport = typeof server.closeAllConnections !== 'function'

test.skipIf(noSupport)('shutsdown while keep-alive connections are active (non-async, native)', (done) => {
  expect.assertions(5)

  const timeoutTime = 2 * 60 * 1000
  const fastify = Fastify({ forceCloseConnections: true })

  fastify.server.setTimeout(timeoutTime)
  fastify.server.keepAliveTimeout = timeoutTime

  fastify.get('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.listen({ port: 0 }, (err, address) => {
    expect(err).toBeFalsy()

    const client = new Client(
      'http://localhost:' + fastify.server.address().port,
      { keepAliveTimeout: 1 * 60 * 1000 }
    )
    client.request({ path: '/', method: 'GET' }, (err, response) => {
      expect(err).toBeFalsy()
      expect(client.closed).toBe(false)

      fastify.close((err) => {
        expect(err).toBeFalsy()

        // Due to the nature of the way we reap these keep-alive connections,
        // there hasn't been enough time before the server fully closed in order
        // for the client to have seen the socket get destroyed. The mere fact
        // that we have reached this callback is enough indication that the
        // feature being tested works as designed.
        expect(client.closed).toBe(false)
        done()
      })
    })
  })
})

test.skipIf(noSupport)('shutsdown while keep-alive connections are active (non-async, idle, native)', (done) => {
  expect.assertions(5)

  const timeoutTime = 2 * 60 * 1000
  const fastify = Fastify({ forceCloseConnections: 'idle' })

  fastify.server.setTimeout(timeoutTime)
  fastify.server.keepAliveTimeout = timeoutTime

  fastify.get('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.listen({ port: 0 }, (err, address) => {
    expect(err).toBeFalsy()

    const client = new Client(
      'http://localhost:' + fastify.server.address().port,
      { keepAliveTimeout: 1 * 60 * 1000 }
    )
    client.request({ path: '/', method: 'GET' }, (err, response) => {
      expect(err).toBeFalsy()
      expect(client.closed).toBe(false)

      fastify.close((err) => {
        expect(err).toBeFalsy()

        // Due to the nature of the way we reap these keep-alive connections,
        // there hasn't been enough time before the server fully closed in order
        // for the client to have seen the socket get destroyed. The mere fact
        // that we have reached this callback is enough indication that the
        // feature being tested works as designed.
        expect(client.closed).toBe(false)

        done()
      })
    })
  })
})

test('triggers on-close hook in the right order with multiple bindings', async () => {
  const expectedOrder = [1, 2, 3]
  const order = []
  const fastify = Fastify()

  expect.assertions(1)

  // Follows LIFO
  fastify.addHook('onClose', () => {
    order.push(2)
  })

  fastify.addHook('onClose', () => {
    order.push(1)
  })

  await fastify.listen({ port: 0 })

  await new Promise((resolve, reject) => {
    setTimeout(() => {
      fastify.close(err => {
        order.push(3)
        expect(order).toEqual(expectedOrder)

        if (err) expect(err).toBeFalsy()
        else resolve()
      })
    }, 2000)
  })
})

test.skipIf(noSupport)('triggers on-close hook in the right order with multiple bindings (forceCloseConnections - idle)', async () => {
  const expectedPayload = { hello: 'world' }
  const timeoutTime = 2 * 60 * 1000
  const expectedOrder = [1, 2]
  const order = []
  const fastify = Fastify({ forceCloseConnections: 'idle' })

  fastify.server.setTimeout(timeoutTime)
  fastify.server.keepAliveTimeout = timeoutTime

  fastify.get('/', async (req, reply) => {
    await new Promise((resolve) => {
      setTimeout(resolve, 1000)
    })

    return expectedPayload
  })

  fastify.addHook('onClose', () => {
    order.push(1)
  })

  await fastify.listen({ port: 0 })
  const addresses = fastify.addresses()
  const testPlan = (addresses.length * 2) + 1

  expect.assertions(testPlan)

  for (const addr of addresses) {
    const { family, address, port } = addr
    const host = family === 'IPv6' ? `[${address}]` : address
    const client = new Client(`http://${host}:${port}`, {
      keepAliveTimeout: 1 * 60 * 1000
    })

    client.request({ path: '/', method: 'GET' })
      .then((res) => res.body.json(), err => expect(err).toBeFalsy())
      .then(json => {
        expect(json).toEqual(expectedPayload)
        expect(client.closed).toBeFalsy()
      }, err => expect(err).toBeFalsy())
  }

  await new Promise((resolve, reject) => {
    setTimeout(() => {
      fastify.close(err => {
        order.push(2)
        expect(order).toEqual(expectedOrder)

        if (err) expect(err).toBeFalsy()
        else resolve()
      })
    }, 2000)
  })
})

test.skipIf(noSupport)('triggers on-close hook in the right order with multiple bindings (forceCloseConnections - true)', async () => {
  const expectedPayload = { hello: 'world' }
  const timeoutTime = 2 * 60 * 1000
  const expectedOrder = [1, 2]
  const order = []
  const fastify = Fastify({ forceCloseConnections: true })

  fastify.server.setTimeout(timeoutTime)
  fastify.server.keepAliveTimeout = timeoutTime

  fastify.get('/', async (req, reply) => {
    await new Promise((resolve) => {
      setTimeout(resolve, 1000)
    })

    return expectedPayload
  })

  fastify.addHook('onClose', () => {
    order.push(1)
  })

  await fastify.listen({ port: 0 })
  const addresses = fastify.addresses()
  const testPlan = (addresses.length * 2) + 1

  expect.assertions(testPlan)

  for (const addr of addresses) {
    const { family, address, port } = addr
    const host = family === 'IPv6' ? `[${address}]` : address
    const client = new Client(`http://${host}:${port}`, {
      keepAliveTimeout: 1 * 60 * 1000
    })

    client.request({ path: '/', method: 'GET' })
      .then((res) => res.body.json(), err => expect(err).toBeFalsy())
      .then(json => {
        expect(json).toEqual(expectedPayload)
        expect(client.closed).toBeFalsy()
      }, err => expect(err).toBeFalsy())
  }

  await new Promise((resolve, reject) => {
    setTimeout(() => {
      fastify.close(err => {
        order.push(2)
        expect(order).toEqual(expectedOrder)

        if (err) expect(err).toBeFalsy()
        else resolve()
      })
    }, 2000)
  })
})

test('shutsdown while keep-alive connections are active (non-async, custom)', (done) => {
  expect.assertions(5)

  const timeoutTime = 2 * 60 * 1000
  const fastify = Fastify({
    forceCloseConnections: true,
    serverFactory (handler) {
      const server = http.createServer(handler)

      server.closeAllConnections = null

      return server
    }
  })

  fastify.server.setTimeout(timeoutTime)
  fastify.server.keepAliveTimeout = timeoutTime

  fastify.get('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.listen({ port: 0 }, (err, address) => {
    expect(err).toBeFalsy()

    const client = new Client(
      'http://localhost:' + fastify.server.address().port,
      { keepAliveTimeout: 1 * 60 * 1000 }
    )
    client.request({ path: '/', method: 'GET' }, (err, response) => {
      expect(err).toBeFalsy()
      expect(client.closed).toBe(false)

      fastify.close((err) => {
        expect(err).toBeFalsy()

        // Due to the nature of the way we reap these keep-alive connections,
        // there hasn't been enough time before the server fully closed in order
        // for the client to have seen the socket get destroyed. The mere fact
        // that we have reached this callback is enough indication that the
        // feature being tested works as designed.
        expect(client.closed).toBe(false)

        done()
      })
    })
  })
})

test('preClose callback', (done) => {
  expect.assertions(5)
  const fastify = Fastify()
  fastify.addHook('onClose', onClose)
  let preCloseCalled = false
  function onClose (instance, done) {
    expect(preCloseCalled).toBe(true)
    done()
  }
  fastify.addHook('preClose', preClose)

  function preClose (done) {
    expect(typeof this === typeof fastify).toBeTruthy()
    preCloseCalled = true
    done()
  }

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    fastify.close((err) => {
      expect(err).toBeFalsy()
      expect('close callback').toBeTruthy()
      done()
    })
  })
})

test('preClose async', async () => {
  expect.assertions(2)
  const fastify = Fastify()
  fastify.addHook('onClose', onClose)
  let preCloseCalled = false
  async function onClose () {
    expect(preCloseCalled).toBe(true)
  }
  fastify.addHook('preClose', preClose)

  async function preClose () {
    preCloseCalled = true
    expect(typeof this === typeof fastify).toBeTruthy()
  }

  await fastify.listen({ port: 0 })

  await fastify.close()
})

test('preClose runs exactly once with a child plugin', async () => {
  expect.assertions(1)
  const fastify = Fastify()
  let count = 0

  fastify.register(async (child) => {
    child.get('/x', async () => 'ok')
  })
  fastify.addHook('preClose', async () => { count++ })

  await fastify.ready()
  await fastify.close()

  expect(count).toBe(1)
})

test('preClose runs exactly once with nested child plugins', async () => {
  expect.assertions(1)
  const fastify = Fastify()
  let count = 0

  fastify.register(async (child) => {
    child.register(async (grandchild) => {
      grandchild.get('/y', async () => 'ok')
    })
  })
  fastify.addHook('preClose', async () => { count++ })

  await fastify.ready()
  await fastify.close()

  expect(count).toBe(1)
})

test('preClose execution order', (done) => {
  expect.assertions(4)
  const fastify = Fastify()
  const order = []
  fastify.addHook('onClose', onClose)
  function onClose (instance, done) {
    expect(order).toEqual([1, 2, 3])
    done()
  }

  fastify.addHook('preClose', (done) => {
    setTimeout(function () {
      order.push(1)
      done()
    }, 200)
  })

  fastify.addHook('preClose', async () => {
    await sleep(100)
    order.push(2)
  })

  fastify.addHook('preClose', (done) => {
    setTimeout(function () {
      order.push(3)
      done()
    }, 100)
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    fastify.close((err) => {
      expect(err).toBeFalsy()
      expect('close callback').toBeTruthy()
      done()
    })
  })
})

test.skipIf(noSupport)('does not destroy connections with in-flight requests (forceCloseConnections - idle)', async () => {
  const fastify = Fastify({ forceCloseConnections: 'idle' })

  fastify.get('/', async () => {
    // the server starts closing while this request is still being served
    fastify.close()
    await sleep(200)
    return { hello: 'world' }
  })

  await fastify.listen({ port: 0 })

  const client = new Client('http://localhost:' + fastify.server.address().port)
  onTestFinished(() => client.close())

  const response = await client.request({ path: '/', method: 'GET' })
  expect(response.statusCode).toBe(200)
  expect(await response.body.json()).toEqual({ hello: 'world' })
})

test('does not destroy connections with in-flight requests (default options)', async () => {
  const fastify = Fastify()

  fastify.get('/', async () => {
    fastify.close()
    await sleep(200)
    return { hello: 'world' }
  })

  await fastify.listen({ port: 0 })

  const client = new Client('http://localhost:' + fastify.server.address().port)
  onTestFinished(() => client.close())

  const response = await client.request({ path: '/', method: 'GET' })
  expect(response.statusCode).toBe(200)
  expect(await response.body.json()).toEqual({ hello: 'world' })
})
