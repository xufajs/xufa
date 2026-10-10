import boot from '../index.js';

test('boot an empty app', (testCompleted) => {
  expect.assertions(1)
  const app = boot()
  app.on('start', () => {
    expect(true).toBeTruthy()
    testCompleted()
  })
})

test('start returns app', (testCompleted) => {
  expect.assertions(1)
  const app = boot({}, { autostart: false })
  app
    .start()
    .ready((err) => {
      expect(err).toBeFalsy()
      testCompleted()
    })
})

test('boot an app with a plugin', (testCompleted) => {
  expect.assertions(4)

  const app = boot()
  let after = false

  app.use(function (server, opts, done) {
    expect(server).toEqual(app)
    expect(opts).toEqual({})
    expect(after).toBeTruthy()
    done()
  })

  after = true

  app.on('start', () => {
    expect(true).toBeTruthy()
    testCompleted()
  })
})

test('boot an app with a promisified plugin', (testCompleted) => {
  expect.assertions(4)

  const app = boot()
  let after = false

  app.use(function (server, opts) {
    expect(server).toEqual(app)
    expect(opts).toEqual({})
    expect(after).toBeTruthy()
    return Promise.resolve()
  })

  after = true

  app.on('start', () => {
    expect(true).toBeTruthy()
    testCompleted()
  })
})

test('boot an app with a plugin and a callback /1', (testCompleted) => {
  expect.assertions(2)

  const app = boot(() => {
    expect(true).toBeTruthy()
  })

  app.use(function (server, opts, done) {
    expect(true).toBeTruthy()
    done()
    testCompleted()
  })
})

test('boot an app with a plugin and a callback /2', (testCompleted) => {
  expect.assertions(2)

  const app = boot({}, () => {
    expect(true).toBeTruthy()
  })

  app.use(function (server, opts, done) {
    expect(true).toBeTruthy()
    done()
    testCompleted()
  })
})

test('boot a plugin with a custom server', (testCompleted) => {
  expect.assertions(4)

  const server = {}
  const app = boot(server)

  app.use(function (s, opts, done) {
    expect(s).toEqual(server)
    expect(opts).toEqual({})
    done()
  })

  app.onClose(() => {
    expect(true).toBeTruthy()
    testCompleted()
  })

  app.on('start', () => {
    app.close(() => {
      expect(true).toBeTruthy()
    })
  })
})

test('custom instance should inherits avvio methods /1', (testCompleted) => {
  expect.assertions(6)

  const server = {}
  const app = boot(server, {})

  server.use(function (s, opts, done) {
    expect(s).toEqual(server)
    expect(opts).toEqual({})
    done()
  }).after(() => {
    expect(true).toBeTruthy()
  })

  server.onClose(() => {
    expect(true).toBeTruthy()
    testCompleted()
  })

  server.ready(() => {
    expect(true).toBeTruthy()
  })

  app.on('start', () => {
    server.close(() => {
      expect(true).toBeTruthy()
    })
  })
})

test('custom instance should inherits avvio methods /2', (testCompleted) => {
  expect.assertions(6)

  const server = {}
  const app = new boot(server, {}) // eslint-disable-line new-cap

  server.use(function (s, opts, done) {
    expect(s).toEqual(server)
    expect(opts).toEqual({})
    done()
  }).after(() => {
    expect(true).toBeTruthy()
  })

  server.onClose(() => {
    expect(true).toBeTruthy()
    testCompleted()
  })

  server.ready(() => {
    expect(true).toBeTruthy()
  })

  app.on('start', () => {
    server.close(() => {
      expect(true).toBeTruthy()
    })
  })
})

test('boot a plugin with options', (testCompleted) => {
  expect.assertions(3)

  const server = {}
  const app = boot(server)
  const myOpts = {
    hello: 'world'
  }

  app.use(function (s, opts, done) {
    expect(s).toEqual(server)
    expect(opts).toEqual(myOpts)
    done()
  }, myOpts)

  app.on('start', () => {
    expect(true).toBeTruthy()
    testCompleted()
  })
})

test('boot a plugin with a function that returns the options', (testCompleted) => {
  expect.assertions(4)

  const server = {}
  const app = boot(server)
  const myOpts = {
    hello: 'world'
  }
  const myOptsAsFunc = parent => {
    expect(parent).toEqual(server)
    return parent.myOpts
  }

  app.use(function (s, opts, done) {
    s.myOpts = opts
    done()
  }, myOpts)

  app.use(function (s, opts, done) {
    expect(s).toEqual(server)
    expect(opts).toEqual(myOpts)
    done()
  }, myOptsAsFunc)

  app.on('start', () => {
    expect(true).toBeTruthy()
    testCompleted()
  })
})

