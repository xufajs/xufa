'use strict'


const boot = require('..')

test('chainable standalone', (testDone) => {
  expect.assertions(5)

  const readyResult = boot()
    .use(function (ctx, opts, done) {
      expect('1st plugin').toBeTruthy()
      done()
    }).after(function (err, done) {
      expect(err).toBeFalsy()
      expect('2nd after').toBeTruthy()
      done()
    }).ready(function () {
      expect('we are ready').toBeTruthy()
      testDone()
    })
  expect(readyResult).toBe(undefined)
})

test('chainable automatically binded', (testDone) => {
  expect.assertions(5)

  const app = {}
  boot(app)

  const readyResult = app
    .use(function (ctx, opts, done) {
      expect('1st plugin').toBeTruthy()
      done()
    }).after(function (err, done) {
      expect(err).toBeFalsy()
      expect('2nd after').toBeTruthy()
      done()
    }).ready(function () {
      expect('we are ready').toBeTruthy()
      testDone()
    })
  expect(readyResult).toBe(undefined)
})

test('chainable standalone with server', (testDone) => {
  expect.assertions(6)

  const server = {}
  boot(server, {
    expose: {
      use: 'register'
    }
  })

  const readyResult = server.register(function (ctx, opts, done) {
    expect('1st plugin').toBeTruthy()
    done()
  }).after(function (err, done) {
    expect(err).toBeFalsy()
    expect('2nd after').toBeTruthy()
    done()
  }).register(function (ctx, opts, done) {
    expect('3rd plugin').toBeTruthy()
    done()
  }).ready(function () {
    expect('we are ready').toBeTruthy()
    testDone()
  })
  expect(readyResult).toBe(undefined)
})
