'use strict'


const dns = require('node:dns').promises
const dnsCb = require('node:dns')
const Fastify = require('@xufa/http')
const helper = require('./helper')

let localhostForURL

function getUrl (fastify, lookup) {
  const { port } = fastify.server.address()
  if (lookup.family === 6) {
    return `http://[${lookup.address}]:${port}/`
  } else {
    return `http://${lookup.address}:${port}/`
  }
}

beforeAll(async function () {
  [, localhostForURL] = await helper.getLoopbackHost()
})

test('listen twice on the same port without callback rejects', (done) => {
  expect.assertions(1)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.listen({ port: 0 })
    .then(() => {
      const server2 = Fastify()
      onTestFinished(() => server2.close())
      server2.listen({ port: fastify.server.address().port })
        .catch(err => {
          expect(err).toBeTruthy()
          done()
        })
    })
    .catch(err => {
      expect(err).toBeFalsy()
    })
})

test('listen twice on the same port without callback rejects with (address)', (done) => {
  expect.assertions(2)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  fastify.listen({ port: 0 })
    .then(address => {
      const server2 = Fastify()
      onTestFinished(() => server2.close())
      expect(address).toBe(`http://${localhostForURL}:${fastify.server.address().port}`)

      server2.listen({ port: fastify.server.address().port })
        .catch(err => {
          expect(err).toBeTruthy()
          done()
        })
    })
    .catch(err => {
      expect(err).toBeFalsy()
    })
})

test('listen on invalid port without callback rejects', () => {
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  return fastify.listen({ port: -1 })
    .catch(err => {
      expect(err).toBeTruthy()
      return true
    })
})

test('listen logs the port as info', async () => {
  expect.assertions(1)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  const msgs = []
  fastify.log.info = function (msg) {
    msgs.push(msg)
  }

  await fastify.listen({ port: 0 })
  expect(/http:\/\//.test(msgs[0])).toBeTruthy()
})

test('listen on localhost binds IPv4 and IPv6 - promise interface', async () => {
  const localAddresses = await dns.lookup('localhost', { all: true })
  expect.assertions(3 * localAddresses.length)

  const app = Fastify()
  app.get('/', async () => 'hello localhost')
  onTestFinished(() => app.close())
  await app.listen({ port: 0, host: 'localhost' })

  for (const lookup of localAddresses) {
    const result = await fetch(getUrl(app, lookup), {
      method: 'GET'
    })

    expect(result.ok).toBeTruthy()
    expect(result.status).toEqual(200)
    expect(await result.text()).toEqual('hello localhost')
  }
})

test('listen on localhost binds to all interfaces (both IPv4 and IPv6 if present) - callback interface', async () => {
  const lookups = await new Promise((resolve, reject) => {
    dnsCb.lookup('localhost', { all: true }, (err, lookups) => {
      if (err) return reject(err)
      resolve(lookups)
    })
  })

  expect.assertions(3 * lookups.length)

  const app = Fastify()
  app.get('/', async () => 'hello localhost')
  onTestFinished(() => app.close())

  await app.listen({ port: 0, host: 'localhost' })

  // Loop over each lookup and perform the assertions
  for (const lookup of lookups) {
    const result = await fetch(getUrl(app, lookup), {
      method: 'GET'
    })

    expect(result.ok).toBeTruthy()
    expect(result.status).toEqual(200)
    expect(await result.text()).toEqual('hello localhost')
  }
})

test('addresses getter', async () => {
  let localAddresses = await dns.lookup('localhost', { all: true })

  expect.assertions(4)
  const app = Fastify()
  app.get('/', async () => 'hello localhost')
  onTestFinished(() => app.close())

  expect(app.addresses()).toEqual([])
  await app.ready()

  expect(app.addresses()).toEqual([])
  await app.listen({ port: 0, host: 'localhost' })

  // fix citgm
  // dns lookup may have duplicated addresses (rhel8-s390x rhel8-ppc64le debian10-x64)

  localAddresses = [...new Set([...localAddresses.map(a => JSON.stringify({
    address: a.address,
    family: typeof a.family === 'number' ? 'IPv' + a.family : a.family
  }))])].sort()

  const appAddresses = app.addresses().map(a => JSON.stringify({
    address: a.address,
    family: typeof a.family === 'number' ? 'IPv' + a.family : a.family
  })).sort()

  expect(appAddresses).toEqual(localAddresses)

  await app.close()
  expect(app.addresses()).toEqual([])
})
