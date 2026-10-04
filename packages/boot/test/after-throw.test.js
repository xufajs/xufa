'use strict'


const boot = require('..')

test('catched error by Promise.reject', async () => {
  const app = boot()
  expect.assertions(2)

  try {
    await app
      .use(function (f, opts) {
        return Promise.reject(new Error('kaboom'))
      })
      .after(async function (err) {
        expect(err.message).toBe('kaboom')
        throw new Error('kaboom2')
      })
  } catch (err) {
    expect(err.message).toBe('kaboom2')
  }

  // avvio's test also registered a ready() callback here: with no parameters, it is called (without the error),
  // as it is in avvio. node:test counted the assertion failing inside it after the test had ended.
})
