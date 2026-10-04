'use strict'


const boot = require('..')

// asyncDispose doesn't exist in Node.js < 20
test.skipIf(!('asyncDispose' in Symbol))('Symbol.asyncDispose should close avvio', async () => {
  expect.assertions(2)

  const app = boot()
  let closeHandlerCalled = false

  app.use(function (server, opts, done) {
    app.onClose(() => {
      closeHandlerCalled = true
    })
    done()
  })

  await app.ready()

  expect(app.booted).toBe(true)

  // Simulates using keyword behavior: await using app = boot()
  await app[Symbol.asyncDispose]()

  expect(closeHandlerCalled).toBeTruthy()
})
