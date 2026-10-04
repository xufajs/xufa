'use strict'


const fastify = require('..')
const helper = require('./helper')
const Request = require('../lib/request')
const buildRequest = Request.buildRequest

const fetchForwardedRequest = async (fastifyServer, forHeader, path, protoHeader, hostHeader = 'fastify.test') => {
  const headers = {
    'X-Forwarded-For': forHeader,
    'X-Forwarded-Host': hostHeader
  }
  if (protoHeader) {
    headers['X-Forwarded-Proto'] = protoHeader
  }

  return fetch(fastifyServer + path, {
    headers
  })
}

const testRequestValues = (t, req, options) => {
  if (options.ip) {
    expect(req.ip).toBeTruthy()
    expect(req.ip).toBe(options.ip)
  }
  if (options.host) {
    expect(req.host).toBeTruthy()
    expect(req.host).toBe(options.host)
  }
  if (options.hostname) {
    expect(req.hostname).toBeTruthy()
    expect(req.hostname).toBe(options.hostname)
  }
  if (options.ips) {
    expect(req.ips).toEqual(options.ips)
  }
  if (options.protocol) {
    expect(req.protocol).toBeTruthy()
    expect(req.protocol).toBe(options.protocol)
  }
  if ('port' in options) {
    expect(req.port).toBe(options.port)
  }
}

let localhost
beforeAll(async function () {
  [localhost] = await helper.getLoopbackHost()
})

test('trust proxy, not add properties to node req', async (ctx) => {
  expect.assertions(11)
  const app = fastify({
    trustProxy: true
  })
  onTestFinished(() => app.close())

  app.get('/trustproxy', function (req, reply) {
    testRequestValues(ctx, req, { ip: '1.1.1.1', host: 'fastify.test:1234', hostname: 'fastify.test', port: 1234 })
    reply.code(200).send({ ip: req.ip, host: req.host })
  })

  app.get('/trustproxychain', function (req, reply) {
    // x-forwarded-host carries no port, so req.port is null
    testRequestValues(ctx, req, { ip: '2.2.2.2', ips: [localhost, '1.1.1.1', '2.2.2.2'], port: null })
    reply.code(200).send({ ip: req.ip, host: req.host })
  })

  const fastifyServer = await app.listen({ port: 0 })

  await fetchForwardedRequest(fastifyServer, '1.1.1.1', '/trustproxy', undefined, 'fastify.test:1234')
  await fetchForwardedRequest(fastifyServer, '2.2.2.2, 1.1.1.1', '/trustproxychain', undefined)
})

test('trust proxy chain', async (ctx) => {
  expect.assertions(7)
  const app = fastify({
    trustProxy: [localhost, '192.168.1.1']
  })
  onTestFinished(() => app.close())

  app.get('/trustproxychain', function (req, reply) {
    testRequestValues(ctx, req, { ip: '1.1.1.1', host: 'fastify.test:1234', hostname: 'fastify.test', port: 1234 })
    reply.code(200).send({ ip: req.ip, host: req.host })
  })

  const fastifyServer = await app.listen({ port: 0 })
  await fetchForwardedRequest(fastifyServer, '192.168.1.1, 1.1.1.1', '/trustproxychain', undefined, 'fastify.test:1234')
})

test('trust proxy function', async (ctx) => {
  expect.assertions(7)
  const app = fastify({
    trustProxy: (address) => address === localhost
  })
  onTestFinished(() => app.close())

  app.get('/trustproxyfunc', function (req, reply) {
    testRequestValues(ctx, req, { ip: '1.1.1.1', host: 'fastify.test:1234', hostname: 'fastify.test', port: 1234 })
    reply.code(200).send({ ip: req.ip, host: req.host })
  })

  const fastifyServer = await app.listen({ port: 0 })
  await fetchForwardedRequest(fastifyServer, '1.1.1.1', '/trustproxyfunc', undefined, 'fastify.test:1234')
})

