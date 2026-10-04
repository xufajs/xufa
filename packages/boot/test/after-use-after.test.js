'use strict'


const boot = require('..')
const app = {}

boot(app)

test('multi after', async () => {
  expect.assertions(6)
  const app = {}
  boot(app)

  app.use(function (f, opts, cb) {
    cb()
  }).after(() => {
    expect('this is just called').toBeTruthy()

    app.use(function (f, opts, cb) {
      expect('this is just called').toBeTruthy()
      cb()
    })
  }).after(function () {
    expect('this is just called').toBeTruthy()
    app.use(function (f, opts, cb) {
      expect('this is just called').toBeTruthy()
      cb()
    })
  }).after(function (err, cb) {
    expect('this is just called').toBeTruthy()
    cb(err)
  })

  await app.ready().then(() => {
    expect('ready').toBeTruthy()
  }).catch(() => {
    expect.fail('this should not be called')
  })
})

test('after grouping - use called after after called', async () => {
  expect.assertions(8)
  const app = {}
  boot(app)

  const TEST_VALUE = {}
  const OTHER_TEST_VALUE = {}
  const NEW_TEST_VALUE = {}

  const sO = (fn) => {
    fn[Symbol.for('skip-override')] = true
    return fn
  }

  app.use(sO(function (f, options, next) {
    f.test = TEST_VALUE

    next()
  }))

  app.after(function (err, f, done) {
    expect(err).toBeFalsy()
    expect(f.test).toBe(TEST_VALUE)

    f.test2 = OTHER_TEST_VALUE
    done()
  })

  app.use(sO(function (f, options, next) {
    expect(f.test).toBe(TEST_VALUE)
    expect(f.test2).toBe(OTHER_TEST_VALUE)

    f.test3 = NEW_TEST_VALUE

    next()
  }))

  app.after(function (err, f, done) {
    expect(err).toBeFalsy()
    expect(f.test).toBe(TEST_VALUE)
    expect(f.test2).toBe(OTHER_TEST_VALUE)
    expect(f.test3).toBe(NEW_TEST_VALUE)
    done()
  })

  await app.ready()
})
