'use strict'


const { kReplyHijacked } = require('../lib/symbols')
const wrapThenable = require('../lib/wrap-thenable')
const Reply = require('../lib/reply')

test('should resolve immediately when reply[kReplyHijacked] is true', async () => {
  await new Promise(resolve => {
    const reply = {}
    reply[kReplyHijacked] = true
    const thenable = Promise.resolve()
    wrapThenable(thenable, reply)
    resolve()
  })
})

test('should reject immediately when reply[kReplyHijacked] is true', async () => {
  expect.assertions(1)
  const reply = new Reply({}, {}, {})
  reply[kReplyHijacked] = true
  reply.log = {
    error: ({ err }) => {
      expect(err.message).toBe('Reply sent already')
    }
  }

  const thenable = Promise.reject(new Error('Reply sent already'))
  wrapThenable(thenable, reply)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
