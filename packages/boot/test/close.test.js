import boot from '../index.js';
import { BOOT_ERR_CALLBACK_NOT_FN } from '../lib/errors.js';

test('boot an app with a plugin', (done) => {
  expect.assertions(4)

  const app = boot()
  let last = false

  app.use(function (server, opts, done) {
    app.onClose(() => {
      expect('onClose called').toBeTruthy()
      expect(last).toBeFalsy()
      last = true
    })
    done()
  })

  app.on('start', () => {
    app.close(() => {
      expect(last).toBeTruthy()
      expect('Closed in the correct order').toBeTruthy()
      done()
    })
  })
})

test('onClose arguments', (done) => {
  expect.assertions(5)

  const app = boot()

  app.use(function (server, opts, next) {
    server.onClose((instance, done) => {
      expect('called').toBeTruthy()
      expect(server).toBe(instance)
      done()
    })
    next()
  })

  app.use(function (server, opts, next) {
    server.onClose((instance) => {
      expect('called').toBeTruthy()
      expect(server).toBe(instance)
    })
    next()
  })

  app.on('start', () => {
    app.close(() => {
      expect('Closed in the correct order').toBeTruthy()
      done()
    })
  })
})

test('onClose arguments - fastify encapsulation test case', (done) => {
  expect.assertions(5)

  const server = { my: 'server' }
  const app = boot(server)

  app.override = function (s, fn, opts) {
    s = Object.create(s)
    return s
  }

  app.use(function (instance, opts, next) {
    instance.test = true
    instance.onClose((i, done) => {
      expect(i.test).toBeTruthy()
      done()
    })
    next()
  })

  app.use(function (instance, opts, next) {
    expect(instance.test).toBeFalsy()
    instance.onClose((i, done) => {
      expect(i.test).toBeFalsy()
      done()
    })
    next()
  })

  app.on('start', () => {
    expect(app.test).toBeFalsy()
    app.close(() => {
      expect('Closed in the correct order').toBeTruthy()
      done()
    })
  })
})

test('onClose arguments - fastify encapsulation test case / 2', (testDone) => {
  expect.assertions(5)

  const server = { my: 'server' }
  const app = boot(server)

  app.override = function (s, fn, opts) {
    s = Object.create(s)
    return s
  }

  server.use(function (instance, opts, next) {
    instance.test = true
    instance.onClose((i, done) => {
      expect(i.test).toBeTruthy()
      done()
      testDone()
    })
    next()
  })

  server.use(function (instance, opts, next) {
    expect(instance.test).toBeFalsy()
    instance.onClose((i, done) => {
      expect(i.test).toBeFalsy()
      done()
    })
    next()
  })

  app.on('start', () => {
    expect(server.test).toBeFalsy()
    try {
      server.close()
      expect(true).toBeTruthy()
    } catch (err) {
      expect.fail(err)
    }
  })
})

test('onClose arguments - encapsulation test case no server', (done) => {
  expect.assertions(5)

  const app = boot()

  app.override = function (s, fn, opts) {
    s = Object.create(s)
    return s
  }

  app.use(function (instance, opts, next) {
    instance.test = true
    instance.onClose((i, done) => {
      expect(i.test).toBeFalsy()
      done()
    })
    next()
  })

  app.use(function (instance, opts, next) {
    expect(instance.test).toBeFalsy()
    instance.onClose((i) => {
      expect(i.test).toBeFalsy()
    })
    next()
  })

  app.on('start', () => {
    expect(app.test).toBeFalsy()
    app.close(() => {
      expect('Closed in the correct order').toBeTruthy()
      done()
    })
  })
})

test('onClose should handle errors', (done) => {
  expect.assertions(3)

  const app = boot()

  app.use(function (server, opts, done) {
    app.onClose((instance, done) => {
      expect('called').toBeTruthy()
      done(new Error('some error'))
    })
    done()
  })

  app.on('start', () => {
    app.close(err => {
      expect(err.message).toBe('some error')
      expect('Closed in the correct order').toBeTruthy()
      done()
    })
  })
})

