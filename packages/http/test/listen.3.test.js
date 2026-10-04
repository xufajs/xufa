'use strict'

const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')

const Fastify = require('..')
const helper = require('./helper')

let localhostForURL

beforeAll(async function () {
  [, localhostForURL] = await helper.getLoopbackHost()
})

// https://nodejs.org/api/net.html#net_ipc_support
if (os.platform() !== 'win32') {
  test('listen on socket', async () => {
    expect.assertions(2)
    const fastify = Fastify()
    onTestFinished(() => fastify.close())

    const sockFile = path.join(os.tmpdir(), `${(Math.random().toString(16) + '0000000').slice(2, 10)}-server.sock`)
    try {
      fs.unlinkSync(sockFile)
    } catch (e) { }

    await fastify.listen({ path: sockFile })
    expect(fastify.addresses()).toEqual([sockFile])
    expect(fastify.server.address()).toBe(sockFile)
  })
} else {
  test('listen on socket', async () => {
    expect.assertions(2)
    const fastify = Fastify()
    onTestFinished(() => fastify.close())

    const sockFile = `\\\\.\\pipe\\${(Math.random().toString(16) + '0000000').slice(2, 10)}-server-sock`

    await fastify.listen({ path: sockFile })
    expect(fastify.addresses()).toEqual([sockFile])
    expect(fastify.server.address()).toBe(sockFile)
  })
}

test('listen without callback with (address)', async () => {
  expect.assertions(1)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  const address = await fastify.listen({ port: 0 })
  expect(address).toBe(`http://${localhostForURL}:${fastify.server.address().port}`)
})

test('double listen without callback rejects', (done) => {
  expect.assertions(1)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  fastify.listen({ port: 0 })
    .then(() => {
      fastify.listen({ port: 0 })
        .catch(err => {
          expect(err).toBeTruthy()
          done()
        })
    })
    .catch(err => expect(err).toBeFalsy())
})

test('double listen without callback with (address)', (done) => {
  expect.assertions(2)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  fastify.listen({ port: 0 })
    .then(address => {
      expect(address).toBe(`http://${localhostForURL}:${fastify.server.address().port}`)
      fastify.listen({ port: 0 })
        .catch(err => {
          expect(err).toBeTruthy()
          done()
        })
    })
    .catch(err => expect(err).toBeFalsy())
})
