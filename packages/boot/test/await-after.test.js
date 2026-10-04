'use strict'


const boot = require('..')
const { setTimeout: sleep } = require('node:timers/promises')
const fs = require('node:fs/promises')
const path = require('node:path')

test('await after - nested plugins with same tick callbacks', async () => {
  const app = {}
  boot(app)

  let secondLoaded = false

  app.use(async (app) => {
    expect('plugin init').toBeTruthy()
    app.use(async () => {
      expect('plugin2 init').toBeTruthy()
      await sleep(1)
      secondLoaded = true
    })
  })
  await app.after()
  expect('reachable').toBeTruthy()
  expect(secondLoaded).toBeTruthy()

  await app.ready()
  expect('reachable').toBeTruthy()
})

test('await after without server', async () => {
  const app = boot()

  let secondLoaded = false

  app.use(async (app) => {
    expect('plugin init').toBeTruthy()
    app.use(async () => {
      expect('plugin2 init').toBeTruthy()
      await sleep(1)
      secondLoaded = true
    })
  })
  await app.after()
  expect('reachable').toBeTruthy()
  expect(secondLoaded).toBeTruthy()

  await app.ready()
  expect('reachable').toBeTruthy()
})

test('await after with cb functions', async () => {
  const app = boot()
  let secondLoaded = false
  let record = ''

  app.use(async (app) => {
    expect('plugin init').toBeTruthy()
    record += 'plugin|'
    app.use(async () => {
      expect('plugin2 init').toBeTruthy()
      record += 'plugin2|'
      await sleep(1)
      secondLoaded = true
    })
  })
  await app.after(() => {
    record += 'after|'
  })
  expect('reachable').toBeTruthy()
  expect(secondLoaded).toBeTruthy()
  record += 'ready'
  await app.ready()
  expect('reachable').toBeTruthy()
  expect(record).toBe('plugin|plugin2|after|ready')
})

test('await after - nested plugins with future tick callbacks', async () => {
  const app = {}
  boot(app)

  expect.assertions(4)

  app.use((f, opts, cb) => {
    expect('plugin init').toBeTruthy()
    app.use((f, opts, cb) => {
      expect('plugin2 init').toBeTruthy()
      setImmediate(cb)
    })
    setImmediate(cb)
  })
  await app.after()
  expect('reachable').toBeTruthy()

  await app.ready()
  expect('reachable').toBeTruthy()
})

test('await after - nested async function plugins', async () => {
  const app = {}
  boot(app)

  expect.assertions(5)

  app.use(async (f, opts) => {
    expect('plugin init').toBeTruthy()
    await app.use(async (f, opts) => {
      expect('plugin2 init').toBeTruthy()
    })
    expect('reachable').toBeTruthy()
  })
  await app.after()
  expect('reachable').toBeTruthy()

  await app.ready()
  expect('reachable').toBeTruthy()
})

test('await after - promise resolves to undefined', async () => {
  const app = {}
  boot(app)

  expect.assertions(4)

  app.use(async (f, opts, cb) => {
    app.use((f, opts, cb) => {
      expect('plugin init').toBeTruthy()
      cb()
    })
    const instance = await app.after()
    expect(instance).toBe(undefined)
  })
  expect('reachable').toBeTruthy()

  await app.ready()
  expect('reachable').toBeTruthy()
})

test('await after - promise returning function plugins + promise chaining', async () => {
  const app = {}
  boot(app)

  expect.assertions(6)

  app.use((f, opts) => {
    expect('plugin init').toBeTruthy()
    return app.use((f, opts) => {
      expect('plugin2 init').toBeTruthy()
      return Promise.resolve()
    }).then((f2) => {
      expect(f2).toEqual(f)
      return 'test'
    }).then((val) => {
      expect(val).toBe('test')
    })
  })
  await app.after()
  expect('reachable').toBeTruthy()

  await app.ready()
  expect('reachable').toBeTruthy()
})

test('await after - error handling, async throw', async () => {
  const app = {}
  boot(app)

  expect.assertions(2)

  const e = new Error('kaboom')

  app.use(async (f, opts) => {
    throw Error('kaboom')
  })

  await expect(app.after()).rejects.toThrow(e)

  await expect((() => app.ready())()).rejects.toThrow(Error('kaboom'))
})

test('await after - error handling, async throw, nested', async () => {
  const app = {}
  boot(app)

  expect.assertions(2)

  const e = new Error('kaboom')

  app.use(async (f, opts) => {
    app.use(async (f, opts) => {
      throw e
    })
  })

  await expect(app.after()).rejects.toThrow()
  await expect((() => app.ready())()).rejects.toThrow(e)
})

test('await after - error handling, same tick cb err', async () => {
  const app = {}
  boot(app)

  expect.assertions(2)

  app.use((f, opts, cb) => {
    cb(Error('kaboom'))
  })
  await expect(app.after()).rejects.toThrow()
  await expect(app.ready()).rejects.toThrow(Error('kaboom'))
})

test('await after - error handling, same tick cb err, nested', async () => {
  const app = {}
  boot(app)

  expect.assertions(2)

  app.use((f, opts, cb) => {
    app.use((f, opts, cb) => {
      cb(Error('kaboom'))
    })
    cb()
  })

  await expect(app.after()).rejects.toThrow()
  await expect(app.ready()).rejects.toThrow(Error('kaboom'))
})

