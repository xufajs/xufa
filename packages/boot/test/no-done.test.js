'use strict'


const boot = require('..')

test('not taking done does not throw error.', (testDone) => {
  expect.assertions(2)

  const app = boot()

  app.use(noDone).ready((err) => {
    expect(err).toBe(null)
    testDone()
  })

  function noDone (s, opts) {
    expect('did not throw').toBeTruthy()
  }
})
