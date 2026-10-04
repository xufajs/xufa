'use strict'


const boot = require('../..')

test('should print the time tree', (done) => {
  expect.assertions(2)
  const app = boot()

  app.use(function first (instance, opts, cb) {
    const out = instance.prettyPrint().split('\n')
    expect(out[0]).toBe('root -1 ms')
    expect(out[1]).toBe('└── first -1 ms')
    cb()
    done()
  })
})
