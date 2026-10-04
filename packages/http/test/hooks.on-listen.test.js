'use strict'


const Fastify = require('@xufa/http')
const fp = require('@xufa/http').plugin
const split = require('split2')
const helper = require('./helper')
const { kState } = require('../lib/symbols')
const { networkInterfaces } = require('node:os')

const isIPv6Missing = !Object.values(networkInterfaces()).flat().some(({ family }) => family === 'IPv6')

let localhost
beforeAll(async function () {
  [localhost] = await helper.getLoopbackHost()
})

test('onListen should not be processed when .ready() is called', (testDone) => {
  expect.assertions(1)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.addHook('onListen', function (done) {
    expect.fail()
    done()
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('localhost onListen should be called in order', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  let order = 0

  fastify.addHook('onListen', function (done) {
    expect(++order).toBe(1)
    done()
  })

  fastify.addHook('onListen', function (done) {
    expect(++order).toBe(2)
    done()
  })

  fastify.listen({
    host: 'localhost',
    port: 0
  }, testDone)
})

test('localhost async onListen should be called in order', async () => {
  expect.assertions(3)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  let order = 0

  fastify.addHook('onListen', async function () {
    expect(++order).toBe(1)
  })

  fastify.addHook('onListen', async function () {
    expect(++order).toBe(2)
  })

  await fastify.listen({
    host: 'localhost',
    port: 0
  })
  expect(order).toBe(2)
})

test('localhost onListen sync should log errors as warnings and continue /1', async () => {
  expect.assertions(8)
  let order = 0
  const stream = split(JSON.parse)
  const fastify = Fastify({
    forceCloseConnections: false,
    logger: {
      stream,
      level: 'info'
    }
  })
  onTestFinished(() => fastify.close())

  stream.on('data', message => {
    if (message.msg.includes('FAIL ON LISTEN')) {
      expect(order).toBe(2)
      expect('Logged Error Message').toBeTruthy()
    }
  })

  fastify.addHook('onListen', function (done) {
    expect(++order).toBe(1)
    expect('called in root').toBeTruthy()
    done()
  })

  fastify.addHook('onListen', function (done) {
    expect(++order).toBe(2)
    expect('called onListen error').toBeTruthy()
    throw new Error('FAIL ON LISTEN')
  })

  fastify.addHook('onListen', function (done) {
    expect(++order).toBe(3)
    expect('onListen hooks continue after error').toBeTruthy()
    done()
  })

  await fastify.listen({
    host: 'localhost',
    port: 0
  })
})

test('localhost onListen sync should log errors as warnings and continue /2', (testDone) => {
  expect.assertions(7)
  const stream = split(JSON.parse)
  const fastify = Fastify({
    forceCloseConnections: false,
    logger: {
      stream,
      level: 'info'
    }
  })
  onTestFinished(() => fastify.close())

  let order = 0

  stream.on('data', message => {
    if (message.msg.includes('FAIL ON LISTEN')) {
      expect('Logged Error Message').toBeTruthy()
    }
  })

  fastify.addHook('onListen', function (done) {
    expect(++order).toBe(1)
    expect('called in root').toBeTruthy()
    done()
  })

  fastify.addHook('onListen', function (done) {
    expect(++order).toBe(2)
    expect('called onListen error').toBeTruthy()
    done(new Error('FAIL ON LISTEN'))
  })

  fastify.addHook('onListen', function (done) {
    expect(++order).toBe(3)
    expect('onListen hooks continue after error').toBeTruthy()
    done()
  })

  fastify.listen({
    host: 'localhost',
    port: 0
  }, testDone)
})

test('localhost onListen async should log errors as warnings and continue', async () => {
  expect.assertions(4)
  const stream = split(JSON.parse)
  const fastify = Fastify({
    forceCloseConnections: false,
    logger: {
      stream,
      level: 'info'
    }
  })
  onTestFinished(() => fastify.close())

  stream.on('data', message => {
    if (message.msg.includes('FAIL ON LISTEN')) {
      expect('Logged Error Message').toBeTruthy()
    }
  })

  fastify.addHook('onListen', async function () {
    expect('called in root').toBeTruthy()
  })

  fastify.addHook('onListen', async function () {
    expect('called onListen error').toBeTruthy()
    throw new Error('FAIL ON LISTEN')
  })

  fastify.addHook('onListen', async function () {
    expect('onListen hooks continue after error').toBeTruthy()
  })

  await fastify.listen({
    host: 'localhost',
    port: 0
  })
})

test('localhost Register onListen hook after a plugin inside a plugin', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('onListen', function (done) {
      expect('called').toBeTruthy()
      done()
    })
    done()
  }))

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('onListen', function (done) {
      expect('called').toBeTruthy()
      done()
    })

    instance.addHook('onListen', function (done) {
      expect('called').toBeTruthy()
      done()
    })

    done()
  }))

  fastify.listen({
    host: 'localhost',
    port: 0
  }, testDone)
})

