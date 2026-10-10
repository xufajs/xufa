
import Fastify from '../../index.js'

test('esm support', async () => {
  const fastify = Fastify()

  fastify.register(import('./plugin.mjs'), { foo: 'bar' })
  fastify.register(import('./other.mjs'))

  await fastify.ready()

  expect(fastify.foo).toBe('bar')
})
