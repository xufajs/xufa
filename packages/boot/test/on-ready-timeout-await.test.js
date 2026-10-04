'use strict'

/* eslint no-prototype-builtins: off */


const boot = require('..')

test('onReadyTimeout', async () => {
  const app = boot({}, {
    timeout: 10, // 10 ms
    autostart: false
  })

  app.use(function one (innerApp, opts, next) {
    expect('loaded').toBeTruthy()
    innerApp.ready(function readyNoResolve (err, done) {
      expect(err).toBeFalsy()
      expect('first ready called').toBeTruthy()
      // Do not call done() to timeout
    })
    next()
  })

  await app.start()

  try {
    await app.ready()
    expect.fail('should throw')
  } catch (err) {
    expect(err.message).toBe('Plugin did not start in time: \'readyNoResolve\'. You may have forgotten to call \'done\' function or to resolve a Promise')
    // And not Plugin did not start in time: 'bound _encapsulateThreeParam'. You may have forgotten to call 'done' function or to resolve a Promise
  }
})
