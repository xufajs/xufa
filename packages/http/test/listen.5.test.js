'use strict'


const net = require('node:net')
const { once } = require('node:events')
const { spyWarning } = require('@xufa/http/lib/warnings')
const Fastify = require('@xufa/http')
const { XUFAWRN003 } = require('../lib/warnings')

function createDeferredPromise () {
  const promise = {}
  promise.promise = new Promise((resolve) => {
    promise.resolve = resolve
  })
  return promise
}

test('same port conflict and success should not fire callback multiple times - callback', async () => {
  expect.assertions(7)
  const server = net.createServer()
  server.listen({ port: 0, host: '127.0.0.1' })
  await once(server, 'listening')
  const option = { port: server.address().port, host: server.address().address }
  let count = 0
  const fastify = Fastify()
  const promise = createDeferredPromise()
  function callback (err) {
    switch (count) {
      case 6: {
        // success in here
        expect(err).toBeFalsy()
        fastify.close((err) => {
          expect(err).toBeFalsy()
          promise.resolve()
        })
        break
      }
      case 5: {
        server.close()
        setTimeout(() => {
          fastify.listen(option, callback)
        }, 100)
        break
      }
      default: {
        // expect error
        expect(err.code).toBe('EADDRINUSE')
        setTimeout(() => {
          fastify.listen(option, callback)
        }, 100)
      }
    }
    count++
  }
  fastify.listen(option, callback)
  await promise.promise
})

test('same port conflict and success should not fire callback multiple times - promise', async () => {
  expect.assertions(5)
  const server = net.createServer()
  server.listen({ port: 0, host: '127.0.0.1' })
  await once(server, 'listening')
  const option = { port: server.address().port, host: server.address().address }
  const fastify = Fastify()

  try {
    await fastify.listen(option)
  } catch (err) {
    expect(err.code).toBe('EADDRINUSE')
  }
  try {
    await fastify.listen(option)
  } catch (err) {
    expect(err.code).toBe('EADDRINUSE')
  }
  try {
    await fastify.listen(option)
  } catch (err) {
    expect(err.code).toBe('EADDRINUSE')
  }
  try {
    await fastify.listen(option)
  } catch (err) {
    expect(err.code).toBe('EADDRINUSE')
  }
  try {
    await fastify.listen(option)
  } catch (err) {
    expect(err.code).toBe('EADDRINUSE')
  }

  server.close()

  await once(server, 'close')

  // when ever we can listen, and close properly
  // which means there is no problem on the callback
  await fastify.listen()
  await fastify.close()
})

test('should emit a warning when using async callback', (done) => {
  expect.assertions(2)

  const spyData = spyWarning(XUFAWRN003)
  const fastify = Fastify()

  onTestFinished(async () => {
    await fastify.close()
    spyData.restore()
  })

  fastify.listen({ port: 0 }, async function doNotUseAsyncCallback () {
    expect(spyData.calls).toEqual([{ arguments: ['listen method'], result: true }])
    expect(spyData.callCount()).toBe(1)
    done()
  })
})
