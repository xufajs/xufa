'use strict'


const boot = require('..')

test('proper support for after with a passed async function in wrapped mode', (testCompleted) => {
  const app = {}
  boot(app)

  expect.assertions(5)

  const e = new Error('kaboom')

  app.use(function (f, opts) {
    return Promise.reject(e)
  }).after(function (err, cb) {
    expect(err).toEqual(e)
    cb(err)
  }).after(function () {
    expect('this is just called').toBeTruthy()
  }).after(function (err, cb) {
    expect(err).toEqual(e)
    cb(err)
  })

  app.ready().then(() => {
    expect.fail('this should not be called')
  }).catch(err => {
    expect(err).toBeTruthy()
    expect(err.message).toBe('kaboom')
    testCompleted()
  })
})