test('#54 close handlers should receive same parameters when queue is not empty', (done) => {
  expect.assertions(6)

  const context = { test: true }
  const app = boot(context)

  app.use(function (server, opts, done) {
    done()
  })
  app.on('start', () => {
    app.close((err, done) => {
      expect(err).toBe(null)
      expect('Closed in the correct order').toBeTruthy()
      setImmediate(done)
    })
    app.close(err => {
      expect(err).toBe(null)
      expect('Closed in the correct order').toBeTruthy()
    })
    app.close(err => {
      expect(err).toBe(null)
      expect('Closed in the correct order').toBeTruthy()
      done()
    })
  })
})

test('onClose should handle errors / 2', (done) => {
  expect.assertions(4)

  const app = boot()

  app.onClose((instance, done) => {
    expect('called').toBeTruthy()
    done(new Error('some error'))
  })

  app.use(function (server, opts, done) {
    app.onClose((instance, done) => {
      expect('called').toBeTruthy()
      done()
    })
    done()
  })

  app.on('start', () => {
    app.close(err => {
      expect(err.message).toBe('some error')
      expect('Closed in the correct order').toBeTruthy()
      done()
    })
  })
})

test('close arguments', (testDone) => {
  expect.assertions(4)

  const app = boot()

  app.use(function (server, opts, done) {
    app.onClose((instance, done) => {
      expect('called').toBeTruthy()
      done()
    })
    done()
  })

  app.on('start', () => {
    app.close((err, instance, done) => {
      expect(err).toBeFalsy()
      expect(instance).toBe(app)
      done()
      expect('Closed in the correct order').toBeTruthy()
      testDone()
    })
  })
})

test('close event', (done) => {
  expect.assertions(3)

  const app = boot()
  let last = false

  app.on('start', () => {
    app.close(() => {
      expect(last).toBeFalsy()
      last = true
    })
  })

  app.on('close', () => {
    expect(last).toBeTruthy()
    expect('event fired').toBeTruthy()
    done()
  })
})

test('close order', (testDone) => {
  expect.assertions(5)

  const app = boot()
  const order = [1, 2, 3, 4]

  app.use(function (server, opts, done) {
    app.onClose(() => {
      expect(order.shift()).toBe(3)
    })

    app.use(function (server, opts, done) {
      app.onClose(() => {
        expect(order.shift()).toBe(2)
      })
      done()
    })
    done()
  })

  app.use(function (server, opts, done) {
    app.onClose(() => {
      expect(order.shift()).toBe(1)
    })
    done()
  })

  app.on('start', () => {
    app.close(() => {
      expect(order.shift()).toBe(4)
      expect('Closed in the correct order').toBeTruthy()
      testDone()
    })
  })
})

test('close without a cb', (testDone) => {
  expect.assertions(1)

  const app = boot()

  app.onClose((instance, done) => {
    expect('called').toBeTruthy()
    done()
    testDone()
  })

  app.close()
})

test('onClose with 0 parameters', (testDone) => {
  expect.assertions(4)

  const server = { my: 'server' }
  const app = boot(server)

  app.use(function (instance, opts, next) {
    instance.onClose(function () {
      expect('called').toBeTruthy()
      expect(arguments.length).toBe(0)
    })
    next()
  })

  app.close(err => {
    expect(err).toBeFalsy()
    expect('Closed').toBeTruthy()
    testDone()
  })
})

test('onClose with 1 parameter', (testDone) => {
  expect.assertions(3)

  const server = { my: 'server' }
  const app = boot(server)

  app.use(function (instance, opts, next) {
    instance.onClose(function (context) {
      expect(arguments.length).toBe(1)
    })
    next()
  })

  app.close(err => {
    expect(err).toBeFalsy()
    expect('Closed').toBeTruthy()
    testDone()
  })
})

