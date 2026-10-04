'use strict'


const Fastify = require('..')
const helper = require('./helper')
const { networkInterfaces } = require('node:os')

const isIPv6Missing = !Object.values(networkInterfaces()).flat().some(({ family }) => family === 'IPv6')

let localhostForURL

beforeAll(async function () {
  [, localhostForURL] = await helper.getLoopbackHost()
})

test('register after listen using Promise.resolve()', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  const handler = (req, res) => res.send({})
  await Promise.resolve()
    .then(() => {
      fastify.get('/', handler)
      fastify.register((f2, options, done) => {
        f2.get('/plugin', handler)
        done()
      })
      return fastify.ready()
    })
    .catch((err) => {
      expect.fail(err.message)
    })
    .then(() => expect('resolved').toBeTruthy())
})

test('double listen errors', (done) => {
  expect.assertions(3)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  fastify.listen({ port: 0 }, (err) => {
    expect(err).toBeFalsy()
    fastify.listen({ port: fastify.server.address().port }, (err, address) => {
      expect(address).toBe(null)
      expect(err).toBeTruthy()
      done()
    })
  })
})

test('double listen errors callback with (err, address)', (done) => {
  expect.assertions(4)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  fastify.listen({ port: 0 }, (err1, address1) => {
    expect(address1).toBe(`http://${localhostForURL}:${fastify.server.address().port}`)
    expect(err1).toBeFalsy()
    fastify.listen({ port: fastify.server.address().port }, (err2, address2) => {
      expect(address2).toBe(null)
      expect(err2).toBeTruthy()
      done()
    })
  })
})

test.skipIf(isIPv6Missing)('nonlocalhost double listen errors callback with (err, address)', (done) => {
  expect.assertions(4)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  fastify.listen({ host: '::1', port: 0 }, (err, address) => {
    expect(address).toBe(`http://${'[::1]'}:${fastify.server.address().port}`)
    expect(err).toBeFalsy()
    fastify.listen({ host: '::1', port: fastify.server.address().port }, (err2, address2) => {
      expect(address2).toBe(null)
      expect(err2).toBeTruthy()
      done()
    })
  })
})

test('listen twice on the same port', (done) => {
  expect.assertions(4)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  fastify.listen({ port: 0 }, (err1, address1) => {
    expect(address1).toBe(`http://${localhostForURL}:${fastify.server.address().port}`)
    expect(err1).toBeFalsy()
    const s2 = Fastify()
    onTestFinished(() => fastify.close())
    s2.listen({ port: fastify.server.address().port }, (err2, address2) => {
      expect(address2).toBe(null)
      expect(err2).toBeTruthy()
      done()
    })
  })
})

test('listen twice on the same port callback with (err, address)', (done) => {
  expect.assertions(4)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  fastify.listen({ port: 0 }, (err1, address1) => {
    const _port = fastify.server.address().port
    expect(address1).toBe(`http://${localhostForURL}:${_port}`)
    expect(err1).toBeFalsy()
    const s2 = Fastify()
    onTestFinished(() => fastify.close())
    s2.listen({ port: _port }, (err2, address2) => {
      expect(address2).toBe(null)
      expect(err2).toBeTruthy()
      done()
    })
  })
})
