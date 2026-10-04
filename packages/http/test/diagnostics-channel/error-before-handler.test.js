'use strict'

const diagnostics = require('node:diagnostics_channel')

const subscriptions = []
function subscribeForTest (name, fn) {
  subscriptions.push([name, fn])
  diagnostics.subscribe(name, fn)
}
afterEach(() => {
  for (const [name, fn] of subscriptions.splice(0)) diagnostics.unsubscribe(name, fn)
})

require('../../lib/hooks').onSendHookRunner = function Stub () {}
const Request = require('../../lib/request')
const Reply = require('../../lib/reply')
const symbols = require('../../lib/symbols')
const { preHandlerCallback } = require('../../lib/handle-request')[Symbol.for('internals')]

test('diagnostics channel handles an error before calling context handler', async () => {
  expect.assertions(3)
  let callOrder = 0

  subscribeForTest('tracing:xufa.request.handler:start', (msg) => {
    expect(callOrder++).toBe(0)
  })

  subscribeForTest('tracing:xufa.request.handler:error', (msg) => {
    expect(callOrder++).toBe(1)
    expect(msg.error.message).toBe('oh no')
  })

  const error = new Error('oh no')
  const request = new Request()
  const reply = new Reply({}, request)
  request[symbols.kRouteContext] = {
    config: {
      url: '/foo',
      method: 'GET'
    }
  }

  preHandlerCallback(error, request, reply)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
