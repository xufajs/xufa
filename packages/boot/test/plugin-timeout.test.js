import boot from '../index.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const message = (name) => `Plugin did not start in time: '${name}'. You may have forgotten to call 'done' function or to resolve a Promise`

test('timeout without calling next - callbacks', (done) => {
  expect.assertions(4)
  const app = boot({}, {
    timeout: 10 // 10 ms
  })
  app.use(one)
  function one (app, opts, next) {
    // do not call next on purpose
  }
  app.ready((err) => {
    expect(err).toBeTruthy()
    expect(err.fn).toBe(one)
    expect(err.message).toBe(message('one'))
    expect(err.code).toBe('BOOT_ERR_PLUGIN_EXEC_TIMEOUT')
    done()
  })
})

test('timeout without calling next - promises', (done) => {
  expect.assertions(4)
  const app = boot({}, {
    timeout: 10 // 10 ms
  })
  app.use(two)
  function two (app, opts) {
    return new Promise(function (resolve) {
      // do not call resolve on purpose
    })
  }
  app.ready((err) => {
    expect(err).toBeTruthy()
    expect(err.fn).toBe(two)
    expect(err.message).toBe(message('two'))
    expect(err.code).toBe('BOOT_ERR_PLUGIN_EXEC_TIMEOUT')
    done()
  })
})

test('timeout without calling next - use file as name', (done) => {
  expect.assertions(3)
  const app = boot({}, {
    timeout: 10 // 10 ms
  })
  app.use(require('./fixtures/plugin-no-next.js').default)
  app.ready((err) => {
    expect(err).toBeTruthy()
    expect(err.message).toBe(message('noNext'))
    expect(err.code).toBe('BOOT_ERR_PLUGIN_EXEC_TIMEOUT')
    done()
  })
})

test('timeout without calling next - use code as name', (done) => {
  expect.assertions(3)
  const app = boot({}, {
    timeout: 10 // 10 ms
  })
  app.use(function (app, opts, next) {
    // do not call next on purpose - code as name
  })

  app.ready((err) => {
    expect(err).toBeTruthy()
    expect(err.message).toBe(message('function (app, opts, next) { -- // do not call next on purpose - code as name'))
    expect(err.code).toBe('BOOT_ERR_PLUGIN_EXEC_TIMEOUT')
    done()
  })
})

test('does not keep going', (done) => {
  expect.assertions(2)
  const app = boot({}, {
    timeout: 10 // 10 ms
  })
  app.use(function three (app, opts, next) {
    next(new Error('kaboom'))
  })
  app.ready((err) => {
    expect(err).toBeTruthy()
    expect(err.message).toBe('kaboom')
    done()
  })
})

test('throw in override without autostart', (done) => {
  expect.assertions(2)

  const server = { my: 'server' }
  const app = boot(server, {
    timeout: 10,
    autostart: false
  })

  app.override = function (s) {
    throw new Error('kaboom')
  }

  app.use(function (s, opts, cb) {
    expect.fail('this is never reached')
  })

  setTimeout(function () {
    app.ready((err) => {
      expect(err).toBeTruthy()
      expect(err.message).toBe('kaboom')
      done()
    })
  }, 20)
})

test('timeout without calling next in ready and ignoring the error', (done) => {
  expect.assertions(11)
  const app = boot({}, {
    timeout: 10, // 10 ms
    autostart: false
  })

  let preReady = false

  app.use(function one (app, opts, next) {
    expect(true).toBeTruthy()
    app.ready(function readyOk (err, done) {
      expect(err).toBe(null)
      expect(true).toBeTruthy()
      done()
    })
    next()
  })

  app.on('preReady', () => {
    expect(true).toBeTruthy()
    preReady = true
  })

  app.on('start', () => {
    expect(true).toBeTruthy()
  })

  app.ready(function onReadyWithoutDone (err, done) {
    expect(true).toBeTruthy()
    expect(preReady).toBeTruthy()
    expect(err).toBe(null)
    // done() // Don't call done
  })

  app.ready(function onReadyTwo (err) {
    expect(err).toBeTruthy()
    expect(err.message).toBe(message('onReadyWithoutDone'))
    expect(err.code).toBe('BOOT_ERR_READY_TIMEOUT')
    done()
    // don't rethrow the error
  })

  app.start()
})

test('timeout without calling next in ready and rethrowing the error', (testDone) => {
  expect.assertions(11)
  const app = boot({}, {
    timeout: 10, // 10 ms
    autostart: true
  })

  app.use(function one (app, opts, next) {
    expect(true).toBeTruthy()
    app.ready(function readyOk (err, done) {
      expect(err).toBeTruthy()
      expect(err.message).toBe(message('onReadyWithoutDone'))
      expect(err.code).toBe('BOOT_ERR_READY_TIMEOUT')
      done(err)
    })
    next()
  })

  app.on('preReady', () => {
    expect(true).toBeTruthy()
  })

  app.on('start', () => {
    expect(true).toBeTruthy()
  })

  app.ready(function onReadyWithoutDone (err, done) {
    expect(true).toBeTruthy()
    expect(err).toBe(null)
    // done() // Don't call done
  })

  app.ready(function onReadyTwo (err, done) {
    expect(err).toBeTruthy()
    expect(err.message).toBe(message('onReadyWithoutDone'))
    expect(err.code).toBe('BOOT_ERR_READY_TIMEOUT')
    done(err)
    testDone()
  })

  app.start()
})

test('nested timeout do not crash - await', (done) => {
  expect.assertions(4)
  const app = boot({}, {
    timeout: 10 // 10 ms
  })
  app.use(one)
  async function one (app, opts) {
    await app.use(two)
  }

  function two (app, opts, next) {
    // do not call next on purpose
  }
  app.ready((err) => {
    expect(err).toBeTruthy()
    expect(err.fn).toBe(two)
    expect(err.message).toBe(message('two'))
    expect(err.code).toBe('BOOT_ERR_PLUGIN_EXEC_TIMEOUT')
    done()
  })
})
