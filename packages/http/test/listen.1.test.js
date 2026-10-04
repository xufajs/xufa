'use strict'

const { networkInterfaces } = require('node:os')

const Fastify = require('..')
const helper = require('./helper')
const { assertNoWarning } = require('./helper')

let localhost
let localhostForURL

beforeAll(async function () {
  [localhost, localhostForURL] = await helper.getLoopbackHost()
})

test('listen works without arguments', async (ctx) => {
  assertNoWarning(ctx)

  const fastify = Fastify()

  await fastify.listen()
  const address = fastify.server.address()
  expect(address.address).toBe(localhost)
  expect(address.port > 0).toBeTruthy()
  await fastify.close()
})

test('Async/await listen with arguments', async (ctx) => {
  assertNoWarning(ctx)

  const fastify = Fastify()

  const addr = await fastify.listen({ port: 0, host: '0.0.0.0' })
  const address = fastify.server.address()
  const { protocol, hostname, port, pathname } = new URL(addr)
  expect(protocol).toBe('http:')
  expect(Object.values(networkInterfaces())
    .flat()
    .filter(({ internal }) => internal)
    .some(({ address }) => address === hostname)).toBeTruthy()
  expect(pathname).toBe('/')
  expect(Number(port)).toBe(address.port)
  expect(address).toEqual({
    address: '0.0.0.0',
    family: 'IPv4',
    port: address.port
  })
  await fastify.close()
})

test('listen accepts a callback', (done) => {
  expect.assertions(2)
  assertNoWarning(null)

  const fastify = Fastify()

  fastify.listen({ port: 0 }, (err) => {
    expect(err).toBeFalsy()
    expect(fastify.server.address().address).toBe(localhost)
    fastify.close(done)
  })
})

test('listen accepts options and a callback', (done) => {
  expect.assertions(1)
  assertNoWarning(null)

  const fastify = Fastify()
  fastify.listen({
    port: 0,
    host: 'localhost',
    backlog: 511,
    exclusive: false,
    readableAll: false,
    writableAll: false,
    ipv6Only: false
  }, (err) => {
    expect(err).toBeFalsy()
    fastify.close(done)
  })
})

test('listen after Promise.resolve()', (done) => {
  expect.assertions(2)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  Promise.resolve()
    .then(() => {
      fastify.listen({ port: 0 }, (err, address) => {
        fastify.server.unref()
        expect(address).toBe(`http://${localhostForURL}:${fastify.server.address().port}`)
        expect(err).toBeFalsy()
        done()
      })
    })
})

test('listen works with undefined host', async (ctx) => {
  assertNoWarning(ctx)

  const fastify = Fastify()
  await fastify.listen({ host: undefined, port: 0 })
  const address = fastify.server.address()
  expect(address.address).toBe(localhost)
  expect(address.port > 0).toBeTruthy()
  await fastify.close()
})

test('listen works with null host', async (ctx) => {
  assertNoWarning(ctx)

  const fastify = Fastify()

  await fastify.listen({ host: null, port: 0 })
  const address = fastify.server.address()
  expect(address.address).toBe(localhost)
  expect(address.port > 0).toBeTruthy()
  await fastify.close()
})