test('await after - error handling, future tick cb err', async () => {
  const app = {}
  boot(app)

  expect.assertions(2)

  app.use((f, opts, cb) => {
    setImmediate(() => { cb(Error('kaboom')) })
  })

  await expect(app.after()).rejects.toThrow()
  await expect(app.ready()).rejects.toThrow(Error('kaboom'))
})

test('await after - error handling, future tick cb err, nested', async () => {
  const app = {}
  boot(app)

  expect.assertions(2)

  app.use((f, opts, cb) => {
    app.use((f, opts, cb) => {
      setImmediate(() => { cb(Error('kaboom')) })
    })
    cb()
  })
  await expect(app.after()).rejects.toThrow(Error('kaboom'))
  await expect(app.ready()).rejects.toThrow(Error('kaboom'))
})

test('await after complex scenario', async () => {
  const app = {}
  boot(app)
  expect.assertions(16)

  let firstLoaded = false
  let secondLoaded = false
  let thirdLoaded = false
  let fourthLoaded = false

  app.use(first)
  await app.after()
  expect(firstLoaded).toBeTruthy()
  expect(secondLoaded).toBe(false)
  expect(thirdLoaded).toBe(false)
  expect(fourthLoaded).toBe(false)
  app.use(second)
  expect(firstLoaded).toBeTruthy()
  expect(secondLoaded).toBe(false)
  expect(thirdLoaded).toBe(false)
  expect(fourthLoaded).toBe(false)
  app.use(third)
  await app.after()
  expect(firstLoaded).toBeTruthy()
  expect(secondLoaded).toBeTruthy()
  expect(thirdLoaded).toBeTruthy()
  expect(fourthLoaded).toBeTruthy()
  await app.ready()
  expect(firstLoaded).toBeTruthy()
  expect(secondLoaded).toBeTruthy()
  expect(thirdLoaded).toBeTruthy()
  expect(fourthLoaded).toBeTruthy()

  async function first () {
    firstLoaded = true
  }

  async function second () {
    secondLoaded = true
  }

  async function third (app) {
    thirdLoaded = true
    app.use(fourth)
  }

  async function fourth () {
    fourthLoaded = true
  }
})

test('without autostart and sync/async plugin mix', async () => {
  const app = {}
  boot(app, { autostart: false })
  expect.assertions(21)

  let firstLoaded = false
  let secondLoaded = false
  let thirdLoaded = false
  let fourthLoaded = false

  app.use(first)
  await app.after()
  expect(firstLoaded).toBeTruthy()
  expect(secondLoaded).toBe(false)
  expect(thirdLoaded).toBe(false)
  expect(fourthLoaded).toBe(false)

  app.use(second)
  await app.after()
  expect(firstLoaded).toBeTruthy()
  expect(secondLoaded).toBeTruthy()
  expect(thirdLoaded).toBe(false)
  expect(fourthLoaded).toBe(false)

  await sleep(10)

  app.use(third)
  await app.after()
  expect(firstLoaded).toBeTruthy()
  expect(secondLoaded).toBeTruthy()
  expect(thirdLoaded).toBeTruthy()
  expect(fourthLoaded).toBe(false)

  app.use(fourth)
  expect(firstLoaded).toBeTruthy()
  expect(secondLoaded).toBeTruthy()
  expect(thirdLoaded).toBeTruthy()
  expect(fourthLoaded).toBe(false)

  await app.after()
  expect(firstLoaded).toBeTruthy()
  expect(secondLoaded).toBeTruthy()
  expect(thirdLoaded).toBeTruthy()
  expect(fourthLoaded).toBeTruthy()

  await app.ready()

  async function first () {
    firstLoaded = true
  }

  async function second () {
    const contents = await fs.readFile(path.join(__dirname, 'fixtures', 'dummy.txt'), 'utf-8')
    expect(contents).toBe('hello, world!')
    secondLoaded = true
  }

  async function third () {
    await sleep(10)
    thirdLoaded = true
  }

  function fourth (server, opts, done) {
    fourthLoaded = true
    done()
  }
})

test('without autostart', async () => {
  const app = {}
  boot(app, { autostart: false })
  let firstLoaded = false
  let secondLoaded = false
  let thirdLoaded = false

  app.use(async function first (app) {
    firstLoaded = true
    app.use(async () => {
      await sleep(1)
      secondLoaded = true
    })
  })

  await app.after()
  expect(firstLoaded).toBeTruthy()
  expect(secondLoaded).toBeTruthy()

  await app.use(async () => {
    thirdLoaded = true
  })

  expect(thirdLoaded).toBeTruthy()

  await app.ready()
})

test('without autostart and with override', async () => {
  const app = {}
  const _ = boot(app, { autostart: false })
  let count = 0

  _.override = function (s) {
    const res = Object.create(s)
    res.count = ++count

    return res
  }

  app.use(async function first (app) {
    expect(app.count).toBe(1)
    app.use(async (app) => {
      expect(app.count).toBe(2)
      await app.after()
    })
  })

  await app.after()

  await app.use(async (app) => {
    expect(app.count).toBe(3)
  })

  await app.ready()
})

test('stop processing after errors', async () => {
  expect.assertions(2)

  const app = boot()

  try {
    await app.use(async function first (app) {
      expect('first should be loaded').toBeTruthy()
      throw new Error('kaboom')
    })
  } catch (e) {
    expect(e.message).toBe('kaboom')
  }
})
