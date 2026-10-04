'use strict'

const { kRouteContext } = require('../lib/symbols')
const fastify = require('..')

test('handlers receive correct `this` context', async () => {
  expect.assertions(4)

  // simulate plugin that uses fastify-plugin
  const plugin = function (instance, opts, done) {
    instance.decorate('foo', 'foo')
    done()
  }
  plugin[Symbol.for('skip-override')] = true

  const instance = fastify()
  instance.register(plugin)

  instance.get('/', function (req, reply) {
    expect(this.foo).toBeTruthy()
    expect(this.foo).toBe('foo')
    reply.send()
  })

  await instance.inject('/')

  expect(instance.foo).toBeTruthy()
  expect(instance.foo).toBe('foo')
})

test('handlers have access to the internal context', async () => {
  expect.assertions(5)

  const instance = fastify()
  instance.get('/', { config: { foo: 'bar' } }, function (req, reply) {
    expect(reply[kRouteContext]).toBeTruthy()
    expect(reply[kRouteContext].config).toBeTruthy()
    expect(typeof reply[kRouteContext].config).toBeTruthy()
    expect(reply[kRouteContext].config.foo).toBeTruthy()
    expect(reply[kRouteContext].config.foo).toBe('bar')
    reply.send()
  })

  await instance.inject('/')
})
