const acceptHostStrategy = require('../lib/strategies').host



test('can get hosts by exact matches', async () => {
  const storage = acceptHostStrategy.storage()
  expect(storage.get('fastify.io')).toBe(undefined)
  storage.set('fastify.io', true)
  expect(storage.get('fastify.io')).toBe(true)
})

test('can get hosts by regexp matches', async () => {
  const storage = acceptHostStrategy.storage()
  expect(storage.get('fastify.io')).toBe(undefined)
  storage.set(/.+fastify\.io/, true)
  expect(storage.get('foo.fastify.io')).toBe(true)
  expect(storage.get('bar.fastify.io')).toBe(true)
})

test('exact host matches take precendence over regexp matches', async () => {
  const storage = acceptHostStrategy.storage()
  storage.set(/.+fastify\.io/, 'wildcard')
  storage.set('auth.fastify.io', 'exact')
  expect(storage.get('foo.fastify.io')).toBe('wildcard')
  expect(storage.get('bar.fastify.io')).toBe('wildcard')
  expect(storage.get('auth.fastify.io')).toBe('exact')
})

test('regex cache is invalidated when a new regexp is added', async () => {
  const storage = acceptHostStrategy.storage()
  storage.set(/.+fastify\.io/, 'first')
  expect(storage.get('foo.fastify.io')).toBe('first')
  expect(storage.get('bar.example.com')).toBe(undefined)
  storage.set(/.+example\.com/, 'second')
  expect(storage.get('bar.example.com')).toBe('second')
  expect(storage.get('foo.fastify.io')).toBe('first')
})

test('stateful regex flags (g, y) are stripped to ensure deterministic caching', async () => {
  const storage = acceptHostStrategy.storage()
  storage.set(/.+fastify\.io/g, 'wildcard')
  expect(storage.get('foo.fastify.io')).toBe('wildcard')
  expect(storage.get('bar.fastify.io')).toBe('wildcard')
  expect(storage.get('baz.fastify.io')).toBe('wildcard')
  const storage2 = acceptHostStrategy.storage()
  storage2.set(/.+fastify\.io/y, 'wildcard')
  expect(storage2.get('foo.fastify.io')).toBe('wildcard')
  expect(storage2.get('bar.fastify.io')).toBe('wildcard')
  expect(storage2.get('baz.fastify.io')).toBe('wildcard')
})