test('localhost Register onListen hook after a plugin inside a plugin should log errors as warnings and continue', (testDone) => {
  expect.assertions(6)
  const stream = split(JSON.parse)
  const fastify = Fastify({
    forceCloseConnections: false,
    logger: {
      stream,
      level: 'info'
    }
  })
  onTestFinished(() => fastify.close())

  stream.on('data', message => {
    if (message.msg.includes('Plugin Error')) {
      expect('Logged Error Message').toBeTruthy()
    }
  })

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('onListen', function () {
      expect('called').toBeTruthy()
      throw new Error('Plugin Error')
    })
    done()
  }))

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('onListen', function () {
      expect('called').toBeTruthy()
      throw new Error('Plugin Error')
    })

    instance.addHook('onListen', function () {
      expect('called').toBeTruthy()
      throw new Error('Plugin Error')
    })

    done()
  }))

  fastify.listen({
    host: 'localhost',
    port: 0
  }, testDone)
})

test('localhost onListen encapsulation should be called in order', async () => {
  expect.assertions(8)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  let order = 0

  fastify.addHook('onListen', function (done) {
    expect(++order).toBe(1)
    expect(this.pluginName).toBe(fastify.pluginName)
    done()
  })

  await fastify.register(async (childOne, o) => {
    childOne.addHook('onListen', function (done) {
      expect(++order).toBe(2)
      expect(this.pluginName).toBe(childOne.pluginName)
      done()
    })

    await childOne.register(async (childTwo, o) => {
      childTwo.addHook('onListen', async function () {
        expect(++order).toBe(3)
        expect(this.pluginName).toBe(childTwo.pluginName)
      })
    })

    await childOne.register(async (childTwoPeer, o) => {
      childTwoPeer.addHook('onListen', async function () {
        expect(++order).toBe(4)
        expect(this.pluginName).toBe(childTwoPeer.pluginName)
      })
    })
  })
  await fastify.listen({
    host: 'localhost',
    port: 0
  })
})

test('localhost onListen encapsulation with only nested hook', async () => {
  expect.assertions(1)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  await fastify.register(async (child) => {
    await child.register(async (child2) => {
      child2.addHook('onListen', function (done) {
        expect().toBeTruthy()
        done()
      })
    })
  })

  await fastify.listen({
    host: 'localhost',
    port: 0
  })
})

test('localhost onListen peer encapsulations with only nested hooks', async () => {
  expect.assertions(2)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  await fastify.register(async (child) => {
    await child.register(async (child2) => {
      child2.addHook('onListen', function (done) {
        expect().toBeTruthy()
        done()
      })
    })

    await child.register(async (child2) => {
      child2.addHook('onListen', function (done) {
        expect().toBeTruthy()
        done()
      })
    })
  })

  await fastify.listen({
    host: 'localhost',
    port: 0
  })
})

test('localhost onListen encapsulation should be called in order and should log errors as warnings and continue', (testDone) => {
  expect.assertions(7)
  const stream = split(JSON.parse)
  const fastify = Fastify({
    forceCloseConnections: false,
    logger: {
      stream,
      level: 'info'
    }
  })
  onTestFinished(() => fastify.close())

  stream.on('data', message => {
    if (message.msg.includes('Error in onListen hook of childTwo')) {
      expect('Logged Error Message').toBeTruthy()
    }
  })

  let order = 0

  fastify.addHook('onListen', function (done) {
    expect(++order).toBe(1)
    expect(this.pluginName).toBe(fastify.pluginName)
    done()
  })

  fastify.register(async (childOne, o) => {
    childOne.addHook('onListen', function (done) {
      expect(++order).toBe(2)
      expect(this.pluginName).toBe(childOne.pluginName)
      done()
    })
    childOne.register(async (childTwo, o) => {
      childTwo.addHook('onListen', async function () {
        expect(++order).toBe(3)
        expect(this.pluginName).toBe(childTwo.pluginName)
        throw new Error('Error in onListen hook of childTwo')
      })
    })
  })
  fastify.listen({
    host: 'localhost',
    port: 0
  }, testDone)
})

