'use strict'


const dns = require('node:dns')

// lib/server.js (and Fastify) with node:dns.lookup replaced (the library is ES modules: proxyquire, which replaced the requires of
// CommonJS, cannot reach their imports; vyntra's doMock and a fresh import can).
async function serverWith (lookup) {
  vi.resetModules()
  vi.doMock('node:dns', () => ({ ...dns, lookup, default: { ...dns, lookup } }))
  try {
    // Fastify of the same copy of the modules (their symbols are those of that copy).
    const { createServer } = await import('../../lib/server.js')
    return { createServer, Fastify: (await import('../../lib/xufa.js')).default }
  } finally {
    vi.doUnmock('node:dns')
  }
}

const Fastify = require('../..')
const { createServer } = require('../../lib/server')

const handler = (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ data: 'Hello World!' }))
}

test('start listening', async () => {
  const { server, listen } = createServer({}, handler)
  await listen.call(Fastify(), { port: 0, host: 'localhost' })
  server.close()
  expect(true).toBeTruthy()
})

test('DNS errors does not stop the main server on localhost - promise interface', async () => {
  const { createServer, Fastify } = await serverWith((hostname, options, cb) => {
    cb(new Error('DNS error'))
  })
  const { server, listen } = createServer({}, handler)
  await listen.call(Fastify(), { port: 0, host: 'localhost' })
  server.close()
  expect(true).toBeTruthy()
})

test('DNS errors does not stop the main server on localhost - callback interface', async () => {
  expect.assertions(2)
  const { createServer, Fastify } = await serverWith((hostname, options, cb) => {
    cb(new Error('DNS error'))
  })
  await new Promise((done) => {
    const { server, listen } = createServer({}, handler)
    listen.call(Fastify(), { port: 0, host: 'localhost' }, (err) => {
      expect(err).toBeFalsy()
      server.close()
      expect(true).toBeTruthy()
      done()
    })
  })
})

test('DNS returns empty binding', async () => {
  expect.assertions(2)
  const { createServer, Fastify } = await serverWith((hostname, options, cb) => {
    cb(null, [])
  })
  await new Promise((done) => {
    const { server, listen } = createServer({}, handler)
    listen.call(Fastify(), { port: 0, host: 'localhost' }, (err) => {
      expect(err).toBeFalsy()
      server.close()
      expect(true).toBeTruthy()
      done()
    })
  })
})

test('DNS returns more than two binding', async () => {
  expect.assertions(2)
  const { createServer, Fastify } = await serverWith((hostname, options, cb) => {
    cb(null, [
      { address: '::1', family: 6 },
      { address: '127.0.0.1', family: 4 },
      { address: '0.0.0.0', family: 4 }
    ])
  })
  await new Promise((done) => {
    const { server, listen } = createServer({}, handler)
    listen.call(Fastify(), { port: 0, host: 'localhost' }, (err) => {
      expect(err).toBeFalsy()
      server.close()
      expect(true).toBeTruthy()
      done()
    })
  })
})
