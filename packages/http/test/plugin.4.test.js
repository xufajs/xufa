'use strict'


const Fastify = require('@xufa/http')
const fp = require('@xufa/http').plugin
const { XUFA_ERR_PLUGIN_INVALID_ASYNC_HANDLER } = require('../lib/errors')

test('pluginTimeout', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify({
    pluginTimeout: 10
  })
  fastify.register(function (app, opts, done) {
    // to no call done on purpose
  })
  fastify.ready((err) => {
    expect(err).toBeTruthy()
    expect(err.message).toBe("xufa-plugin: Plugin did not start in time: 'function (app, opts, done) { -- // to no call done on purpose'. You may have forgotten to call 'done' function or to resolve a Promise")
    expect(err.code).toBe('XUFA_ERR_PLUGIN_TIMEOUT')
    expect(err.cause).toBeTruthy()
    expect(err.cause.code).toBe('BOOT_ERR_PLUGIN_EXEC_TIMEOUT')
    testDone()
  })
})

test('pluginTimeout - named function', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify({
    pluginTimeout: 10
  })
  fastify.register(function nameFunction (app, opts, done) {
    // to no call done on purpose
  })
  fastify.ready((err) => {
    expect(err).toBeTruthy()
    expect(err.message).toBe("xufa-plugin: Plugin did not start in time: 'nameFunction'. You may have forgotten to call 'done' function or to resolve a Promise")
    expect(err.code).toBe('XUFA_ERR_PLUGIN_TIMEOUT')
    expect(err.cause).toBeTruthy()
    expect(err.cause.code).toBe('BOOT_ERR_PLUGIN_EXEC_TIMEOUT')
    testDone()
  })
})

test('pluginTimeout default', (testDone) => {
  expect.assertions(5)
  vi.useFakeTimers()

  const fastify = Fastify()
  fastify.register(function (app, opts, done) {
    // default time elapsed without calling done
    vi.advanceTimersByTime(10000)
  })

  fastify.ready((err) => {
    expect(err).toBeTruthy()
    expect(err.message).toBe("xufa-plugin: Plugin did not start in time: 'function (app, opts, done) { -- // default time elapsed without calling done'. You may have forgotten to call 'done' function or to resolve a Promise")
    expect(err.code).toBe('XUFA_ERR_PLUGIN_TIMEOUT')
    expect(err.cause).toBeTruthy()
    expect(err.cause.code).toBe('BOOT_ERR_PLUGIN_EXEC_TIMEOUT')
    testDone()
  })

  onTestFinished(() => vi.useRealTimers())
})

test('plugin metadata - version', (testDone) => {
  expect.assertions(1)
  const fastify = Fastify()

  plugin[Symbol.for('skip-override')] = true
  plugin[Symbol.for('plugin-meta')] = {
    name: 'plugin',
    xufa: '2.0.0'
  }

  fastify.register(plugin)

  fastify.ready(() => {
    expect('everything right').toBeTruthy()
    testDone()
  })

  function plugin (instance, opts, done) {
    done()
  }
})

test('plugin metadata - version range', (testDone) => {
  expect.assertions(1)
  const fastify = Fastify()

  plugin[Symbol.for('skip-override')] = true
  plugin[Symbol.for('plugin-meta')] = {
    name: 'plugin',
    xufa: '>=2.0.0'
  }

  fastify.register(plugin)

  fastify.ready(() => {
    expect('everything right').toBeTruthy()
    testDone()
  })

  function plugin (instance, opts, done) {
    done()
  }
})

test('plugin metadata - version not matching requirement', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify()

  plugin[Symbol.for('skip-override')] = true
  plugin[Symbol.for('plugin-meta')] = {
    name: 'plugin',
    xufa: '99.0.0'
  }

  fastify.register(plugin)

  fastify.ready((err) => {
    expect(err).toBeTruthy()
    expect(err.code).toBe('XUFA_ERR_PLUGIN_VERSION_MISMATCH')
    testDone()
  })

  function plugin (instance, opts, done) {
    done()
  }
})

test('plugin metadata - version not matching requirement 2', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify()
  Object.defineProperty(fastify, 'version', {
    value: '99.0.0'
  })

  plugin[Symbol.for('skip-override')] = true
  plugin[Symbol.for('plugin-meta')] = {
    name: 'plugin',
    xufa: '<=3.0.0'
  }

  fastify.register(plugin)

  fastify.ready((err) => {
    expect(err).toBeTruthy()
    expect(err.code).toBe('XUFA_ERR_PLUGIN_VERSION_MISMATCH')
    testDone()
  })

  function plugin (instance, opts, done) {
    done()
  }
})

test('plugin metadata - version not matching requirement 3', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify()

  plugin[Symbol.for('skip-override')] = true
  plugin[Symbol.for('plugin-meta')] = {
    name: 'plugin',
    xufa: '>=99.0.0'
  }

  fastify.register(plugin)

  fastify.ready((err) => {
    expect(err).toBeTruthy()
    expect(err.code).toBe('XUFA_ERR_PLUGIN_VERSION_MISMATCH')
    testDone()
  })

  function plugin (instance, opts, done) {
    done()
  }
})