test.skipIf(isIPv6Missing)('non-localhost onListen should be called in order', (testDone) => {
  expect.assertions(2)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  let order = 0

  fastify.addHook('onListen', function (done) {
    expect(++order).toBe(1)
    done()
  })

  fastify.addHook('onListen', function (done) {
    expect(++order).toBe(2)
    done()
  })
  fastify.listen({
    host: '::1',
    port: 0
  }, testDone)
})

test.skipIf(isIPv6Missing)('non-localhost async onListen should be called in order', async () => {
  expect.assertions(2)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  let order = 0

  fastify.addHook('onListen', async function () {
    expect(++order).toBe(1)
  })

  fastify.addHook('onListen', async function () {
    expect(++order).toBe(2)
  })

  await fastify.listen({
    host: '::1',
    port: 0
  })
})

test.skipIf(isIPv6Missing)('non-localhost sync onListen should log errors as warnings and continue', (testDone) => {
  expect.assertions(4)
  const stream = split(JSON.parse)
  const fastify = Fastify({
    forceCloseConnections: false,
    logger: {
      stream,
      level: 'info'
    }
  })
  onTestFinished(() => fastify.close())

  stream.on('data', message => {
    if (message.msg.includes('FAIL ON LISTEN')) {
      expect('Logged Error Message').toBeTruthy()
    }
  })
  let order = 0

  fastify.addHook('onListen', function (done) {
    expect(++order).toBe(1)
    done()
  })

  fastify.addHook('onListen', function () {
    expect(++order).toBe(2)
    throw new Error('FAIL ON LISTEN')
  })

  fastify.addHook('onListen', function (done) {
    expect(++order).toBe(3)
    done()
  })

  fastify.listen({
    host: '::1',
    port: 0
  }, testDone)
})

test.skipIf(isIPv6Missing)('non-localhost async onListen should log errors as warnings and continue', async () => {
  expect.assertions(6)
  const stream = split(JSON.parse)
  const fastify = Fastify({
    forceCloseConnections: false,
    logger: {
      stream,
      level: 'info'
    }
  })
  onTestFinished(() => fastify.close())

  stream.on('data', message => {
    if (message.msg.includes('FAIL ON LISTEN')) {
      expect('Logged Error Message').toBeTruthy()
    }
  })

  let order = 0

  fastify.addHook('onListen', async function () {
    expect(++order).toBe(1)
    expect('called in root').toBeTruthy()
  })

  fastify.addHook('onListen', async function () {
    expect(++order).toBe(2)
    throw new Error('FAIL ON LISTEN')
  })

  fastify.addHook('onListen', async function () {
    expect(++order).toBe(3)
    expect('should still run').toBeTruthy()
  })

  await fastify.listen({
    host: '::1',
    port: 0
  })
})

test.skipIf(isIPv6Missing)('non-localhost Register onListen hook after a plugin inside a plugin', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('onListen', function (done) {
      expect('called').toBeTruthy()
      done()
    })
    done()
  }))

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('onListen', function (done) {
      expect('called').toBeTruthy()
      done()
    })

    instance.addHook('onListen', function (done) {
      expect('called').toBeTruthy()
      done()
    })

    done()
  }))

  fastify.listen({
    host: '::1',
    port: 0
  }, testDone)
})

test.skipIf(isIPv6Missing)('non-localhost Register onListen hook after a plugin inside a plugin should log errors as warnings and continue', (testDone) => {
  expect.assertions(6)
  const stream = split(JSON.parse)
  const fastify = Fastify({
    forceCloseConnections: false,
    logger: {
      stream,
      level: 'info'
    }
  })
  onTestFinished(() => fastify.close())

  stream.on('data', message => {
    if (message.msg.includes('Plugin Error')) {
      expect('Logged Error Message').toBeTruthy()
    }
  })

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('onListen', function () {
      expect('called').toBeTruthy()
      throw new Error('Plugin Error')
    })
    done()
  }))

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('onListen', function () {
      expect('called').toBeTruthy()
      throw new Error('Plugin Error')
    })

    instance.addHook('onListen', function () {
      expect('called').toBeTruthy()
      throw new Error('Plugin Error')
    })

    done()
  }))

  fastify.listen({
    host: '::1',
    port: 0
  }, testDone)
})

