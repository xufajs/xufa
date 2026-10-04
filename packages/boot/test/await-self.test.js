'use strict'


const boot = require('..')

test('await self', async () => {
  const app = {}
  boot(app)

  expect(await app).toEqual(app)
})

test('await self three times', async () => {
  const app = {}
  boot(app)

  expect(await app).toEqual(app)
  expect(await app).toEqual(app)
  expect(await app).toEqual(app)
})

test('await self within plugin', async () => {
  const app = {}
  boot(app)

  app.use(async (f) => {
    expect(await f).toEqual(f)
  })

  expect(await app).toEqual(app)
})
