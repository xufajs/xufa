'use strict'

/* eslint no-prototype-builtins: off */


const boot = require('..')

test('custom inheritance', (testDone) => {
  expect.assertions(3)

  const server = { my: 'server' }
  const app = boot(server)

  app.override = function (s) {
    expect(s).toEqual(server)

    const res = Object.create(s)
    res.b = 42

    return res
  }

  app.use(function first (s, opts, cb) {
    expect(s).not.toEqual(server)
    expect(Object.prototype.isPrototypeOf.call(server, s)).toBeTruthy()
    cb()
    testDone()
  })
})

test('custom inheritance multiple levels', (testDone) => {
  expect.assertions(6)

  const server = { count: 0 }
  const app = boot(server)

  app.override = function (s) {
    const res = Object.create(s)
    res.count = res.count + 1

    return res
  }

  app.use(function first (s1, opts, cb) {
    expect(s1).not.toEqual(server)
    expect(Object.prototype.isPrototypeOf.call(server, s1)).toBeTruthy()
    expect(s1.count).toBe(1)
    s1.use(second)

    cb()

    function second (s2, opts, cb) {
      expect(s2).not.toEqual(s1)
      expect(Object.prototype.isPrototypeOf.call(s1, s2)).toBeTruthy()
      expect(s2.count).toBe(2)
      cb()
      testDone()
    }
  })
})

test('custom inheritance multiple levels twice', (testDone) => {
  expect.assertions(10)

  const server = { count: 0 }
  const app = boot(server)

  app.override = function (s) {
    const res = Object.create(s)
    res.count = res.count + 1

    return res
  }

  app.use(function first (s1, opts, cb) {
    expect(s1).not.toEqual(server)
    expect(Object.prototype.isPrototypeOf.call(server, s1)).toBeTruthy()
    expect(s1.count).toBe(1)
    s1.use(second)
    s1.use(third)
    let prev

    cb()

    function second (s2, opts, cb) {
      prev = s2
      expect(s2).not.toEqual(s1)
      expect(Object.prototype.isPrototypeOf.call(s1, s2)).toBeTruthy()
      expect(s2.count).toBe(2)
      cb()
    }

    function third (s3, opts, cb) {
      expect(s3).not.toEqual(s1)
      expect(Object.prototype.isPrototypeOf.call(s1, s3)).toBeTruthy()
      expect(Object.prototype.isPrototypeOf.call(prev, s3)).toBe(false)
      expect(s3.count).toBe(2)
      cb()
      testDone()
    }
  })
})

test('custom inheritance multiple levels with multiple heads', (testDone) => {
  expect.assertions(13)

  const server = { count: 0 }
  const app = boot(server)

  app.override = function (s) {
    const res = Object.create(s)
    res.count = res.count + 1

    return res
  }

  app.use(function first (s1, opts, cb) {
    expect(s1).not.toEqual(server)
    expect(Object.prototype.isPrototypeOf.call(server, s1)).toBeTruthy()
    expect(s1.count).toBe(1)
    s1.use(second)

    cb()

    function second (s2, opts, cb) {
      expect(s2).not.toEqual(s1)
      expect(Object.prototype.isPrototypeOf.call(s1, s2)).toBeTruthy()
      expect(s2.count).toBe(2)
      cb()
    }
  })

  app.use(function third (s1, opts, cb) {
    expect(s1).not.toEqual(server)
    expect(Object.prototype.isPrototypeOf.call(server, s1)).toBeTruthy()
    expect(s1.count).toBe(1)
    s1.use(fourth)

    cb()

    function fourth (s2, opts, cb) {
      expect(s2).not.toEqual(s1)
      expect(Object.prototype.isPrototypeOf.call(s1, s2)).toBeTruthy()
      expect(s2.count).toBe(2)
      cb()
    }
  })

  app.ready(function () {
    expect(server.count).toBe(0)
    testDone()
  })
})

test('fastify test case', (testDone) => {
  expect.assertions(7)

  const noop = () => {}

  function build () {
    const app = boot(server, {})
    app.override = function (s) {
      return Object.create(s)
    }

    server.add = function (name, fn, cb) {
      if (this[name]) return cb(new Error('already existent'))
      this[name] = fn
      cb()
    }

    return server

    function server (req, res) {}
  }

  const instance = build()
  expect(instance.add).toBeTruthy()
  expect(instance.use).toBeTruthy()

  instance.use((i, opts, cb) => {
    expect(i).not.toEqual(instance)
    expect(Object.prototype.isPrototypeOf.call(instance, i)).toBeTruthy()

    i.add('test', noop, (err) => {
      expect(err).toBeFalsy()
      expect(i.test).toBeTruthy()
      cb()
    })
  })

  instance.ready(() => {
    expect(instance.test).toBe(undefined)
    testDone()
  })
})

