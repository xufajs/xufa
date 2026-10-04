'use strict'


const fastify = require('..')()

const noop = () => {}
const opts = {
  schema: {
    response: {
      '2xx': {
        type: 'object',
        properties: {
          hello: {
            type: 'string'
          }
        }
      }
    }
  }
}

test('chainable - get', async () => {
  expect.assertions(1)
  expect(fastify.get('/', opts, noop)).toBe(fastify)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('chainable - post', async () => {
  expect.assertions(1)
  expect(fastify.post('/', opts, noop)).toBe(fastify)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('chainable - route', async () => {
  expect.assertions(1)
  expect(fastify.route({
    method: 'GET',
    url: '/other',
    schema: opts.schema,
    handler: noop
  })).toBe(fastify)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