test.skipIf(isIPv6Missing)('non-localhost onListen encapsulation should be called in order', (testDone) => {
  expect.assertions(6)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  let order = 0

  fastify.addHook('onListen', function (done) {
    expect(++order).toBe(1)
    expect(this.pluginName).toBe(fastify.pluginName)
    done()
  })

  fastify.register(async (childOne, o) => {
    childOne.addHook('onListen', function (done) {
      expect(++order).toBe(2)
      expect(this.pluginName).toBe(childOne.pluginName)
      done()
    })
    childOne.register(async (childTwo, o) => {
      childTwo.addHook('onListen', async function () {
        expect(++order).toBe(3)
        expect(this.pluginName).toBe(childTwo.pluginName)
      })
    })
  })
  fastify.listen({
    host: '::1',
    port: 0
  }, testDone)
})

test.skipIf(isIPv6Missing)('non-localhost onListen encapsulation should be called in order and should log errors as warnings and continue', (testDone) => {
  expect.assertions(7)
  const stream = split(JSON.parse)
  const fastify = Fastify({
    forceCloseConnections: false,
    logger: {
      stream,
      level: 'info'
    }
  })
  onTestFinished(() => fastify.close())

  stream.on('data', message => {
    if (message.msg.includes('Error in onListen hook of childTwo')) {
      expect('Logged Error Message').toBeTruthy()
    }
  })

  let order = 0

  fastify.addHook('onListen', function (done) {
    expect(++order).toBe(1)

    expect(this.pluginName).toBe(fastify.pluginName)
    done()
  })

  fastify.register(async (childOne, o) => {
    childOne.addHook('onListen', function (done) {
      expect(++order).toBe(2)
      expect(this.pluginName).toBe(childOne.pluginName)
      done()
    })
    childOne.register(async (childTwo, o) => {
      childTwo.addHook('onListen', async function () {
        expect(++order).toBe(3)
        expect(this.pluginName).toBe(childTwo.pluginName)
        throw new Error('Error in onListen hook of childTwo')
      })
    })
  })
  fastify.listen({
    host: '::1',
    port: 0
  }, testDone)
})

test('onListen localhost should work in order with callback', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  let order = 0

  fastify.addHook('onListen', function (done) {
    expect(++order).toBe(1)
    done()
  })

  fastify.addHook('onListen', function (done) {
    expect(++order).toBe(2)
    done()
  })

  fastify.listen({ port: 0 }, (err) => {
    expect(fastify.server.address().address).toBe(localhost)
    expect(err).toBeFalsy()
    testDone()
  })
})

test('onListen localhost should work in order with callback in async', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  let order = 0

  fastify.addHook('onListen', async function () {
    expect(++order).toBe(1)
  })

  fastify.addHook('onListen', async function () {
    expect(++order).toBe(2)
  })

  fastify.listen({ host: 'localhost', port: 0 }, (err) => {
    expect(fastify.server.address().address).toBe(localhost)
    expect(err).toBeFalsy()
    testDone()
  })
})

test('onListen localhost sync with callback should log errors as warnings and continue', (testDone) => {
  expect.assertions(6)
  const stream = split(JSON.parse)
  const fastify = Fastify({
    forceCloseConnections: false,
    logger: {
      stream,
      level: 'info'
    }
  })
  onTestFinished(() => fastify.close())

  stream.on('data', message => {
    if (message.msg.includes('FAIL ON LISTEN')) {
      expect('Logged Error Message').toBeTruthy()
    }
  })

  let order = 0

  fastify.addHook('onListen', function (done) {
    expect(++order).toBe(1)
    done()
  })

  fastify.addHook('onListen', function () {
    expect(++order).toBe(2)
    throw new Error('FAIL ON LISTEN')
  })

  fastify.addHook('onListen', function (done) {
    expect(++order).toBe(3)
    done()
  })

  fastify.listen({ port: 0 }, (err) => {
    expect(err).toBeFalsy()
    expect(fastify.server.address().address).toBe(localhost)
    testDone()
  })
})

