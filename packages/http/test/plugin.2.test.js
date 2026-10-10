'use strict'


const Fastify = require('..')
const fp = require('..').plugin

test('check dependencies - should not throw', async () => {
  expect.assertions(11)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.register(fp((i, o, n) => {
      i.decorate('test', () => {})
      expect(i.test).toBeTruthy()
      n()
    }))

    instance.register(fp((i, o, n) => {
      try {
        i.decorate('otherTest', () => {}, ['test'])
        expect(i.test).toBeTruthy()
        expect(i.otherTest).toBeTruthy()
        n()
      } catch (e) {
        expect.fail()
      }
    }))

    instance.get('/', (req, reply) => {
      expect(instance.test).toBeTruthy()
      expect(instance.otherTest).toBeTruthy()
      reply.send({ hello: 'world' })
    })

    done()
  })

  fastify.ready(() => {
    expect(fastify.test).toBeFalsy()
    expect(fastify.otherTest).toBeFalsy()
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => { fastify.close() })

  const result = await fetch(fastifyServer)
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  const body = await result.text()
  expect(result.headers.get('content-length')).toBe('' + body.length)
  expect(JSON.parse(body)).toEqual({ hello: 'world' })
})

test('check dependencies - should throw', async () => {
  expect.assertions(11)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.register(fp((i, o, n) => {
      try {
        i.decorate('otherTest', () => {}, ['test'])
        expect.fail()
      } catch (e) {
        expect(e.code).toBe('XUFA_ERR_DEC_MISSING_DEPENDENCY')
        expect(e.message).toBe('The decorator is missing dependency \'test\'.')
      }
      n()
    }))

    instance.register(fp((i, o, n) => {
      i.decorate('test', () => {})
      expect(i.test).toBeTruthy()
      expect(i.otherTest).toBeFalsy()
      n()
    }))

    instance.get('/', (req, reply) => {
      expect(instance.test).toBeTruthy()
      expect(instance.otherTest).toBeFalsy()
      reply.send({ hello: 'world' })
    })

    done()
  })

  fastify.ready(() => {
    expect(fastify.test).toBeFalsy()
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => { fastify.close() })

  const result = await fetch(fastifyServer)
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  const body = await result.text()
  expect(result.headers.get('content-length')).toBe('' + body.length)
  expect(JSON.parse(body)).toEqual({ hello: 'world' })
})

