import boot from '../index.js';

test('boot a plugin and then execute a call after that', (testDone) => {
  expect.assertions(5)

  const app = boot()
  let pluginLoaded = false
  let afterCalled = false

  app.use(function (s, opts, done) {
    expect(afterCalled).toBe(false)
    pluginLoaded = true
    done()
  })

  app.after(function (err, cb) {
    expect(err).toBeFalsy()
    expect(pluginLoaded).toBeTruthy()
    afterCalled = true
    cb()
  })

  app.on('start', () => {
    expect(afterCalled).toBeTruthy()
    expect(pluginLoaded).toBeTruthy()
    testDone()
  })
})

test('after without a done callback', (testDone) => {
  expect.assertions(5)

  const app = boot()
  let pluginLoaded = false
  let afterCalled = false

  app.use(function (s, opts, done) {
    expect(afterCalled).toBe(false)
    pluginLoaded = true
    done()
  })

  app.after(function (err) {
    expect(err).toBeFalsy()
    expect(pluginLoaded).toBeTruthy()
    afterCalled = true
  })

  app.on('start', () => {
    expect(afterCalled).toBeTruthy()
    expect(pluginLoaded).toBeTruthy()
    testDone()
  })
})

test('verify when a afterred call happens', (testDone) => {
  expect.assertions(3)

  const app = boot()

  app.use(function (s, opts, done) {
    done()
  })

  app.after(function (err, cb) {
    expect(err).toBeFalsy()
    expect(true).toBeTruthy()
    cb()
  })

  app.on('start', () => {
    expect(true).toBeTruthy()
    testDone()
  })
})

test('internal after', (testDone) => {
  expect.assertions(18)

  const app = boot()
  let firstLoaded = false
  let secondLoaded = false
  let thirdLoaded = false
  let afterCalled = false

  app.use(first)
  app.use(third)

  function first (s, opts, done) {
    expect(firstLoaded).toBe(false)
    expect(secondLoaded).toBe(false)
    expect(thirdLoaded).toBe(false)
    firstLoaded = true
    s.use(second)
    s.after(function (err, cb) {
      expect(err).toBeFalsy()
      expect(afterCalled).toBe(false)
      afterCalled = true
      cb()
    })
    done()
  }

  function second (s, opts, done) {
    expect(firstLoaded).toBeTruthy()
    expect(secondLoaded).toBe(false)
    expect(thirdLoaded).toBe(false)
    expect(afterCalled).toBe(false)
    secondLoaded = true
    done()
  }

  function third (s, opts, done) {
    expect(firstLoaded).toBeTruthy()
    expect(secondLoaded).toBeTruthy()
    expect(afterCalled).toBeTruthy()
    expect(thirdLoaded).toBe(false)
    thirdLoaded = true
    done()
  }

  app.on('start', () => {
    expect(firstLoaded).toBeTruthy()
    expect(secondLoaded).toBeTruthy()
    expect(thirdLoaded).toBeTruthy()
    expect(afterCalled).toBeTruthy()
    expect(true).toBeTruthy()
    testDone()
  })
})

test('ready adds at the end of the queue', (testDone) => {
  expect.assertions(14)

  const app = boot()
  let pluginLoaded = false
  let afterCalled = false
  let readyCalled = false

  app.ready(function (err, cb) {
    expect(err).toBeFalsy()
    expect(pluginLoaded).toBeTruthy()
    expect(afterCalled).toBeTruthy()
    readyCalled = true
    process.nextTick(cb)
  })

  app.use(function (s, opts, done) {
    expect(afterCalled).toBe(false)
    expect(readyCalled).toBe(false)
    pluginLoaded = true

    app.ready(function (err) {
      expect(err).toBeFalsy()
      expect(readyCalled).toBeTruthy()
      expect(afterCalled).toBeTruthy()
    })

    done()
  })

  app.after(function (err, cb) {
    expect(err).toBeFalsy()
    expect(pluginLoaded).toBeTruthy()
    expect(readyCalled).toBe(false)
    afterCalled = true
    cb()
  })

  app.on('start', () => {
    expect(afterCalled).toBeTruthy()
    expect(pluginLoaded).toBeTruthy()
    expect(readyCalled).toBeTruthy()
    testDone()
  })
})

test('if the after/ready callback has three parameters, the second one must be the context', (testDone) => {
  expect.assertions(4)

  const server = { my: 'server' }
  const app = boot(server)

  app.use(function (s, opts, done) {
    done()
  })

  app.after(function (err, context, cb) {
    expect(err).toBeFalsy()
    expect(server).toEqual(context)
    cb()
  })

  app.ready(function (err, context, cb) {
    expect(err).toBeFalsy()
    expect(server).toEqual(context)
    cb()
    testDone()
  })
})

