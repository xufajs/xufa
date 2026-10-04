'use strict'


const Fastify = require('..')

test('hasRequestDecorator returns true for built-in constructor-assigned request properties', async () => {
  expect.assertions(6)
  const fastify = Fastify()
  expect(fastify.hasRequestDecorator('id')).toBe(true)
  expect(fastify.hasRequestDecorator('params')).toBe(true)
  expect(fastify.hasRequestDecorator('raw')).toBe(true)
  expect(fastify.hasRequestDecorator('query')).toBe(true)
  expect(fastify.hasRequestDecorator('log')).toBe(true)
  expect(fastify.hasRequestDecorator('body')).toBe(true)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('hasReplyDecorator returns true for built-in constructor-assigned reply properties', async () => {
  expect.assertions(3)
  const fastify = Fastify()
  expect(fastify.hasReplyDecorator('raw')).toBe(true)
  expect(fastify.hasReplyDecorator('request')).toBe(true)
  expect(fastify.hasReplyDecorator('log')).toBe(true)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('decorateRequest throws XUFA_ERR_DEC_ALREADY_PRESENT for built-in request properties', async () => {
  expect.assertions(4)
  const fastify = Fastify()
  for (const name of ['id', 'params', 'raw', 'body']) {
    expect((() => { try { (() => fastify.decorateRequest(name, null))() } catch (error) { return ((err) => err.code === 'XUFA_ERR_DEC_ALREADY_PRESENT')(error) } return false })()).toBe(true)
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('decorateReply throws XUFA_ERR_DEC_ALREADY_PRESENT for built-in reply properties', async () => {
  expect.assertions(2)
  const fastify = Fastify()
  for (const name of ['raw', 'request']) {
    expect((() => { try { (() => fastify.decorateReply(name, null))() } catch (error) { return ((err) => err.code === 'XUFA_ERR_DEC_ALREADY_PRESENT')(error) } return false })()).toBe(true)
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('hasRequestDecorator returns false for unknown properties', async () => {
  expect.assertions(1)
  const fastify = Fastify()
  expect(fastify.hasRequestDecorator('nonExistent')).toBe(false)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('decorateRequest still works for non-built-in names', (done) => {
  expect.assertions(2)
  const fastify = Fastify()
  fastify.decorateRequest('myExtra', null)
  expect(fastify.hasRequestDecorator('myExtra')).toBe(true)
  fastify.get('/', async (req) => req.myExtra)
  fastify.ready((err) => {
    expect(err).toBeFalsy()
    done()
  })
})

test('decorateRequest accepts built-in request properties as dependencies', async () => {
  expect.assertions(6)
  const fastify = Fastify()
  for (const name of ['id', 'params', 'raw', 'query', 'log', 'body']) {
    expect(() => fastify.decorateRequest(`uses_${name}`, null, [name])).not.toThrow()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('decorateReply accepts built-in reply properties as dependencies', async () => {
  expect.assertions(3)
  const fastify = Fastify()
  for (const name of ['raw', 'request', 'log']) {
    expect(() => fastify.decorateReply(`uses_${name}`, null, [name])).not.toThrow()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('decorateRequest accepts built-in properties as dependencies inside a plugin', (done) => {
  expect.assertions(2)
  const fastify = Fastify()
  fastify.register(async (instance) => {
    instance.decorateRequest('scopedExtra', null, ['body'])
    expect(instance.hasRequestDecorator('scopedExtra')).toBe(true)
  })
  fastify.ready((err) => {
    expect(err).toBeFalsy()
    done()
  })
})

test('decorateRequest accepts built-in properties mixed with user decorators as dependencies', async () => {
  expect.assertions(1)
  const fastify = Fastify()
  fastify.decorateRequest('userProp', null)
  expect(() => fastify.decorateRequest('mixed', null, ['userProp', 'body'])).not.toThrow()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('decorateRequest still throws XUFA_ERR_DEC_MISSING_DEPENDENCY for unknown dependencies', async () => {
  expect.assertions(2)
  const fastify = Fastify()
  expect((() => { try { (() => fastify.decorateRequest('withUnknown', null, ['nonExistent']))() } catch (error) { return ((err) => err.code === 'XUFA_ERR_DEC_MISSING_DEPENDENCY')(error) } return false })()).toBe(true)
  expect((() => { try { (() => fastify.decorateReply('withUnknown', null, ['body']))() } catch (error) { return ((err) => err.code === 'XUFA_ERR_DEC_MISSING_DEPENDENCY')(error) } return false })()).toBe(true)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