test('set the plugin name based on the plugin displayName symbol', (testDone) => {
  expect.assertions(6)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.register(fp((fastify, opts, done) => {
    expect(fastify.pluginName).toBe('xufa -> plugin-A')
    fastify.register(fp((fastify, opts, done) => {
      expect(fastify.pluginName).toBe('xufa -> plugin-A -> plugin-AB')
      done()
    }, { name: 'plugin-AB' }))
    fastify.register(fp((fastify, opts, done) => {
      expect(fastify.pluginName).toBe('xufa -> plugin-A -> plugin-AB -> plugin-AC')
      done()
    }, { name: 'plugin-AC' }))
    done()
  }, { name: 'plugin-A' }))

  fastify.register(fp((fastify, opts, done) => {
    expect(fastify.pluginName).toBe('xufa -> plugin-A -> plugin-AB -> plugin-AC -> plugin-B')
    done()
  }, { name: 'plugin-B' }))

  expect(fastify.pluginName).toBe('xufa')

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('plugin name will change when using no encapsulation', (testDone) => {
  expect.assertions(6)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.register(fp((fastify, opts, done) => {
    // store it in a different variable will hold the correct name
    const pluginName = fastify.pluginName
    fastify.register(fp((fastify, opts, done) => {
      expect(fastify.pluginName).toBe('xufa -> plugin-A -> plugin-AB')
      done()
    }, { name: 'plugin-AB' }))
    fastify.register(fp((fastify, opts, done) => {
      expect(fastify.pluginName).toBe('xufa -> plugin-A -> plugin-AB -> plugin-AC')
      done()
    }, { name: 'plugin-AC' }))
    setImmediate(() => {
      // normally we would expect the name plugin-A
      // but we operate on the same instance in each plugin
      expect(fastify.pluginName).toBe('xufa -> plugin-A -> plugin-AB -> plugin-AC')
      expect(pluginName).toBe('xufa -> plugin-A')
    })
    done()
  }, { name: 'plugin-A' }))

  expect(fastify.pluginName).toBe('xufa')

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('plugin name is undefined when accessing in no plugin context', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  expect(fastify.pluginName).toBe('xufa')

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('set the plugin name based on the plugin function name', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.register(function myPluginA (fastify, opts, done) {
    expect(fastify.pluginName).toBe('myPluginA')
    fastify.register(function myPluginAB (fastify, opts, done) {
      expect(fastify.pluginName).toBe('myPluginAB')
      done()
    })
    setImmediate(() => {
      // exact name due to encapsulation
      expect(fastify.pluginName).toBe('myPluginA')
    })
    done()
  })

  fastify.register(function myPluginB (fastify, opts, done) {
    expect(fastify.pluginName).toBe('myPluginB')
    done()
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('approximate a plugin name when no meta data is available', (testDone) => {
  expect.assertions(7)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.register((fastify, opts, done) => {
    // A
    expect(fastify.pluginName.startsWith('(fastify, opts, done)')).toBe(true)
    expect(fastify.pluginName.includes('// A')).toBe(true)
    fastify.register((fastify, opts, done) => {
      // B
      expect(fastify.pluginName.startsWith('(fastify, opts, done)')).toBe(true)
      expect(fastify.pluginName.includes('// B')).toBe(true)
      done()
    })
    setImmediate(() => {
      expect(fastify.pluginName.startsWith('(fastify, opts, done)')).toBe(true)
      expect(fastify.pluginName.includes('// A')).toBe(true)
    })
    done()
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('approximate a plugin name also when fastify-plugin has no meta data', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  // plugin name is got from current file name
  const pluginName = /plugin\.2\.test/
  const pluginNameWithFunction = /plugin\.2\.test-auto-\d+ -> B/

  fastify.register(fp((fastify, opts, done) => {
    expect(fastify.pluginName).toMatch(pluginName)
    fastify.register(fp(function B (fastify, opts, done) {
      // function has name
      expect(fastify.pluginName).toMatch(pluginNameWithFunction)
      done()
    }))
    setImmediate(() => {
      expect(fastify.pluginName).toMatch(pluginNameWithFunction)
    })
    done()
  }))

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('plugin encapsulation', async () => {
  expect.assertions(9)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.register((instance, opts, done) => {
    instance.register(fp((i, o, n) => {
      i.decorate('test', 'first')
      n()
    }))

    instance.get('/first', (req, reply) => {
      reply.send({ plugin: instance.test })
    })

    done()
  })

  fastify.register((instance, opts, done) => {
    instance.register(fp((i, o, n) => {
      i.decorate('test', 'second')
      n()
    }))

    instance.get('/second', (req, reply) => {
      reply.send({ plugin: instance.test })
    })

    done()
  })

  fastify.ready(() => {
    expect(fastify.test).toBeFalsy()
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => { fastify.close() })

  const result1 = await fetch(fastifyServer + '/first')
  expect(result1.ok).toBeTruthy()
  expect(result1.status).toBe(200)
  const body1 = await result1.text()
  expect(result1.headers.get('content-length')).toBe('' + body1.length)
  expect(JSON.parse(body1)).toEqual({ plugin: 'first' })

  const result2 = await fetch(fastifyServer + '/second')
  expect(result2.ok).toBeTruthy()
  expect(result2.status).toBe(200)
  const body2 = await result2.text()
  expect(result2.headers.get('content-length')).toBe('' + body2.length)
  expect(JSON.parse(body2)).toEqual({ plugin: 'second' })
})