test('if the after/ready async, the returns must be the context generated', (testDone) => {
  expect.assertions(3)

  const server = { my: 'server', index: 0 }
  const app = boot(server)
  app.override = function (old) {
    return { ...old, index: old.index + 1 }
  }

  app.use(function (s, opts, done) {
    s.use(function (s, opts, done) {
      s.ready().then(itself => {
        expect(itself).toEqual(s)
        testDone()
      })
      done()
    })
    s.ready().then(itself => {
      expect(itself).toEqual(s)
    })
    done()
  })

  app.ready().then(itself => {
    expect(itself).toEqual(server)
  })
})

test('if the after/ready callback, the returns must be the context generated', (testDone) => {
  expect.assertions(3)

  const server = { my: 'server', index: 0 }
  const app = boot(server)
  app.override = function (old) {
    return { ...old, index: old.index + 1 }
  }

  app.use(function (s, opts, done) {
    s.use(function (s, opts, done) {
      s.ready((_, itself, done) => {
        expect(itself).toEqual(s)
        done()
        testDone()
      })
      done()
    })
    s.ready((_, itself, done) => {
      expect(itself).toEqual(s)
      done()
    })
    done()
  })

  app.ready((_, itself, done) => {
    expect(itself).toEqual(server)
    done()
  })
})