test('trust proxy number ignores forwarded headers', async () => {
  expect.assertions(5)
  const app = fastify({
    trustProxy: 1
  })
  onTestFinished(() => app.close())

  app.get('/trustproxynumber', function (req, reply) {
    expect(req.ip).toBe('203.0.113.7')
    expect(req.ips).toEqual(['203.0.113.7'])
    expect(req.host).toBe('app.example.com')
    expect(req.hostname).toBe('app.example.com')
    expect(req.protocol).toBe('http')
    reply.code(200).send({ ip: req.ip, host: req.host })
  })

  await app.inject({
    method: 'GET',
    url: '/trustproxynumber',
    remoteAddress: '203.0.113.7',
    headers: {
      host: 'app.example.com',
      'x-forwarded-for': '9.9.9.9, 8.8.8.8',
      'x-forwarded-host': 'evil.com',
      'x-forwarded-proto': 'https'
    }
  })
})

test('trust proxy IP addresses', async (ctx) => {
  expect.assertions(8)
  const app = fastify({
    trustProxy: `${localhost}, 2.2.2.2`
  })
  onTestFinished(() => app.close())

  app.get('/trustproxyipaddrs', function (req, reply) {
    testRequestValues(ctx, req, { ip: '1.1.1.1', ips: [localhost, '1.1.1.1'], host: 'fastify.test:1234', hostname: 'fastify.test', port: 1234 })
    reply.code(200).send({ ip: req.ip, host: req.host })
  })

  const fastifyServer = await app.listen({ port: 0 })
  await fetchForwardedRequest(fastifyServer, '3.3.3.3, 2.2.2.2, 1.1.1.1', '/trustproxyipaddrs', undefined, 'fastify.test:1234')
})

test('trust proxy protocol', async (ctx) => {
  expect.assertions(27)
  const app = fastify({
    trustProxy: true
  })
  onTestFinished(() => app.close())

  app.get('/trustproxyprotocol', function (req, reply) {
    testRequestValues(ctx, req, { ip: '1.1.1.1', protocol: 'lorem', host: 'fastify.test:1234', hostname: 'fastify.test', port: 1234 })
    reply.code(200).send({ ip: req.ip, host: req.host })
  })
  app.get('/trustproxynoprotocol', function (req, reply) {
    testRequestValues(ctx, req, { ip: '1.1.1.1', protocol: 'http', host: 'fastify.test:1234', hostname: 'fastify.test', port: 1234 })
    reply.code(200).send({ ip: req.ip, host: req.host })
  })
  app.get('/trustproxyprotocols', function (req, reply) {
    testRequestValues(ctx, req, { ip: '1.1.1.1', protocol: 'dolor', host: 'fastify.test:1234', hostname: 'fastify.test', port: 1234 })
    reply.code(200).send({ ip: req.ip, host: req.host })
  })

  const fastifyServer = await app.listen({ port: 0 })

  await fetchForwardedRequest(fastifyServer, '1.1.1.1', '/trustproxyprotocol', 'lorem', 'fastify.test:1234')
  await fetchForwardedRequest(fastifyServer, '1.1.1.1', '/trustproxynoprotocol', undefined, 'fastify.test:1234')
  await fetchForwardedRequest(fastifyServer, '1.1.1.1', '/trustproxyprotocols', 'ipsum, dolor', 'fastify.test:1234')
})

test('trust proxy port is null when x-forwarded-host has no port', async (ctx) => {
  expect.assertions(5)
  const app = fastify({
    trustProxy: true
  })
  onTestFinished(() => app.close())

  app.get('/trustproxynoport', function (req, reply) {
    // req.port is derived from req.host; a forwarded host without a port yields null
    testRequestValues(ctx, req, { host: 'fastify.test', hostname: 'fastify.test', port: null })
    reply.code(200).send({ host: req.host, port: req.port })
  })

  const fastifyServer = await app.listen({ port: 0 })
  await fetchForwardedRequest(fastifyServer, '1.1.1.1', '/trustproxynoport', undefined)
})

