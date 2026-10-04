'use strict'


const proxyquire = require('proxyquire')

test('diagnostics_channel when present and subscribers', async () => {
  expect.assertions(3)

  let fastifyInHook

  const diagnostics = {
    channel (name) {
      expect(name).toBe('xufa.initialization')
      return {
        hasSubscribers: true,
        publish (event) {
          expect(event.fastify).toBeTruthy()
          fastifyInHook = event.fastify
        }
      }
    },
    '@noCallThru': true
  }

  const fastify = proxyquire('../../lib/xufa', {
    'node:diagnostics_channel': diagnostics
  })()
  expect(fastifyInHook).toBe(fastify)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('diagnostics_channel when present and no subscribers', async () => {
  expect.assertions(1)

  const diagnostics = {
    channel (name) {
      expect(name).toBe('xufa.initialization')
      return {
        hasSubscribers: false,
        publish () {
          expect.fail('publish should not be called')
        }
      }
    },
    '@noCallThru': true
  }

  proxyquire('../../lib/xufa', {
    'node:diagnostics_channel': diagnostics
  })()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