test('plugin metadata - release candidate', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify()
  Object.defineProperty(fastify, 'version', {
    value: '99.0.0-rc.1'
  })

  plugin[Symbol.for('plugin-meta')] = {
    name: 'plugin',
    xufa: '99.x'
  }

  fastify.register(plugin)

  fastify.ready((err) => {
    expect(err).toBeFalsy()
    expect('everything right').toBeTruthy()
    testDone()
  })

  function plugin (instance, opts, done) {
    done()
  }
})

describe('fastify-rc loads prior version plugins', () => {
test('baseline (rc)', (testDone) => {
    expect.assertions(1)

    const fastify = Fastify()
    Object.defineProperty(fastify, 'version', {
      value: '99.0.0-rc.1'
    })

    plugin[Symbol.for('plugin-meta')] = {
      name: 'plugin',
      xufa: '^98.1.0'
    }
    plugin2[Symbol.for('plugin-meta')] = {
      name: 'plugin2',
      xufa: '98.x'
    }

    fastify.register(plugin)

    fastify.ready((err) => {
      expect(err).toBeFalsy()
      testDone()
    })

    function plugin (instance, opts, done) {
      done()
    }

    function plugin2 (instance, opts, done) {
      done()
    }
  })
test('pre', (testDone) => {
    expect.assertions(1)

    const fastify = Fastify()
    Object.defineProperty(fastify, 'version', { value: '99.0.0-pre.1' })

    plugin[Symbol.for('plugin-meta')] = { name: 'plugin', xufa: '^98.x' }

    fastify.register(plugin)

    fastify.ready((err) => {
      expect(err).toBeFalsy()
      testDone()
    })

    function plugin (instance, opts, done) { done() }
  })
test('alpha', (testDone) => {
    expect.assertions(1)

    const fastify = Fastify()
    Object.defineProperty(fastify, 'version', { value: '99.0.0-pre.1' })

    plugin[Symbol.for('plugin-meta')] = { name: 'plugin', xufa: '^98.x' }

    fastify.register(plugin)

    fastify.ready((err) => {
      expect(err).toBeFalsy()
      testDone()
    })

    function plugin (instance, opts, done) { done() }
  })
})

test('hasPlugin method exists as a function', () => {
  const fastify = Fastify()
  expect(typeof fastify.hasPlugin).toBe('function')
})

test('hasPlugin returns true if the specified plugin has been registered', async () => {
  expect.assertions(4)

  const fastify = Fastify()

  function pluginA (fastify, opts, done) {
    expect(fastify.hasPlugin('plugin-A')).toBeTruthy()
    done()
  }
  pluginA[Symbol.for('fastify.display-name')] = 'plugin-A'
  fastify.register(pluginA)

  fastify.register(function pluginB (fastify, opts, done) {
    expect(fastify.hasPlugin('pluginB')).toBeTruthy()
    done()
  })

  fastify.register(function (fastify, opts, done) {
    // one line
    expect(fastify.hasPlugin('function (fastify, opts, done) { -- // one line')).toBeTruthy()
    done()
  })

  await fastify.ready()

  expect(fastify.hasPlugin('xufa')).toBeTruthy()
})

test('hasPlugin returns false if the specified plugin has not been registered', () => {
  const fastify = Fastify()
  expect(fastify.hasPlugin('pluginFoo')).toBeFalsy()
})

test('hasPlugin returns false when using encapsulation', async () => {
  expect.assertions(25)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.register(function pluginA (fastify, opts, done) {
    expect(fastify.hasPlugin('pluginA')).toBeTruthy()
    expect(fastify.hasPlugin('pluginAA')).toBeFalsy()
    expect(fastify.hasPlugin('pluginAAA')).toBeFalsy()
    expect(fastify.hasPlugin('pluginAB')).toBeFalsy()
    expect(fastify.hasPlugin('pluginB')).toBeFalsy()

    fastify.register(function pluginAA (fastify, opts, done) {
      expect(fastify.hasPlugin('pluginA')).toBeFalsy()
      expect(fastify.hasPlugin('pluginAA')).toBeTruthy()
      expect(fastify.hasPlugin('pluginAAA')).toBeFalsy()
      expect(fastify.hasPlugin('pluginAB')).toBeFalsy()
      expect(fastify.hasPlugin('pluginB')).toBeFalsy()

      fastify.register(function pluginAAA (fastify, opts, done) {
        expect(fastify.hasPlugin('pluginA')).toBeFalsy()
        expect(fastify.hasPlugin('pluginAA')).toBeFalsy()
        expect(fastify.hasPlugin('pluginAAA')).toBeTruthy()
        expect(fastify.hasPlugin('pluginAB')).toBeFalsy()
        expect(fastify.hasPlugin('pluginB')).toBeFalsy()

        done()
      })

      done()
    })

    fastify.register(function pluginAB (fastify, opts, done) {
      expect(fastify.hasPlugin('pluginA')).toBeFalsy()
      expect(fastify.hasPlugin('pluginAA')).toBeFalsy()
      expect(fastify.hasPlugin('pluginAAA')).toBeFalsy()
      expect(fastify.hasPlugin('pluginAB')).toBeTruthy()
      expect(fastify.hasPlugin('pluginB')).toBeFalsy()

      done()
    })

    done()
  })

  fastify.register(function pluginB (fastify, opts, done) {
    expect(fastify.hasPlugin('pluginA')).toBeFalsy()
    expect(fastify.hasPlugin('pluginAA')).toBeFalsy()
    expect(fastify.hasPlugin('pluginAAA')).toBeFalsy()
    expect(fastify.hasPlugin('pluginAB')).toBeFalsy()
    expect(fastify.hasPlugin('pluginB')).toBeTruthy()

    done()
  })

  await fastify.ready()
})

