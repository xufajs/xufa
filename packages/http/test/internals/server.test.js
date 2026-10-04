'use strict'


const proxyquire = require('proxyquire')

const Fastify = require('@xufa/http')
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
  const { createServer } = proxyquire('../../lib/server', {
    'node:dns': {
      lookup: (hostname, options, cb) => {
        cb(new Error('DNS error'))
      }
    }
  })
  const { server, listen } = createServer({}, handler)
  await listen.call(Fastify(), { port: 0, host: 'localhost' })
  server.close()
  expect(true).toBeTruthy()
})

test('DNS errors does not stop the main server on localhost - callback interface', (done) => {
  expect.assertions(2)
  const { createServer } = proxyquire('../../lib/server', {
    'node:dns': {
      lookup: (hostname, options, cb) => {
        cb(new Error('DNS error'))
      }
    }
  })
  const { server, listen } = createServer({}, handler)
  listen.call(Fastify(), { port: 0, host: 'localhost' }, (err) => {
    expect(err).toBeFalsy()
    server.close()
    expect(true).toBeTruthy()
    done()
  })
})

test('DNS returns empty binding', (done) => {
  expect.assertions(2)
  const { createServer } = proxyquire('../../lib/server', {
    'node:dns': {
      lookup: (hostname, options, cb) => {
        cb(null, [])
      }
    }
  })
  const { server, listen } = createServer({}, handler)
  listen.call(Fastify(), { port: 0, host: 'localhost' }, (err) => {
    expect(err).toBeFalsy()
    server.close()
    expect(true).toBeTruthy()
    done()
  })
})

test('DNS returns more than two binding', (done) => {
  expect.assertions(2)
  const { createServer } = proxyquire('../../lib/server', {
    'node:dns': {
      lookup: (hostname, options, cb) => {
        cb(null, [
          { address: '::1', family: 6 },
          { address: '127.0.0.1', family: 4 },
          { address: '0.0.0.0', family: 4 }
        ])
      }
    }
  })
  const { server, listen } = createServer({}, handler)
  listen.call(Fastify(), { port: 0, host: 'localhost' }, (err) => {
    expect(err).toBeFalsy()
    server.close()
    expect(true).toBeTruthy()
    done()
  })
})