test('onListen localhost async with callback should log errors as warnings and continue', (testDone) => {
  expect.assertions(6)
  const stream = split(JSON.parse)
  const fastify = Fastify({
    forceCloseConnections: false,
    logger: {
      stream,
      level: 'info'
    }
  })
  onTestFinished(() => fastify.close())

  stream.on('data', message => {
    if (message.msg.includes('FAIL ON LISTEN')) {
      expect('Logged Error Message').toBeTruthy()
    }
  })

  let order = 0

  fastify.addHook('onListen', async function () {
    expect('1st called in root').toBeTruthy()
  })

  fastify.addHook('onListen', async function () {
    expect(++order).toBe(1)
    throw new Error('FAIL ON LISTEN')
  })

  fastify.addHook('onListen', async function () {
    expect('3rd called in root').toBeTruthy()
  })

  fastify.listen({ port: 0 }, (err) => {
    expect(err).toBeFalsy()
    expect(fastify.server.address().address).toBe(localhost)
    testDone()
  })
})

test('Register onListen hook localhost with callback after a plugin inside a plugin', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('onListen', function (done) {
      expect('called').toBeTruthy()
      done()
    })
    done()
  }))

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('onListen', function (done) {
      expect('called').toBeTruthy()
      done()
    })

    instance.addHook('onListen', function (done) {
      expect('called').toBeTruthy()
      done()
    })

    done()
  }))

  fastify.listen({ port: 0 }, (err) => {
    expect(fastify.server.address().address).toBe(localhost)
    expect(err).toBeFalsy()
    testDone()
  })
})

test('onListen localhost with callback encapsulation should be called in order', (testDone) => {
  expect.assertions(8)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  let order = 0

  fastify.addHook('onListen', function (done) {
    expect(++order).toBe(1)
    expect(this.pluginName).toBe(fastify.pluginName)
    done()
  })

  fastify.register(async (childOne, o) => {
    childOne.addHook('onListen', function (done) {
      expect(++order).toBe(2)
      expect(this.pluginName).toBe(childOne.pluginName)
      done()
    })
    childOne.register(async (childTwo, o) => {
      childTwo.addHook('onListen', async function () {
        expect(++order).toBe(3)
        expect(this.pluginName).toBe(childTwo.pluginName)
      })
    })
  })
  fastify.listen({ port: 0 }, (err) => {
    expect(fastify.server.address().address).toBe(localhost)
    expect(err).toBeFalsy()
    testDone()
  })
})

test.skipIf(isIPv6Missing)('onListen non-localhost should work in order with callback in sync', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  let order = 0

  fastify.addHook('onListen', function (done) {
    expect(++order).toBe(1)
    done()
  })

  fastify.addHook('onListen', function (done) {
    expect(++order).toBe(2)
    done()
  })

  fastify.listen({ host: '::1', port: 0 }, (err) => {
    expect(fastify.server.address().address).toBe('::1')
    expect(err).toBeFalsy()
    testDone()
  })
})

test.skipIf(isIPv6Missing)('onListen non-localhost should work in order with callback in async', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  let order = 0

  fastify.addHook('onListen', async function () {
    expect(++order).toBe(1)
  })

  fastify.addHook('onListen', async function () {
    expect(++order).toBe(2)
  })

  fastify.listen({ host: '::1', port: 0 }, (err) => {
    expect(fastify.server.address().address).toBe('::1')
    expect(err).toBeFalsy()
    testDone()
  })
})

test.skipIf(isIPv6Missing)('onListen non-localhost sync with callback should log errors as warnings and continue', (testDone) => {
  expect.assertions(8)

  const stream = split(JSON.parse)
  const fastify = Fastify({
    forceCloseConnections: false,
    logger: {
      stream,
      level: 'info'
    }
  })
  onTestFinished(() => fastify.close())

  stream.on('data', message => {
    if (message.msg.includes('FAIL ON LISTEN')) {
      expect('Logged Error Message').toBeTruthy()
    }
  })

  let order = 0

  fastify.addHook('onListen', function (done) {
    expect(++order).toBe(1)
    expect('1st called in root').toBeTruthy()
    done()
  })

  fastify.addHook('onListen', function () {
    expect(++order).toBe(2)
    throw new Error('FAIL ON LISTEN')
  })

  fastify.addHook('onListen', function (done) {
    expect(++order).toBe(3)
    expect('3rd called in root').toBeTruthy()
    done()
  })

  fastify.listen({ host: '::1', port: 0 }, (err) => {
    expect(err).toBeFalsy()
    expect(fastify.server.address().address).toBe('::1')
    testDone()
  })
})