test('close passing not a function', () => {
  expect.assertions(1)

  const app = boot()

  app.onClose((instance, done) => {
    expect('called').toBeTruthy()
    done()
  })

  return expect(() => app.close({})).toThrow(/not a function/)
})

test('close passing not a function', () => {
  expect.assertions(1)

  const app = boot()

  app.onClose((instance, done) => {
    expect('called').toBeTruthy()
    done()
  })

  return expect(() => app.close({})).toThrow(/not a function/)
})

test('close passing not a function when wrapping', () => {
  expect.assertions(1)

  const app = {}
  boot(app)

  app.onClose((instance, done) => {
    expect('called').toBeTruthy()
    done()
  })

  return expect(() => app.close({})).toThrow(/not a function/)
})

test('close should trigger ready()', (done) => {
  expect.assertions(2)

  const app = boot(null, {
    autostart: false
  })

  app.on('start', () => {
    // this will be emitted after the
    // callback in close() is fired
    expect('started').toBeTruthy()
  })

  app.close(() => {
    expect('closed').toBeTruthy()
    done()
  })
})

test('close without a cb returns a promise', () => {
  expect.assertions(1)

  const app = boot()
  return app.close().then(() => {
    expect('promise resolves').toBeTruthy()
  })
})

test('close without a cb returns a promise when attaching to a server', () => {
  expect.assertions(1)

  const server = {}
  boot(server)
  return server.close().then(() => {
    expect('promise resolves').toBeTruthy()
  })
})

test('close with async onClose handlers', (done) => {
  expect.assertions(7)

  const app = boot()
  const order = [1, 2, 3, 4, 5, 6]

  app.onClose(() => {
    return new Promise(resolve => setTimeout(resolve, 500)).then(() => {
      expect(order.shift()).toBe(5)
    })
  })

  app.onClose(() => {
    expect(order.shift()).toBe(4)
  })

  app.onClose(instance => {
    return new Promise(resolve => setTimeout(resolve, 500)).then(() => {
      expect(order.shift()).toBe(3)
    })
  })

  app.onClose(async instance => {
    return new Promise(resolve => setTimeout(resolve, 500)).then(() => {
      expect(order.shift()).toBe(2)
    })
  })

  app.onClose(async () => {
    return new Promise(resolve => setTimeout(resolve, 500)).then(() => {
      expect(order.shift()).toBe(1)
    })
  })

  app.on('start', () => {
    app.close(() => {
      expect(order.shift()).toBe(6)
      expect('Closed in the correct order').toBeTruthy()
      done()
    })
  })
})

test('onClose callback must be a function', (testDone) => {
  expect.assertions(1)

  const app = boot()

  app.use(async function (server, opts, done) {
    await expect(() => app.onClose({})).toThrow(new BOOT_ERR_CALLBACK_NOT_FN('onClose', 'object'))
    done()
    testDone()
  })
})

test('close custom server with async onClose handlers', (done) => {
  expect.assertions(7)

  const server = {}
  const app = boot(server)
  const order = [1, 2, 3, 4, 5, 6]

  server.onClose(() => {
    return new Promise(resolve => setTimeout(resolve, 500)).then(() => {
      expect(order.shift()).toBe(5)
    })
  })

  server.onClose(() => {
    expect(order.shift()).toBe(4)
  })

  server.onClose(instance => {
    return new Promise(resolve => setTimeout(resolve, 500)).then(() => {
      expect(order.shift()).toBe(3)
    })
  })

  server.onClose(async instance => {
    return new Promise(resolve => setTimeout(resolve, 500)).then(() => {
      expect(order.shift()).toBe(2)
    })
  })

  server.onClose(async () => {
    return new Promise(resolve => setTimeout(resolve, 500)).then(() => {
      expect(order.shift()).toBe(1)
    })
  })

  app.on('start', () => {
    app.close(() => {
      expect(order.shift()).toBe(6)
      expect('Closed in the correct order').toBeTruthy()
      done()
    })
  })
})
