'use strict'


const boot = require('..')

test('after does not await itself', async () => {
  expect.assertions(3)

  const app = {}
  boot(app)

  app.use(async (app) => {
    expect('plugin init').toBeTruthy()
  })
  app.after(() => app)
  expect('reachable').toBeTruthy()

  await app.ready()
  expect('reachable').toBeTruthy()
})