test('throw on non-function use', () => {
  expect.assertions(1)
  const app = boot()
  expect(() => {
    app.use({})
  }).toThrow()
})

// https://github.com/mcollina/avvio/issues/20
test('ready and nextTick', (testCompleted) => {
  const app = boot()
  process.nextTick(() => {
    app.ready(() => {
      testCompleted()
    })
  })
})

// https://github.com/mcollina/avvio/issues/20
test('promises and microtask', (testCompleted) => {
  const app = boot()
  Promise.resolve()
    .then(() => {
      app.ready(function () {
        testCompleted()
      })
    })
})

test('always loads nested plugins after the current one', (testCompleted) => {
  expect.assertions(2)

  const server = {}
  const app = boot(server)

  let second = false

  app.use(function (s, opts, done) {
    app.use(function (s, opts, done) {
      second = true
      done()
    })
    expect(second).toBeFalsy()

    done()
  })

  app.on('start', () => {
    expect(true).toBeTruthy()
    testCompleted()
  })
})

test('promise long resolve', (testCompleted) => {
  expect.assertions(2)

  const app = boot()

  setTimeout(function () {
    expect(() => {
      app.use((s, opts, done) => {
        done()
      })
    }).toThrow()
    testCompleted()
  })

  app.ready(function (err) {
    expect(err).toBeFalsy()
  })
})

test('do not autostart', () => {
  const app = boot(null, {
    autostart: false
  })
  app.on('start', () => {
    expect.fail()
  })
})

test('start with ready', (testCompleted) => {
  expect.assertions(2)

  const app = boot(null, {
    autostart: false
  })

  app.on('start', () => {
    expect(true).toBeTruthy()
    testCompleted()
  })

  app.ready(function (err) {
    expect(err).toBeFalsy()
  })
})

test('load a plugin after start()', (testCompleted) => {
  expect.assertions(1)

  let startCalled = false
  const app = boot(null, {
    autostart: false
  })

  app.use((s, opts, done) => {
    expect(startCalled).toBeTruthy()
    done()
    testCompleted()
  })

  // we use a timer because
  // it is more reliable than
  // nextTick and setImmediate
  // this almost always will come
  // after those are completed
  setTimeout(() => {
    app.start()
    startCalled = true
  }, 2)
})

test('booted should be set before ready', (testCompleted) => {
  expect.assertions(2)

  const app = boot()

  app.ready(function (err) {
    expect(err).toBeFalsy()
    expect(app.booted).toBeTruthy()
    testCompleted()
  })
})

test('start should be emitted after ready resolves', (testCompleted) => {
  expect.assertions(1)

  const app = boot()
  let ready = false

  app.ready().then(function () {
    ready = true
  })

  app.on('start', function () {
    expect(ready).toBeTruthy()
    testCompleted()
  })
})

test('throws correctly if registering after ready', (testCompleted) => {
  expect.assertions(1)

  const app = boot()

  app.ready(function () {
    expect(() => {
      app.use((a, b, done) => done())
    }).toThrow()
    testCompleted()
  })
})

test('preReady errors must be managed', (testCompleted) => {
  expect.assertions(2)

  const app = boot()

  app.use((f, opts, cb) => {
    cb()
  })

  app.on('preReady', () => {
    throw new Error('boom')
  })

  app.ready(err => {
    expect(true).toBeTruthy()
    expect(err.message).toBe('boom')
    testCompleted()
  })
})

test('preReady errors do not override plugin\'s errors', (testCompleted) => {
  expect.assertions(3)

  const app = boot()

  app.use((f, opts, cb) => {
    cb(new Error('baam'))
  })

  app.on('preReady', () => {
    expect(true).toBeTruthy()
    throw new Error('boom')
  })

  app.ready(err => {
    expect(true).toBeTruthy()
    expect(err.message).toBe('baam')
    testCompleted()
  })
})

test('support faux modules', (testCompleted) => {
  expect.assertions(4)

  const app = boot()
  let after = false

  // Faux modules are modules built with TypeScript
  // or Babel that they export a .default property.
  app.use({
    default: function (server, opts, done) {
      expect(server).toEqual(app)
      expect(opts).toEqual({})
      expect(true).toBeTruthy()
      done()
    }
  })

  after = true

  app.on('start', () => {
    expect(true).toBeTruthy()
    testCompleted()
  })
})