test('error should come in the first after - one parameter', (testDone) => {
  expect.assertions(3)

  const server = { my: 'server' }
  const app = boot(server)

  app.use(function (s, opts, done) {
    done(new Error('err'))
  })

  app.after(function (err) {
    expect(err instanceof Error).toBeTruthy()
    expect(err.message).toEqual('err')
  })

  app.ready(function (err) {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('error should come in the first after - two parameters', (testDone) => {
  expect.assertions(3)

  const server = { my: 'server' }
  const app = boot(server)

  app.use(function (s, opts, done) {
    done(new Error('err'))
  })

  app.after(function (err, cb) {
    expect(err instanceof Error).toBeTruthy()
    expect(err.message).toBe('err')
    cb()
  })

  app.ready(function (err) {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('error should come in the first after - three parameter', (testDone) => {
  expect.assertions(4)

  const server = { my: 'server' }
  const app = boot(server)

  app.use(function (s, opts, done) {
    done(new Error('err'))
  })

  app.after(function (err, context, cb) {
    expect(err instanceof Error).toBeTruthy()
    expect(err.message).toBe('err')
    expect(context).toEqual(server)
    cb()
  })

  app.ready(function (err) {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('error should come in the first ready - one parameter', (testDone) => {
  expect.assertions(2)

  const server = { my: 'server' }
  const app = boot(server)

  app.use(function (s, opts, done) {
    done(new Error('err'))
  })

  app.ready(function (err) {
    expect(err instanceof Error).toBeTruthy()
    expect(err.message).toBe('err')
    testDone()
  })
})

test('error should come in the first ready - two parameters', (testDone) => {
  expect.assertions(2)

  const server = { my: 'server' }
  const app = boot(server)

  app.use(function (s, opts, done) {
    done(new Error('err'))
  })

  app.ready(function (err, cb) {
    expect(err instanceof Error).toBeTruthy()
    expect(err.message).toBe('err')
    cb()
    testDone()
  })
})

test('error should come in the first ready - three parameters', (testDone) => {
  expect.assertions(3)

  const server = { my: 'server' }
  const app = boot(server)

  app.use(function (s, opts, done) {
    done(new Error('err'))
  })

  app.ready(function (err, context, cb) {
    expect(err instanceof Error).toBeTruthy()
    expect(err.message).toBe('err')
    expect(context).toEqual(server)
    cb()
    testDone()
  })
})

test('if `use` has a callback with more then one parameter, the error must not reach ready', (testDone) => {
  expect.assertions(1)

  const server = { my: 'server' }
  const app = boot(server)

  app.use(function (s, opts, done) {
    done(new Error('err'))
  })

  app.ready(function (err) {
    expect(err).toBeTruthy()
    testDone()
  })
})

test('if `use` has a callback without parameters, the error must reach ready', (testDone) => {
  expect.assertions(1)

  const server = { my: 'server' }
  const app = boot(server)

  app.use(function (s, opts, done) {
    done(new Error('err'))
  }, () => {})

  app.ready(function (err) {
    expect(err).toBeTruthy()
    testDone()
  })
})

test('should pass the errors from after to ready', (testDone) => {
  expect.assertions(6)

  const server = {}
  const app = boot(server, {})

  server.use(function (s, opts, done) {
    expect(s).toEqual(server)
    expect(opts).toEqual({})
    done()
  }).after((err, done) => {
    expect(err).toBeFalsy()
    done(new Error('some error'))
  })

  server.onClose(() => {
    expect(true).toBeTruthy()
    testDone()
  })

  server.ready(err => {
    expect(err.message).toBe('some error')
  })

  app.on('start', () => {
    server.close(() => {
      expect(true).toBeTruthy()
    })
  })
})

test('after no encapsulation', (testDone) => {
  expect.assertions(4)

  const app = boot()
  app.override = function (s, fn, opts) {
    s = Object.create(s)
    return s
  }

  app.use(function (instance, opts, next) {
    instance.test = true
    instance.after(function (err, i, done) {
      expect(err).toBeFalsy()
      expect(i.test).toBe(undefined)
      done()
    })
    next()
  })

  app.after(function (err, i, done) {
    expect(err).toBeFalsy()
    expect(i.test).toBe(undefined)
    done()
    testDone()
  })
})

test('ready no encapsulation', (testDone) => {
  expect.assertions(4)

  const app = boot()
  app.override = function (s, fn, opts) {
    s = Object.create(s)
    return s
  }

  app.use(function (instance, opts, next) {
    instance.test = true
    instance.ready(function (err, i, done) {
      expect(err).toBeFalsy()
      expect(i.test).toBe(undefined)
      done()
      testDone()
    })
    next()
  })

  app.ready(function (err, i, done) {
    expect(err).toBeFalsy()
    expect(i.test).toBe(undefined)
    done()
  })
})

test('after encapsulation with a server', (testDone) => {
  expect.assertions(4)

  const server = { my: 'server' }
  const app = boot(server)
  app.override = function (s, fn, opts) {
    s = Object.create(s)
    return s
  }

  app.use(function (instance, opts, next) {
    instance.test = true
    instance.after(function (err, i, done) {
      expect(err).toBeFalsy()
      expect(i.test).toBeTruthy()
      done()
    })
    next()
  })

  app.after(function (err, i, done) {
    expect(err).toBeFalsy()
    expect(i.test).toBe(undefined)
    done()
    testDone()
  })
})

test('ready encapsulation with a server', (testDone) => {
  expect.assertions(4)

  const server = { my: 'server' }
  const app = boot(server)
  app.override = function (s, fn, opts) {
    s = Object.create(s)
    return s
  }

  app.use(function (instance, opts, next) {
    instance.test = true
    instance.ready(function (err, i, done) {
      expect(err).toBeFalsy()
      expect(i.test).toBeTruthy()
      done()
      testDone()
    })
    next()
  })

  app.ready(function (err, i, done) {
    expect(err).toBeFalsy()
    expect(i.test).toBe(undefined)
    done()
  })
})

test('after should passthrough the errors', (testDone) => {
  expect.assertions(5)

  const app = boot()
  let pluginLoaded = false
  let afterCalled = false

  app.use(function (s, opts, done) {
    expect(afterCalled).toBe(false)
    pluginLoaded = true
    done(new Error('kaboom'))
  })

  app.after(function () {
    expect(pluginLoaded).toBeTruthy()
    afterCalled = true
  })

  app.ready(function (err) {
    expect(err).toBeTruthy()
    expect(afterCalled).toBeTruthy()
    expect(pluginLoaded).toBeTruthy()
    testDone()
  })
})

test('stop loading plugins if it errors', (testDone) => {
  expect.assertions(2)

  const app = boot()

  app.use(function first (server, opts, done) {
    expect(true).toBeTruthy()
    done(new Error('kaboom'))
  })

  app.use(function second (server, opts, done) {
    expect.fail('this should never be called')
  })

  app.ready((err) => {
    expect(err.message).toBe('kaboom')
    testDone()
  })
})

test('keep loading if there is an .after', (testDone) => {
  expect.assertions(4)

  const app = boot()

  app.use(function first (server, opts, done) {
    expect(true).toBeTruthy()
    done(new Error('kaboom'))
  })

  app.after(function (err) {
    expect(err.message).toBe('kaboom')
  })

  app.use(function second (server, opts, done) {
    expect(true).toBeTruthy()
    done()
  })

  app.ready((err) => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('do not load nested plugin if parent errors', (testDone) => {
  expect.assertions(4)

  const app = boot()

  app.use(function first (server, opts, done) {
    expect(true).toBeTruthy()

    server.use(function second (_, opts, done) {
      expect.fail('this should never be called')
    })

    done(new Error('kaboom'))
  })

  app.after(function (err) {
    expect(err.message).toBe('kaboom')
  })

  app.use(function third (server, opts, done) {
    expect(true).toBeTruthy()
    done()
  })

  app.ready((err) => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('.after nested', (testDone) => {
  expect.assertions(4)

  const app = boot()

  app.use(function outer (app, opts, done) {
    app.use(function first (app, opts, done) {
      expect(true).toBeTruthy()
      done(new Error('kaboom'))
    })

    app.after(function (err) {
      expect(err.message).toBe('kaboom')
    })

    app.use(function second (app, opts, done) {
      expect(true).toBeTruthy()
      done()
    })

    done()
  })

  app.ready((err) => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('nested error', (testDone) => {
  expect.assertions(4)

  const app = boot()

  app.use(function outer (app, opts, done) {
    app.use(function first (app, opts, done) {
      expect(true).toBeTruthy()
      done(new Error('kaboom'))
    })

    app.use(function second (app, opts, done) {
      expect.fail('this should never be called')
    })

    done()
  })

  app.after(function (err) {
    expect(err.message).toBe('kaboom')
  })

  app.use(function third (server, opts, done) {
    expect(true).toBeTruthy()
    done()
  })

  app.ready((err) => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('preReady event', (testDone) => {
  expect.assertions(4)

  const app = boot()
  const order = [1, 2]

  app.use(function first (server, opts, done) {
    expect(true).toBeTruthy()
    done()
  })

  app.use(function second (server, opts, done) {
    expect(true).toBeTruthy()
    done()
  })

  app.on('preReady', () => {
    expect(order.shift()).toBe(1)
  })

  app.ready(() => {
    expect(order.shift()).toBe(2)
    testDone()
  })
})

test('preReady event (multiple)', (testDone) => {
  expect.assertions(6)

  const app = boot()
  const order = [1, 2, 3, 4]

  app.use(function first (server, opts, done) {
    expect(true).toBeTruthy()
    done()
  })

  app.use(function second (server, opts, done) {
    expect(true).toBeTruthy()
    done()
  })

  app.on('preReady', () => {
    expect(order.shift()).toBe(1)
  })

  app.on('preReady', () => {
    expect(order.shift()).toBe(2)
  })

  app.on('preReady', () => {
    expect(order.shift()).toBe(3)
  })

  app.ready(() => {
    expect(order.shift()).toBe(4)
    testDone()
  })
})

test('preReady event (nested)', (testDone) => {
  expect.assertions(6)

  const app = boot()
  const order = [1, 2, 3, 4]

  app.use(function first (server, opts, done) {
    expect(true).toBeTruthy()
    done()
  })

  app.use(function second (server, opts, done) {
    expect(true).toBeTruthy()

    server.on('preReady', () => {
      expect(order.shift()).toBe(3)
    })

    done()
  })

  app.on('preReady', () => {
    expect(order.shift()).toBe(1)
  })

  app.on('preReady', () => {
    expect(order.shift()).toBe(2)
  })

  app.ready(() => {
    expect(order.shift()).toBe(4)
    testDone()
  })
})

test('preReady event (errored)', (testDone) => {
  expect.assertions(5)

  const app = boot()
  const order = [1, 2, 3]

  app.use(function first (server, opts, done) {
    expect(true).toBeTruthy()
    done(new Error('kaboom'))
  })

  app.use(function second (server, opts, done) {
    expect.fail('We should not be here')
  })

  app.on('preReady', () => {
    expect(order.shift()).toBe(1)
  })

  app.on('preReady', () => {
    expect(order.shift()).toBe(2)
  })

  app.ready((err) => {
    expect(err).toBeTruthy()
    expect(order.shift()).toBe(3)
    testDone()
  })
})

test('after return self', (testDone) => {
  expect.assertions(6)

  const app = boot()
  let pluginLoaded = false
  let afterCalled = false
  let second = false

  app.use(function (s, opts, done) {
    expect(afterCalled).toBe(false)
    pluginLoaded = true
    done()
  })

  app.after(function () {
    expect(pluginLoaded).toBeTruthy()
    afterCalled = true
    // happens with after(() => app.use(..))
    return app
  })

  app.use(function (s, opts, done) {
    expect(afterCalled).toBeTruthy()
    second = true
    done()
  })

  app.on('start', () => {
    expect(afterCalled).toBeTruthy()
    expect(pluginLoaded).toBeTruthy()
    expect(second).toBeTruthy()
    testDone()
  })
})

test('after 1 param swallows errors with server and timeout', (testDone) => {
  expect.assertions(3)

  const server = {}
  boot(server, { autostart: false, timeout: 1000 })

  server.use(function first (server, opts, done) {
    expect(true).toBeTruthy()
    done(new Error('kaboom'))
  })

  server.use(function second (server, opts, done) {
    expect.fail('We should not be here')
  })

  server.after(function (err) {
    expect(err).toBeTruthy()
  })

  server.ready(function (err) {
    expect(err).toBeFalsy()
    testDone()
  })
})