test('trust proxy ignores forwarded headers from untrusted connections', async () => {
  expect.assertions(3)

  // Use a restrictive trust function that does NOT trust localhost
  // (simulates a direct connection bypassing the proxy)
  const app = fastify({
    trustProxy: '10.0.0.1'
  })
  onTestFinished(() => app.close())

  app.get('/untrusted', function (req, reply) {
    // protocol should fall back to socket state, not read x-forwarded-proto
    expect(req.protocol).toBe('http')
    // host should fall back to raw Host header, not read x-forwarded-host
    expect(req.host).not.toBe('evil.com')
    // hostname should also not be spoofed
    expect(req.hostname).not.toBe('evil.com')
    reply.code(200).send({ protocol: req.protocol, host: req.host })
  })

  const fastifyServer = await app.listen({ port: 0 })

  // Attacker connects directly (from localhost, which is NOT in the trust list)
  // and sends spoofed forwarded headers
  await fetch(fastifyServer + '/untrusted', {
    headers: {
      'X-Forwarded-For': '1.1.1.1',
      'X-Forwarded-Host': 'evil.com',
      'X-Forwarded-Proto': 'https'
    }
  })
})

test('trust proxy reads forwarded headers from trusted connections', async () => {
  expect.assertions(2)

  // Trust localhost (the actual connecting IP in tests)
  const app = fastify({
    trustProxy: (address) => address === localhost
  })
  onTestFinished(() => app.close())

  app.get('/trusted', function (req, reply) {
    expect(req.protocol).toBe('https')
    expect(req.host).toBe('example.com')
    reply.code(200).send({ protocol: req.protocol, host: req.host })
  })

  const fastifyServer = await app.listen({ port: 0 })

  await fetch(fastifyServer + '/trusted', {
    headers: {
      'X-Forwarded-For': '1.1.1.1',
      'X-Forwarded-Host': 'example.com',
      'X-Forwarded-Proto': 'https'
    }
  })
})

test('trust proxy with number and undefined socket remoteAddress ignores forwarded headers', async () => {
  expect.assertions(3)

  const headers = {
    host: 'real.test',
    'x-forwarded-for': '2.2.2.2, 1.1.1.1',
    'x-forwarded-host': 'fastify.test',
    'x-forwarded-proto': 'https'
  }
  const req = {
    method: 'GET',
    url: '/',
    socket: { remoteAddress: undefined },
    headers
  }

  const TpRequest = buildRequest(Request, 1)
  const request = new TpRequest('id', 'params', req, 'query', 'log')
  expect(request.ip).toBe(undefined)
  expect(request.host).toBe('real.test')
  expect(request.protocol).toBe('http')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('trust proxy with number and null socket remoteAddress ignores forwarded headers', async () => {
  expect.assertions(2)

  const headers = {
    host: 'real.test',
    'x-forwarded-for': '2.2.2.2, 1.1.1.1',
    'x-forwarded-host': 'fastify.test'
  }
  const req = {
    method: 'GET',
    url: '/',
    socket: { remoteAddress: null },
    headers
  }

  const TpRequest = buildRequest(Request, 1)
  const request = new TpRequest('id', 'params', req, 'query', 'log')
  expect(request.ip).toBe(null)
  expect(request.host).toBe('real.test')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('trust proxy does not trust x-forwarded-host/proto when socket is null', async () => {
  expect.assertions(2)

  const headers = {
    host: 'real.test',
    'x-forwarded-host': 'spoofed.test',
    'x-forwarded-proto': 'https'
  }
  const req = {
    method: 'GET',
    url: '/',
    socket: null,
    headers
  }

  const TpRequest = buildRequest(Request, true)
  const request = new TpRequest('id', 'params', req, 'query', 'log')
  expect(request.host).toBe('real.test')
  expect(request.protocol).toBe(undefined)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
