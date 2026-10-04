'use strict'


const Fastify = require('@xufa/http')
const immediate = require('node:util').promisify(setImmediate)

test('onReady should be called in order', (done) => {
  expect.assertions(7)
  const fastify = Fastify()

  let order = 0

  fastify.addHook('onReady', function (done) {
    expect(order++).toBe(0)
    expect(this.pluginName).toBe(fastify.pluginName)
    done()
  })

  fastify.register(async (childOne, o) => {
    childOne.addHook('onReady', function (done) {
      expect(order++).toBe(1)
      expect(this.pluginName).toBe(childOne.pluginName)
      done()
    })

    childOne.register(async (childTwo, o) => {
      childTwo.addHook('onReady', async function () {
        await immediate()
        expect(order++).toBe(2)
        expect(this.pluginName).toBe(childTwo.pluginName)
      })
    })
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    done()
  })
})

test('onReady should be called once', async () => {
  const app = Fastify()
  let counter = 0

  app.addHook('onReady', async function () {
    counter++
  })

  const promises = [1, 2, 3, 4, 5].map((id) => app.ready().then(() => id))

  const result = await Promise.race(promises)

  expect(result).toBe(1)
  expect(counter).toBe(1)
})

test('async onReady should be called in order', async () => {
  expect.assertions(7)
  const fastify = Fastify()

  let order = 0

  fastify.addHook('onReady', async function () {
    await immediate()
    expect(order++).toBe(0)
    expect(this.pluginName).toBe(fastify.pluginName)
  })

  fastify.register(async (childOne, o) => {
    childOne.addHook('onReady', async function () {
      await immediate()
      expect(order++).toBe(1)
      expect(this.pluginName).toBe(childOne.pluginName)
    })

    childOne.register(async (childTwo, o) => {
      childTwo.addHook('onReady', async function () {
        await immediate()
        expect(order++).toBe(2)
        expect(this.pluginName).toBe(childTwo.pluginName)
      })
    })
  })

  await fastify.ready()
  expect('ready').toBeTruthy()
})

test('mix ready and onReady', async () => {
  expect.assertions(2)
  const fastify = Fastify()
  let order = 0

  fastify.addHook('onReady', async function () {
    await immediate()
    order++
  })

  await fastify.ready()
  expect(order).toBe(1)

  await fastify.ready()
  expect(order).toBe(1)
})

test('listen and onReady order', async () => {
  expect.assertions(9)

  const fastify = Fastify()
  let order = 0

  fastify.register((instance, opts, done) => {
    instance.ready(checkOrder.bind(null, 0))
    instance.addHook('onReady', checkOrder.bind(null, 4))

    instance.register((subinstance, opts, done) => {
      subinstance.ready(checkOrder.bind(null, 1))
      subinstance.addHook('onReady', checkOrder.bind(null, 5))

      subinstance.register((realSubInstance, opts, done) => {
        realSubInstance.ready(checkOrder.bind(null, 2))
        realSubInstance.addHook('onReady', checkOrder.bind(null, 6))
        done()
      })
      done()
    })
    done()
  })

  fastify.addHook('onReady', checkOrder.bind(null, 3))

  await fastify.ready()
  expect('trigger the onReady').toBeTruthy()
  await fastify.listen({ port: 0 })
  expect('do not trigger the onReady').toBeTruthy()

  await fastify.close()

  function checkOrder (shouldbe) {
    expect(order).toBe(shouldbe)
    order++
  }
})

test('multiple ready calls', async () => {
  expect.assertions(11)

  const fastify = Fastify()
  let order = 0

  fastify.register(async (instance, opts) => {
    instance.ready(checkOrder.bind(null, 1))
    instance.addHook('onReady', checkOrder.bind(null, 6))

    await instance.register(async (subinstance, opts) => {
      subinstance.ready(checkOrder.bind(null, 2))
      subinstance.addHook('onReady', checkOrder.bind(null, 7))
    })

    expect(order).toBe(0)
    order++
  })

  fastify.addHook('onReady', checkOrder.bind(null, 3))
  fastify.addHook('onReady', checkOrder.bind(null, 4))
  fastify.addHook('onReady', checkOrder.bind(null, 5))

  await fastify.ready()
  expect('trigger the onReady').toBeTruthy()

  await fastify.ready()
  expect('do not trigger the onReady').toBeTruthy()

  await fastify.ready()
  expect('do not trigger the onReady').toBeTruthy()

  function checkOrder (shouldbe) {
    expect(order).toBe(shouldbe)
    order++
  }
})

test('onReady should manage error in sync', (done) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.addHook('onReady', function (done) {
    expect('called in root').toBeTruthy()
    done()
  })

  fastify.register(async (childOne, o) => {
    childOne.addHook('onReady', function (done) {
      expect('called in childOne').toBeTruthy()
      done(new Error('FAIL ON READY'))
    })

    childOne.register(async (childTwo, o) => {
      childTwo.addHook('onReady', async function () {
        expect.fail('should not be called')
      })
    })
  })

  fastify.ready(err => {
    expect(err).toBeTruthy()
    expect(err.message).toBe('FAIL ON READY')
    done()
  })
})

