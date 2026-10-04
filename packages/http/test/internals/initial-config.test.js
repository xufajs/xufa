'use strict'


const Fastify = require('../..')
const helper = require('../helper')
const http = require('node:http')
const pino = require('@xufa/logger')
const split = require('split2')
const deepClone = require('rfdc')({ circles: true, proto: false })
const { deepFreezeObject } = require('../../lib/config').utils

const { buildCertificate } = require('../build-certificate')

let localhost
let localhostForURL

beforeAll(async function () {
  await buildCertificate();
  [localhost, localhostForURL] = await helper.getLoopbackHost()
})

test('Fastify.initialConfig is an object', async () => {
  expect.assertions(1)
  expect(typeof Fastify().initialConfig === 'object').toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('without options passed to Fastify, initialConfig should expose default values', async () => {
  expect.assertions(1)

  const fastifyDefaultOptions = {
    connectionTimeout: 0,
    keepAliveTimeout: 72000,
    maxRequestsPerSocket: 0,
    requestTimeout: 0,
    handlerTimeout: 0,
    bodyLimit: 1024 * 1024,
    onProtoPoisoning: 'error',
    onConstructorPoisoning: 'error',
    pluginTimeout: 10000,
    requestIdHeader: false,
    http2SessionTimeout: 72000,
    exposeHeadRoutes: true,
    routerOptions: {
      allowUnsafeRegex: false,
      caseSensitive: true,
      constraints: undefined,
      ignoreTrailingSlash: false,
      ignoreDuplicateSlashes: false,
      maxParamLength: 100,
      useSemicolonDelimiter: false
    }
  }

  expect(Fastify().initialConfig).toEqual(fastifyDefaultOptions)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Fastify.initialConfig should expose all options', async () => {
  expect.assertions(22)

  const serverFactory = (handler, opts) => {
    const server = http.createServer((req, res) => {
      handler(req, res)
    })

    return server
  }

  const versionStrategy = {
    name: 'version',
    storage: function () {
      const versions = {}
      return {
        get: (version) => { return versions[version] || null },
        set: (version, store) => { versions[version] = store }
      }
    },
    deriveConstraint: (req, ctx) => {
      return req.headers.accept
    },
    validate () { return true }
  }

  let reqId = 0
  const options = {
    http2: true,
    https: {
      key: global.context.key,
      cert: global.context.cert
    },
    connectionTimeout: 0,
    keepAliveTimeout: 72000,
    bodyLimit: 1049600,
    onProtoPoisoning: 'remove',
    serverFactory,
    requestIdHeader: 'request-id-alt',
    pluginTimeout: 20000,
    genReqId: function (req) {
      return reqId++
    },
    loggerInstance: pino({ level: 'info' }),
    trustProxy: function myTrustFn (address, hop) {
      return address === '1.2.3.4' || hop === 1
    },
    routerOptions: {
      allowUnsafeRegex: false,
      caseSensitive: true,
      constraints: {
        version: versionStrategy
      },
      ignoreTrailingSlash: true,
      ignoreDuplicateSlashes: true,
      maxParamLength: 200,
      querystringParser: str => str,
      useSemicolonDelimiter: false
    }
  }

  const fastify = Fastify(options)

  expect(fastify.initialConfig.http2).toBe(true)
  expect(fastify.initialConfig.https).toBe(true)
  expect(fastify.initialConfig.connectionTimeout).toBe(0)
  expect(fastify.initialConfig.keepAliveTimeout).toBe(72000)
  expect(fastify.initialConfig.bodyLimit).toBe(1049600)
  expect(fastify.initialConfig.onProtoPoisoning).toBe('remove')
  expect(fastify.initialConfig.requestIdHeader).toBe('request-id-alt')
  expect(fastify.initialConfig.pluginTimeout).toBe(20000)

  // obfuscated options:
  expect(fastify.initialConfig.serverFactory).toBe(undefined)
  expect(fastify.initialConfig.trustProxy).toBe(undefined)
  expect(fastify.initialConfig.genReqId).toBe(undefined)
  expect(fastify.initialConfig.childLoggerFactory).toBe(undefined)
  expect(fastify.initialConfig.logger).toBe(undefined)
  expect(fastify.initialConfig.trustProxy).toBe(undefined)

  // router options
  expect(fastify.initialConfig.routerOptions.allowUnsafeRegex).toBe(false)
  expect(fastify.initialConfig.routerOptions.caseSensitive).toBe(true)
  expect(fastify.initialConfig.routerOptions.constraints.version).toBeTruthy()
  expect(fastify.initialConfig.routerOptions.ignoreTrailingSlash).toBe(true)
  expect(fastify.initialConfig.routerOptions.ignoreDuplicateSlashes).toBe(true)
  expect(fastify.initialConfig.routerOptions.maxParamLength).toBe(200)
  expect(fastify.initialConfig.routerOptions.querystringParser).toBe(undefined)
  expect(fastify.initialConfig.routerOptions.useSemicolonDelimiter).toBe(false)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Should throw if you try to modify Fastify.initialConfig', async () => {
  expect.assertions(8)

  const fastify = Fastify({ keepAliveTimeout: 1, routerOptions: { ignoreTrailingSlash: true } })
  try {
    fastify.initialConfig.keepAliveTimeout = 2
    expect.fail()
  } catch (error) {
    expect(error instanceof TypeError).toBeTruthy()
    expect(error.message).toBe("Cannot assign to read only property 'keepAliveTimeout' of object '#<Object>'")
    expect(error.stack).toBeTruthy()
    expect(true).toBeTruthy()
  }
  try {
    fastify.initialConfig.routerOptions.ignoreTrailingSlash = false
    expect.fail()
  } catch (error) {
    expect(error instanceof TypeError).toBeTruthy()
    expect(error.message).toBe("Cannot assign to read only property 'ignoreTrailingSlash' of object '#<Object>'")
    expect(error.stack).toBeTruthy()
    expect(true).toBeTruthy()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('We must avoid shallow freezing and ensure that the whole object is freezed', async () => {
  expect.assertions(4)

  const fastify = Fastify({
    https: {
      allowHTTP1: true,
      key: global.context.key,
      cert: global.context.cert
    }
  })

  try {
    fastify.initialConfig.https.allowHTTP1 = false
    expect.fail()
  } catch (error) {
    expect(error instanceof TypeError).toBeTruthy()
    expect(error.message).toBe("Cannot assign to read only property 'allowHTTP1' of object '#<Object>'")
    expect(error.stack).toBeTruthy()
    expect(fastify.initialConfig.https).toEqual({
      allowHTTP1: true
    })
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('https value check', async () => {
  expect.assertions(1)

  const fastify = Fastify({})
  expect(fastify.initialConfig.https).toBeFalsy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Return an error if options do not match the validation schema', async () => {
  expect.assertions(6)

  try {
    Fastify({ ignoreTrailingSlash: 'string instead of boolean' })

    expect.fail()
  } catch (error) {
    expect(error instanceof Error).toBeTruthy()
    expect(error.name).toBe('XufaError')
    expect(error.message).toBe('Invalid initialization options: \'["must be boolean"]\'')
    expect(error.code).toBe('XUFA_ERR_INIT_OPTS_INVALID')
    expect(error.stack).toBeTruthy()
    expect(true).toBeTruthy()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Original options must not be frozen', async () => {
  expect.assertions(4)

  const originalOptions = {
    https: {
      allowHTTP1: true,
      key: global.context.key,
      cert: global.context.cert
    }
  }

  const fastify = Fastify(originalOptions)

  expect(Object.isFrozen(originalOptions)).toBe(false)
  expect(Object.isFrozen(originalOptions.https)).toBe(false)
  expect(Object.isFrozen(fastify.initialConfig)).toBe(true)
  expect(Object.isFrozen(fastify.initialConfig.https)).toBe(true)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Original options must not be altered (test deep cloning)', async () => {
  expect.assertions(3)

  const originalOptions = {
    https: {
      allowHTTP1: true,
      key: global.context.key,
      cert: global.context.cert
    }
  }

  const originalOptionsClone = deepClone(originalOptions)

  const fastify = Fastify(originalOptions)

  // initialConfig has been triggered
  expect(Object.isFrozen(fastify.initialConfig)).toBe(true)

  // originalOptions must not have been altered
  expect(originalOptions.https.key).toEqual(originalOptionsClone.https.key)
  expect(originalOptions.https.cert).toEqual(originalOptionsClone.https.cert)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Should not have issues when passing stream options to Pino.js', (done) => {
  expect.assertions(17)

  const stream = split(JSON.parse)

  const originalOptions = {
    logger: {
      level: 'trace',
      stream
    },
    routerOptions: {
      ignoreTrailingSlash: true
    }
  }

  let fastify

  try {
    fastify = Fastify(originalOptions)
    fastify.setChildLoggerFactory(function (logger, bindings, opts) {
      bindings.someBinding = 'value'
      return logger.child(bindings, opts)
    })

    expect(typeof fastify === 'object').toBeTruthy()
    expect(fastify.initialConfig).toEqual({
      connectionTimeout: 0,
      keepAliveTimeout: 72000,
      maxRequestsPerSocket: 0,
      requestTimeout: 0,
      handlerTimeout: 0,
      bodyLimit: 1024 * 1024,
      onProtoPoisoning: 'error',
      onConstructorPoisoning: 'error',
      pluginTimeout: 10000,
      requestIdHeader: false,
      http2SessionTimeout: 72000,
      exposeHeadRoutes: true,
      routerOptions: {
        allowUnsafeRegex: false,
        caseSensitive: true,
        constraints: undefined,
        ignoreTrailingSlash: true,
        ignoreDuplicateSlashes: false,
        maxParamLength: 100,
        useSemicolonDelimiter: false
      }
    })
  } catch (error) {
    expect.fail()
  }

  fastify.get('/', function (req, reply) {
    expect(req.log).toBeTruthy()
    reply.send({ hello: 'world' })
  })

  stream.once('data', listenAtLogLine => {
    expect(listenAtLogLine).toBeTruthy()

    stream.once('data', line => {
      const id = line.reqId
      expect(line.reqId).toBeTruthy()
      expect(line.someBinding).toBe('value')
      expect(line.req).toBeTruthy()
      expect(line.msg).toBe('incoming request')
      expect(line.req.method).toBe('GET')

      stream.once('data', line => {
        expect(line.reqId).toBe(id)
        expect(line.reqId).toBeTruthy()
        expect(line.someBinding).toBe('value')
        expect(line.res).toBeTruthy()
        expect(line.msg).toBe('request completed')
        expect(line.res.statusCode).toBe(200)
        expect(line.responseTime).toBeTruthy()
      })
    })
  })

  fastify.listen({ port: 0, host: localhost }, err => {
    expect(err).toBeFalsy()
    onTestFinished(() => { fastify.close() })

    http.get(`http://${localhostForURL}:${fastify.server.address().port}`, () => {
      done()
    })
  })
})

test('deepFreezeObject() should not throw on TypedArray', async () => {
  expect.assertions(5)

  const object = {
    buffer: Buffer.from(global.context.key),
    dataView: new DataView(new ArrayBuffer(16)),
    float: 1.1,
    integer: 1,
    object: {
      nested: { string: 'string' }
    },
    stream: split(JSON.parse),
    string: 'string'
  }

  try {
    const frozenObject = deepFreezeObject(object)

    // Buffers should not be frozen, as they are Uint8Array inherited instances
    expect(Object.isFrozen(frozenObject.buffer)).toBe(false)

    expect(Object.isFrozen(frozenObject)).toBe(true)
    expect(Object.isFrozen(frozenObject.object)).toBe(true)
    expect(Object.isFrozen(frozenObject.object.nested)).toBe(true)

    expect(true).toBeTruthy()
  } catch (error) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('pluginTimeout should be parsed correctly', () => {
  const withDisabledTimeout = Fastify({ pluginTimeout: '0' })
  expect(withDisabledTimeout.initialConfig.pluginTimeout).toBe(0)
  const withInvalidTimeout = Fastify({ pluginTimeout: undefined })
  expect(withInvalidTimeout.initialConfig.pluginTimeout).toBe(10000)
})

test('Should not mutate the options object outside Fastify', async () => {
  const options = Object.freeze({})

  try {
    Fastify(options)
    expect(true).toBeTruthy()
  } catch (error) {
    expect.fail(error.message)
  }
})
