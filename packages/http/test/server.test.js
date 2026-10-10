'use strict'

const dns = require('node:dns')
const { networkInterfaces } = require('node:os')

const Fastify = require('..')
const undici = require('undici')

// The library with some of the modules it imports replaced (its modules are ES modules: proxyquire, which replaced
// the requires of CommonJS, cannot reach them; vyntra's doMock and a fresh import can).
async function xufaWith (mocks) {
  vi.resetModules()
  for (const [name, factory] of Object.entries(mocks)) vi.doMock(name, factory)
  try {
    return (await import('../lib/xufa.js')).default
  } finally {
    for (const name of Object.keys(mocks)) vi.doUnmock(name)
  }
}

const isIPv6Missing = !Object.values(networkInterfaces()).flat().some(({ family }) => family === 'IPv6')

test('listen should accept null port', async () => {
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  await expect(fastify.listen({ port: null })).resolves.not.toThrow()
})

test('listen should accept undefined port', async () => {
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  await expect(fastify.listen({ port: undefined })).resolves.not.toThrow()
})

test('listen should accept stringified number port', async () => {
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  await expect(fastify.listen({ port: '1234' })).resolves.not.toThrow()
})

test('listen should accept log text resolution function', async () => {
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  await expect(fastify.listen({
      host: '127.0.0.1',
      port: '1234',
      listenTextResolver: (address) => {
        expect(address).toBe('http://127.0.0.1:1234')
        return 'hardcoded text'
      }
    })).resolves.not.toThrow()
})

test('listen should reject string port', async () => {
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  try {
    await fastify.listen({ port: 'hello-world' })
  } catch (error) {
    expect(error.code).toBe('ERR_SOCKET_BAD_PORT')
  }

  try {
    await fastify.listen({ port: '1234hello' })
  } catch (error) {
    expect(error.code).toBe('ERR_SOCKET_BAD_PORT')
  }
})

test('Test for hostname and port', async () => {
  expect.assertions(3)
  const app = Fastify()
  onTestFinished(() => app.close())
  app.get('/host', (req, res) => {
    expect(req.host).toBe('localhost:8000')
    expect(req.hostname).toBe('localhost')
    expect(req.port).toBe(8000)
    res.send('ok')
  })

  await app.listen({ port: 8000 })
  await fetch('http://localhost:8000/host')
})

test.skipIf(isIPv6Missing)('Test for IPV6 port', async () => {
  expect.assertions(3)
  const app = Fastify()
  onTestFinished(() => app.close())
  app.get('/host', (req, res) => {
    expect(req.host).toBe('[::1]:3040')
    expect(req.hostname).toBe('[::1]')
    expect(req.port).toBe(3040)
    res.send('ok')
  })

  await app.listen({
    port: 3040,
    host: '::1'
  })
  await fetch('http://[::1]:3040/host')
})