test('onReady should manage error in async', (done) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.addHook('onReady', function (done) {
    expect('called in root').toBeTruthy()
    done()
  })

  fastify.register(async (childOne, o) => {
    childOne.addHook('onReady', async function () {
      expect('called in childOne').toBeTruthy()
      throw new Error('FAIL ON READY')
    })

    childOne.register(async (childTwo, o) => {
      childTwo.addHook('onReady', async function () {
        expect.fail('should not be called')
      })
    })
  })

  fastify.ready(err => {
    expect(err).toBeTruthy()
    expect(err.message).toBe('FAIL ON READY')
    done()
  })
})

test('onReady should manage sync error', (done) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.addHook('onReady', function (done) {
    expect('called in root').toBeTruthy()
    done()
  })

  fastify.register(async (childOne, o) => {
    childOne.addHook('onReady', function (done) {
      expect('called in childOne').toBeTruthy()
      throw new Error('FAIL UNWANTED SYNC EXCEPTION')
    })

    childOne.register(async (childTwo, o) => {
      childTwo.addHook('onReady', async function () {
        expect.fail('should not be called')
      })
    })
  })

  fastify.ready(err => {
    expect(err).toBeTruthy()
    expect(err.message).toBe('FAIL UNWANTED SYNC EXCEPTION')
    done()
  })
})

test('onReady can not add decorators or application hooks', (done) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.addHook('onReady', function (done) {
    expect('called in root').toBeTruthy()
    fastify.decorate('test', () => {})

    fastify.addHook('onReady', async function () {
      expect.fail('it will be not called')
    })
    done()
  })

  fastify.addHook('onReady', function (done) {
    expect(this.hasDecorator('test')).toBeTruthy()
    done()
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    done()
  })
})

test('onReady cannot add lifecycle hooks', (done) => {
  expect.assertions(5)
  const fastify = Fastify()

  fastify.addHook('onReady', function (done) {
    expect('called in root').toBeTruthy()
    try {
      fastify.addHook('onRequest', (request, reply, done) => {})
    } catch (error) {
      expect(error).toBeTruthy()
      expect(error.message).toBe('Root plugin has already booted')
      // TODO: look where the error pops up
      expect(error.code).toBe('BOOT_ERR_ROOT_PLG_BOOTED')
      done(error)
    }
  })

  fastify.addHook('onRequest', (request, reply, done) => {})
  fastify.get('/', async () => 'hello')

  fastify.ready((err) => {
    expect(err).toBeTruthy()
    done()
  })
})

test('onReady throw loading error', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  try {
    fastify.addHook('onReady', async function (done) {})
  } catch (e) {
    expect(e.code).toBe('XUFA_ERR_HOOK_INVALID_ASYNC_HANDLER')
    expect(e.message === 'Async function has too many arguments. Async hooks should not use the \'done\' argument.').toBeTruthy()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('onReady does not call done', (done) => {
  expect.assertions(6)
  const fastify = Fastify({ pluginTimeout: 500 })

  fastify.addHook('onReady', function someHookName (done) {
    expect('called in root').toBeTruthy()
    // done() // don't call done to test timeout
  })

  fastify.ready(err => {
    expect(err).toBeTruthy()
    expect(err.message).toBe('A callback for \'onReady\' hook "someHookName" timed out. You may have forgotten to call \'done\' function or to resolve a Promise')
    expect(err.code).toBe('XUFA_ERR_HOOK_TIMEOUT')
    expect(err.cause).toBeTruthy()
    expect(err.cause.code).toBe('BOOT_ERR_READY_TIMEOUT')
    done()
  })
})

test('onReady execution order', (done) => {
  expect.assertions(3)
  const fastify = Fastify({ })

  let i = 0
  fastify.ready(() => { i++; expect(i).toBe(1) })
  fastify.ready(() => { i++; expect(i).toBe(2) })
  fastify.ready(() => {
    i++
    expect(i).toBe(3)
    done()
  })
})

test('ready return the server with callback', (done) => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.ready((err, instance) => {
    expect(err).toBeFalsy()
    expect(instance).toEqual(fastify)
    done()
  })
})

test('ready return the server with Promise', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.ready()
    .then(instance => { expect(instance).toEqual(fastify) })
    .catch(err => { expect.fail(err) })
})

test('ready return registered', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.register((one, opts, done) => {
    one.ready().then(itself => { expect(itself).toEqual(one) })
    done()
  })

  fastify.register((two, opts, done) => {
    two.ready().then(itself => { expect(itself).toEqual(two) })

    two.register((twoDotOne, opts, done) => {
      twoDotOne.ready().then(itself => { expect(itself).toEqual(twoDotOne) })
      done()
    })
    done()
  })

  await fastify.ready()
    .then(instance => { expect(instance).toEqual(fastify) })
    .catch(err => { expect.fail(err) })
})

test('do not crash with error in follow up onReady hook', async () => {
  const fastify = Fastify()

  fastify.addHook('onReady', async function () {
  })

  fastify.addHook('onReady', function () {
    throw new Error('kaboom')
  })

  await expect(fastify.ready()).rejects.toThrow()
})
