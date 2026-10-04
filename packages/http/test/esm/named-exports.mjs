
import { xufa as fastify } from '@xufa/http'

// This test is executed in index.test.js
test('named exports support', async () => {
  const app = fastify()

  app.register(import('./plugin.mjs'), { foo: 'bar' })
  app.register(import('./other.mjs'))

  await app.ready()

  expect(app.foo).toBe('bar')
})