test('hasPlugin returns true when using no encapsulation', async () => {
  expect.assertions(26)

  const fastify = Fastify()

  fastify.register(fp((fastify, opts, done) => {
    expect(fastify.pluginName).toBe('xufa -> plugin-AA')
    expect(fastify.hasPlugin('plugin-AA')).toBeTruthy()
    expect(fastify.hasPlugin('plugin-A')).toBeFalsy()
    expect(fastify.hasPlugin('plugin-AAA')).toBeFalsy()
    expect(fastify.hasPlugin('plugin-AB')).toBeFalsy()
    expect(fastify.hasPlugin('plugin-B')).toBeFalsy()

    fastify.register(fp((fastify, opts, done) => {
      expect(fastify.hasPlugin('plugin-AA')).toBeTruthy()
      expect(fastify.hasPlugin('plugin-A')).toBeTruthy()
      expect(fastify.hasPlugin('plugin-AAA')).toBeFalsy()
      expect(fastify.hasPlugin('plugin-AB')).toBeFalsy()
      expect(fastify.hasPlugin('plugin-B')).toBeFalsy()

      fastify.register(fp((fastify, opts, done) => {
        expect(fastify.hasPlugin('plugin-AA')).toBeTruthy()
        expect(fastify.hasPlugin('plugin-A')).toBeTruthy()
        expect(fastify.hasPlugin('plugin-AAA')).toBeTruthy()
        expect(fastify.hasPlugin('plugin-AB')).toBeFalsy()
        expect(fastify.hasPlugin('plugin-B')).toBeFalsy()

        done()
      }, { name: 'plugin-AAA' }))

      done()
    }, { name: 'plugin-A' }))

    fastify.register(fp((fastify, opts, done) => {
      expect(fastify.hasPlugin('plugin-AA')).toBeTruthy()
      expect(fastify.hasPlugin('plugin-A')).toBeTruthy()
      expect(fastify.hasPlugin('plugin-AAA')).toBeTruthy()
      expect(fastify.hasPlugin('plugin-AB')).toBeTruthy()
      expect(fastify.hasPlugin('plugin-B')).toBeFalsy()

      done()
    }, { name: 'plugin-AB' }))

    done()
  }, { name: 'plugin-AA' }))

  fastify.register(fp((fastify, opts, done) => {
    expect(fastify.hasPlugin('plugin-AA')).toBeTruthy()
    expect(fastify.hasPlugin('plugin-A')).toBeTruthy()
    expect(fastify.hasPlugin('plugin-AAA')).toBeTruthy()
    expect(fastify.hasPlugin('plugin-AB')).toBeTruthy()
    expect(fastify.hasPlugin('plugin-B')).toBeTruthy()

    done()
  }, { name: 'plugin-B' }))

  await fastify.ready()
})

test('hasPlugin returns true when using encapsulation', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  const pluginCallback = function (server, options, done) {
    done()
  }
  const pluginName = 'awesome-plugin'
  const plugin = fp(pluginCallback, { name: pluginName })

  fastify.register(plugin)

  fastify.register(async (server) => {
    expect(server.hasPlugin(pluginName)).toBeTruthy()
  })

  fastify.register(async function foo (server) {
    server.register(async function bar (server) {
      expect(server.hasPlugin(pluginName)).toBeTruthy()
    })
  })

  await fastify.ready()
})

test('registering anonymous plugin with mixed style should throw', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  const anonymousPlugin = async (app, opts, done) => {
    done()
  }

  fastify.register(anonymousPlugin)

  try {
    await fastify.ready()
    expect.fail('should throw')
  } catch (error) {
    expect(error instanceof XUFA_ERR_PLUGIN_INVALID_ASYNC_HANDLER).toBeTruthy()
    expect(error.message).toBe('The anonymousPlugin plugin being registered mixes async and callback styles. Async plugin should not mix async and callback style.')
  }
})

test('registering named plugin with mixed style should throw', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  const pluginName = 'error-plugin'
  const errorPlugin = async (app, opts, done) => {
    done()
  }
  const namedPlugin = fp(errorPlugin, { name: pluginName })

  fastify.register(namedPlugin)

  try {
    await fastify.ready()
    expect.fail('should throw')
  } catch (error) {
    expect(error instanceof XUFA_ERR_PLUGIN_INVALID_ASYNC_HANDLER).toBeTruthy()
    expect(error.message).toBe('The error-plugin plugin being registered mixes async and callback styles. Async plugin should not mix async and callback style.')
  }
})
