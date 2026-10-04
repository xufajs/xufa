'use strict'


const boot = require('..')
const noop = () => {}

test('boot a plugin and then execute a call after that', (testDone) => {
  expect.assertions(1)

  process.on('warning', (warning) => {
    expect.fail('we should not get a warning')
  })

  const app = boot()
  for (let i = 0; i < 12; i++) {
    app.on('preReady', noop)
  }

  setTimeout(() => {
    expect('Everything ok').toBeTruthy()
    testDone()
  }, 500)
})