test('override should pass also the plugin function', (testDone) => {
  expect.assertions(3)

  const server = { my: 'server' }
  const app = boot(server)

  app.override = function (s, fn) {
    expect(typeof fn).toBe('function')
    expect(fn).toEqual(first)
    return s
  }

  app.use(first)

  function first (s, opts, cb) {
    expect(s).toEqual(server)
    cb()
    testDone()
  }
})

test('skip override - fastify test case', (testDone) => {
  expect.assertions(2)

  const server = { my: 'server' }
  const app = boot(server)

  app.override = function (s, func) {
    if (func[Symbol.for('skip-override')]) {
      return s
    }
    return Object.create(s)
  }

  first[Symbol.for('skip-override')] = true
  app.use(first)

  function first (s, opts, cb) {
    expect(s).toEqual(server)
    expect(Object.prototype.isPrototypeOf.call(server, s)).toBe(false)
    cb()
    testDone()
  }
})

test('override can receive options object', (testDone) => {
  expect.assertions(4)

  const server = { my: 'server' }
  const options = { hello: 'world' }
  const app = boot(server)

  app.override = function (s, fn, opts) {
    expect(s).toEqual(server)
    expect(opts).toEqual(options)

    const res = Object.create(s)
    res.b = 42

    return res
  }

  app.use(function first (s, opts, cb) {
    expect(s).not.toEqual(server)
    expect(Object.prototype.isPrototypeOf.call(server, s)).toBeTruthy()
    cb()
    testDone()
  }, options)
})

test('override can receive options function', (testDone) => {
  expect.assertions(8)

  const server = { my: 'server' }
  const options = { hello: 'world' }
  const app = boot(server)

  app.override = function (s, fn, opts) {
    expect(s).toEqual(server)
    if (typeof opts !== 'function') {
      expect(opts).toEqual(options)
    }

    const res = Object.create(s)
    res.b = 42
    res.bar = 'world'

    return res
  }

  app.use(function first (s, opts, cb) {
    expect(s).not.toEqual(server)
    expect(Object.prototype.isPrototypeOf.call(server, s)).toBeTruthy()
    s.foo = 'bar'
    cb()
  }, options)

  app.use(function second (s, opts, cb) {
    expect(s.foo).toBe(undefined)
    expect(opts).toEqual({ hello: 'world' })
    expect(Object.prototype.isPrototypeOf.call(server, s)).toBeTruthy()
    cb()
    testDone()
  }, p => ({ hello: p.bar }))
})

test('after trigger override', (testDone) => {
  expect.assertions(8)

  const server = { count: 0 }
  const app = boot(server)

  let overrideCalls = 0
  app.override = function (s, fn, opts) {
    overrideCalls++
    const res = Object.create(s)
    res.count = res.count + 1
    return res
  }

  app
    .use(function first (s, opts, cb) {
      expect(s.count).toBe(1)
      cb()
    })
    .after(function () {
      expect(overrideCalls).toBe(1)
    })
    .after(function (err) {
      if (err) throw err
      expect(overrideCalls).toBe(1)
    })
    .after(function (err, done) {
      if (err) throw err
      expect(overrideCalls).toBe(1)
      done()
    })
    .after(function (err, context, done) {
      if (err) throw err
      expect(overrideCalls).toBe(1)
      done()
    })
    .after(async function () {
      expect(overrideCalls).toBe(1)
    })
    .after(async function (err) {
      if (err) throw err
      expect(overrideCalls).toBe(1)
    })
    .after(async function (err, context) {
      if (err) throw err
      expect(overrideCalls).toBe(1)
      testDone()
    })
})

test('custom inheritance override in after', (testDone) => {
  expect.assertions(6)

  const server = { count: 0 }
  const app = boot(server)

  app.override = function (s) {
    const res = Object.create(s)
    res.count = res.count + 1

    return res
  }

  app.use(function first (s1, opts, cb) {
    expect(s1).not.toEqual(server)
    expect(Object.prototype.isPrototypeOf.call(server, s1)).toBeTruthy()
    expect(s1.count).toBe(1)
    s1.after(() => {
      s1.use(second)
    })

    cb()

    function second (s2, opts, cb) {
      expect(s2).not.toEqual(s1)
      expect(Object.prototype.isPrototypeOf.call(s1, s2)).toBeTruthy()
      expect(s2.count).toBe(2)
      cb()
      testDone()
    }
  })
})