describe('abort signal', () => {
test('should close server when aborted after', (end) => {
    expect.assertions(2)
    function onClose (instance, done) {
      expect(instance).toBe(fastify)
      done()
      end()
    }

    const controller = new AbortController()

    const fastify = Fastify()
    fastify.addHook('onClose', onClose)
    fastify.listen({ port: 1234, signal: controller.signal }, (err) => {
      expect(err).toBeFalsy()
      controller.abort()
    })
  })
test('should close server when aborted after - promise', async () => {
    expect.assertions(2)
    const resolver = {}
    resolver.promise = new Promise(function (resolve) {
      resolver.resolve = resolve
    })
    function onClose (instance, done) {
      expect(instance).toBe(fastify)
      done()
      resolver.resolve()
    }

    const controller = new AbortController()

    const fastify = Fastify()
    fastify.addHook('onClose', onClose)
    const address = await fastify.listen({ port: 1234, signal: controller.signal })
    expect(address).toBeTruthy()
    controller.abort()
    await resolver.promise
  })
test('should close server when aborted during fastify.ready - promise', async () => {
    expect.assertions(2)
    const resolver = {}
    resolver.promise = new Promise(function (resolve) {
      resolver.resolve = resolve
    })
    function onClose (instance, done) {
      expect(instance).toBe(fastify)
      done()
      resolver.resolve()
    }

    const controller = new AbortController()

    const fastify = Fastify()
    fastify.addHook('onClose', onClose)
    const promise = fastify.listen({ port: 1234, signal: controller.signal })
    controller.abort()
    const address = await promise
    // since the main server is not listening yet, or will not listen
    // it should return undefined
    expect(address).toBe(undefined)
    await resolver.promise
  })
test('should close server when aborted during dns.lookup - promise', async () => {
    expect.assertions(2)
    const lookup = function (host, option, callback) {
      controller.abort()
      dns.lookup(host, option, callback)
    }
    const Fastify = await xufaWith({ 'node:dns': () => ({ ...dns, lookup, default: { ...dns, lookup } }) })
    const resolver = {}
    resolver.promise = new Promise(function (resolve) {
      resolver.resolve = resolve
    })
    function onClose (instance, done) {
      expect(instance).toBe(fastify)
      done()
      resolver.resolve()
    }

    const controller = new AbortController()

    const fastify = Fastify()
    fastify.addHook('onClose', onClose)
    const address = await fastify.listen({ port: 1234, signal: controller.signal })
    // since the main server is already listening then close
    // it should return address
    expect(address).toBeTruthy()
    await resolver.promise
  })
test('should close server when aborted before', (end) => {
    expect.assertions(1)
    function onClose (instance, done) {
      expect(instance).toBe(fastify)
      done()
      end()
    }

    const controller = new AbortController()
    controller.abort()

    const fastify = Fastify()
    fastify.addHook('onClose', onClose)
    fastify.listen({ port: 1234, signal: controller.signal }, () => {
      expect.fail('should not reach callback')
    })
  })
test('should close server when aborted before - promise', async () => {
    expect.assertions(2)
    const resolver = {}
    resolver.promise = new Promise(function (resolve) {
      resolver.resolve = resolve
    })
    function onClose (instance, done) {
      expect(instance).toBe(fastify)
      done()
      resolver.resolve()
    }

    const controller = new AbortController()
    controller.abort()

    const fastify = Fastify()
    fastify.addHook('onClose', onClose)
    const address = await fastify.listen({ port: 1234, signal: controller.signal })
    expect(address).toBe(undefined) // ensure the API signature
    await resolver.promise
  })
test('listen should not start server', (end) => {
    expect.assertions(2)
    function onClose (instance, done) {
      expect(instance).toBe(fastify)
      done()
      end()
    }
    const controller = new AbortController()

    const fastify = Fastify()
    fastify.addHook('onClose', onClose)
    fastify.listen({ port: 1234, signal: controller.signal }, (err) => {
      expect(err).toBeFalsy()
    })
    controller.abort()
    expect(fastify.server.listening).toBe(false)
  })
test('listen should not start server if already aborted', (end) => {
    expect.assertions(2)
    function onClose (instance, done) {
      expect(instance).toBe(fastify)
      done()
      end()
    }

    const controller = new AbortController()
    controller.abort()
    const fastify = Fastify()
    fastify.addHook('onClose', onClose)
    fastify.listen({ port: 1234, signal: controller.signal }, (err) => {
      expect(err).toBeFalsy()
    })
    expect(fastify.server.listening).toBe(false)
  })
test('listen should throw if received invalid signal', async () => {
    expect.assertions(2)
    const fastify = Fastify()

    try {
      fastify.listen({ port: 1234, signal: {} }, (err) => {
        expect(err).toBeFalsy()
      })
      expect.fail('should throw')
    } catch (e) {
      expect(e.code).toBe('XUFA_ERR_LISTEN_OPTIONS_INVALID')
      expect(e.message).toBe('Invalid listen options: \'Invalid options.signal\'')
    }
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
})

test('#5180 - preClose should be called before closing secondary server', async () => {
  expect.assertions(2)
  const fastify = Fastify({ forceCloseConnections: true })
  let flag = false
  onTestFinished(() => fastify.close())

  fastify.addHook('preClose', () => {
    flag = true
  })

  fastify.get('/', async (req, reply) => {
    // request will be pending for 1 second to simulate a slow request
    await new Promise((resolve) => { setTimeout(resolve, 1000) })
    return { hello: 'world' }
  })

  fastify.listen({ port: 0 }, (err) => {
    expect(err).toBeFalsy()
    const addresses = fastify.addresses()
    const mainServerAddress = fastify.server.address()
    let secondaryAddress
    for (const addr of addresses) {
      if (addr.family !== mainServerAddress.family) {
        secondaryAddress = addr
        secondaryAddress.address = secondaryAddress.family === 'IPv6'
          ? `[${secondaryAddress.address}]`
          : secondaryAddress.address
        break
      }
    }

    if (!secondaryAddress) {
      expect(true).toBeTruthy()
      return
    }

    undici.request(`http://${secondaryAddress.address}:${secondaryAddress.port}/`)
      .then(
        () => { expect.fail('Request should not succeed') },
        () => {
          expect(flag).toBeTruthy()
        }
      )

    // Close the server while the slow request is pending
    setTimeout(fastify.close, 250)
  })

  // Wait 1000ms to ensure that the test is finished and async operations are
  // completed
  await new Promise((resolve) => { setTimeout(resolve, 1000) })
})
