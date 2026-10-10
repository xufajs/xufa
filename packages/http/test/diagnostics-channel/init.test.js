'use strict'

// The initialization channel, with the real node:diagnostics_channel (the library is an ES module: proxyquire, which
// replaced the channel module of CommonJS requires, cannot reach its imports).
const diagnostics = require('node:diagnostics_channel')
const Xufa = require('../..')

test('diagnostics_channel when present and subscribers', async () => {
  expect.assertions(2)

  let fastifyInHook
  const onInit = (event) => {
    expect(event.fastify).toBeTruthy()
    fastifyInHook = event.fastify
  }
  diagnostics.subscribe('xufa.initialization', onInit)
  try {
    const fastify = Xufa()
    expect(fastifyInHook).toBe(fastify)
  } finally {
    diagnostics.unsubscribe('xufa.initialization', onInit)
  }
})

test('diagnostics_channel when present and no subscribers', async () => {
  expect.assertions(2)

  expect(diagnostics.channel('xufa.initialization').hasSubscribers).toBe(false)
  const fastify = Xufa()
  expect(fastify).toBeTruthy()
})
