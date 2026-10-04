'use strict'


const boot = require('..')

test('catch exceptions in parent.override', (testDone) => {
  expect.assertions(2)

  const server = {}

  const app = boot(server, {
    autostart: false
  })
  app.override = function () {
    throw Error('catch it')
  }

  app
    .use(function () {})
    .start()

  app.ready(function (err) {
    expect(err instanceof Error).toBeTruthy()
    expect(err.message).toBe('catch it')
    testDone()
  })
})