test.skipIf(isIPv6Missing)('onListen non-localhost async with callback should log errors as warnings and continue', (testDone) => {
  expect.assertions(8)

  const stream = split(JSON.parse)
  const fastify = Fastify({
    forceCloseConnections: false,
    logger: {
      stream,
      level: 'info'
    }
  })
  onTestFinished(() => fastify.close())

  stream.on('data', message => {
    if (message.msg.includes('FAIL ON LISTEN')) {
      expect('Logged Error Message').toBeTruthy()
    }
  })

  let order = 0

  fastify.addHook('onListen', async function () {
    expect(++order).toBe(1)
    expect('1st called in root').toBeTruthy()
  })

  fastify.addHook('onListen', async function () {
    expect(++order).toBe(2)
    throw new Error('FAIL ON LISTEN')
  })

  fastify.addHook('onListen', async function () {
    expect(++order).toBe(3)
    expect('3rd called in root').toBeTruthy()
  })

  fastify.listen({ host: '::1', port: 0 }, (err) => {
    expect(err).toBeFalsy()
    expect(fastify.server.address().address).toBe('::1')
    testDone()
  })
})

test.skipIf(isIPv6Missing)('Register onListen hook non-localhost with callback after a plugin inside a plugin', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('onListen', function (done) {
      expect('called').toBeTruthy()
      done()
    })
    done()
  }))

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('onListen', function (done) {
      expect('called').toBeTruthy()
      done()
    })

    instance.addHook('onListen', function (done) {
      expect('called').toBeTruthy()
      done()
    })

    done()
  }))

  fastify.listen({ host: '::1', port: 0 }, (err) => {
    expect(fastify.server.address().address).toBe('::1')
    expect(err).toBeFalsy()
    testDone()
  })
})

test.skipIf(isIPv6Missing)('onListen non-localhost with callback encapsulation should be called in order', (testDone) => {
  expect.assertions(8)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  let order = 0

  fastify.addHook('onListen', function (done) {
    expect(++order).toBe(1)
    expect(this.pluginName).toBe(fastify.pluginName)
    done()
  })

  fastify.register(async (childOne, o) => {
    childOne.addHook('onListen', function (done) {
      expect(++order).toBe(2)
      expect(this.pluginName).toBe(childOne.pluginName)
      done()
    })
    childOne.register(async (childTwo, o) => {
      childTwo.addHook('onListen', async function () {
        expect(++order).toBe(3)
        expect(this.pluginName).toBe(childTwo.pluginName)
      })
    })
  })
  fastify.listen({ host: '::1', port: 0 }, (err) => {
    expect(fastify.server.address().address).toBe('::1')
    expect(err).toBeFalsy()
    testDone()
  })
})

test('onListen sync should work if user does not pass done', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  let order = 0

  fastify.addHook('onListen', function () {
    expect(++order).toBe(1)
  })

  fastify.addHook('onListen', function () {
    expect(++order).toBe(2)
  })

  fastify.listen({
    host: 'localhost',
    port: 0
  }, testDone)
})

test('async onListen does not need to be awaited', (testDone) => {
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  let order = 0

  fastify.addHook('onListen', async function () {
    expect(++order).toBe(1)
  })

  fastify.addHook('onListen', async function () {
    expect(++order).toBe(2)
    t.end()
  })

  fastify.listen({
    host: 'localhost',
    port: 0
  }, testDone)
})

test('onListen hooks do not block /1', (testDone) => {
  expect.assertions(2)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.addHook('onListen', function (done) {
    expect(fastify[kState].listening).toBe(true)
    done()
  })

  fastify.listen({
    host: 'localhost',
    port: 0
  }, err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('onListen hooks do not block /2', async () => {
  expect.assertions(1)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.addHook('onListen', async function () {
    expect(fastify[kState].listening).toBe(true)
  })

  await fastify.listen({
    host: 'localhost',
    port: 0
  })
})
