/* eslint no-prototype-builtins: off */

import boot from '../index.js';

test('do not load', async () => {
  const app = boot({}, { timeout: 10 })

  app.use(first)

  async function first (s, opts) {
    await s.use(second)
  }

  async function second (s, opts) {
    await s.use(third)
  }

  function third (s, opts) {
    return new Promise((resolve, reject) => {
      // no resolve
    })
  }

  try {
    await app.start()
    expect.fail('should throw')
  } catch (err) {
    expect(err.message).toBe('Plugin did not start in time: \'third\'. You may have forgotten to call \'done\' function or to resolve a Promise')
  }
})
