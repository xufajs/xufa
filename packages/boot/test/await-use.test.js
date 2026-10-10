import { setTimeout as sleep } from 'node:timers/promises';
import boot from '../index.js';

test('await use - nested plugins with same tick callbacks', async () => {
  const app = {}
  boot(app)

  expect.assertions(4)

  await app.use((f, opts, cb) => {
    expect('plugin init').toBeTruthy()
    app.use((f, opts, cb) => {
      expect('plugin2 init').toBeTruthy()
      cb()
    })
    cb()
  })
  expect('reachable').toBeTruthy()

  await app.ready()
  expect('reachable').toBeTruthy()
})

test('await use - nested plugins with future tick callbacks', async () => {
  const app = {}
  boot(app)

  expect.assertions(4)

  await app.use((f, opts, cb) => {
    expect('plugin init').toBeTruthy()
    app.use((f, opts, cb) => {
      expect('plugin2 init').toBeTruthy()
      setImmediate(cb)
    })
    setImmediate(cb)
  })
  expect('reachable').toBeTruthy()

  await app.ready()
  expect('reachable').toBeTruthy()
})

test('await use - nested async function plugins', async () => {
  const app = {}
  boot(app)

  expect.assertions(5)

  await app.use(async (f, opts) => {
    expect('plugin init').toBeTruthy()
    await app.use(async (f, opts) => {
      expect('plugin2 init').toBeTruthy()
    })
    expect('reachable').toBeTruthy()
  })
  expect('reachable').toBeTruthy()

  await app.ready()
  expect('reachable').toBeTruthy()
})

test('await use - promise returning function plugins + promise chaining', async () => {
  const app = {}
  boot(app)

  expect.assertions(6)

  await app.use((f, opts) => {
    expect('plugin init').toBeTruthy()
    return app.use((f, opts) => {
      expect('plugin2 init').toBeTruthy()
      return Promise.resolve()
    }).then(() => {
      expect('reachable').toBeTruthy()
      return 'test'
    }).then((val) => {
      expect(val).toBe('test')
    })
  })
  expect('reachable').toBeTruthy()

  await app.ready()
  expect('reachable').toBeTruthy()
})

test('await use - await and use chaining', async () => {
  const app = {}
  boot(app)

  expect.assertions(3)

  app.use(async (f, opts, cb) => {
    await app.use(async (f, opts) => {
      expect('plugin init').toBeTruthy()
    }).use(async (f, opts) => {
      expect('plugin2 init').toBeTruthy()
    })
  })

  await app.ready()
  expect('reachable').toBeTruthy()
})

function thenableRejects (t, thenable, err, msg) {
  return expect((async () => { await thenable })()).rejects.toThrow(err)
}

test('await use - error handling, async throw', async (ctx) => {
  const app = {}
  boot(app)

  expect.assertions(2)

  await thenableRejects(ctx, app.use(async (f, opts) => {
    throw Error('kaboom')
  }), Error('kaboom'))

  await expect(app.ready()).rejects.toThrow(Error('kaboom'))
})

test('await use - error handling, async throw, nested', async (ctx) => {
  const app = {}
  boot(app)

  expect.assertions(2)

  await thenableRejects(ctx, app.use(async function a (f, opts) {
    await app.use(async function b (f, opts) {
      throw Error('kaboom')
    })
  }), Error('kaboom'), 'b')

  await expect((() => app.ready())()).rejects.toThrow(Error('kaboom'))
})

test('await use - error handling, same tick cb err', async (ctx) => {
  const app = {}
  boot(app)

  expect.assertions(2)

  await thenableRejects(ctx, app.use((f, opts, cb) => {
    cb(Error('kaboom'))
  }), Error('kaboom'))

  expect((() => app.ready())()).rejects.toThrow(Error('kaboom'))
})

test('await use - error handling, same tick cb err, nested', async (ctx) => {
  const app = {}
  boot(app)

  expect.assertions(2)

  await thenableRejects(ctx, app.use((f, opts, cb) => {
    app.use((f, opts, cb) => {
      cb(Error('kaboom'))
    })
    cb()
  }), Error('kaboom'))

  await expect((() => app.ready())()).rejects.toThrow(Error('kaboom'))
})

test('await use - error handling, future tick cb err', async (ctx) => {
  const app = {}
  boot(app)

  expect.assertions(2)

  await thenableRejects(ctx, app.use((f, opts, cb) => {
    setImmediate(() => { cb(Error('kaboom')) })
  }), Error('kaboom'))

  await expect((() => app.ready())()).rejects.toThrow(Error('kaboom'))
})

test('await use - error handling, future tick cb err, nested', async (ctx) => {
  const app = {}
  boot(app)

  expect.assertions(2)

  await thenableRejects(ctx, app.use((f, opts, cb) => {
    app.use((f, opts, cb) => {
      setImmediate(() => { cb(Error('kaboom')) })
    })
    cb()
  }), Error('kaboom'))

  await expect((() => app.ready())()).rejects.toThrow(Error('kaboom'))
})

test('mixed await use and non-awaited use ', async () => {
  const app = {}
  boot(app)
  expect.assertions(16)

  let firstLoaded = false
  let secondLoaded = false
  let thirdLoaded = false
  let fourthLoaded = false

  await app.use(first)
  expect(firstLoaded).toBeTruthy()
  expect(secondLoaded).toBe(false)
  expect(thirdLoaded).toBe(false)
  expect(fourthLoaded).toBe(false)
  app.use(second)
  expect(firstLoaded).toBeTruthy()
  expect(secondLoaded).toBe(false)
  expect(thirdLoaded).toBe(false)
  expect(fourthLoaded).toBe(false)
  await app.use(third)
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

test('await use - mix of same and future tick callbacks', async () => {
  const app = {}
  boot(app, { autostart: false })
  let record = ''

  expect.assertions(4)

  await app.use(async function plugin0 () {
    expect('plugin0 init').toBeTruthy()
    record += 'plugin0|'
  })
  await app.use(async function plugin1 () {
    expect('plugin1 init').toBeTruthy()
    await sleep(500)
    record += 'plugin1|'
  })
  await sleep(1)
  await app.use(async function plugin2 () {
    expect('plugin2 init').toBeTruthy()
    await sleep(500)
    record += 'plugin2|'
  })
  record += 'ready'
  expect(record).toBe('plugin0|plugin1|plugin2|ready')
})

test('await use - fork the promise chain', async () => {
  expect.assertions(3)
  const app = {}
  boot(app, { autostart: false })

  async function setup () {
    let set = false
    await app.use(async function plugin0 () {
      expect('plugin0 init').toBeTruthy()
      await sleep(500)
      set = true
    })
    expect(set).toBeTruthy()
  }
  setup()

  app.ready((err, done) => {
    expect(err).toBeFalsy()
    done()
  })

  await app.ready()
})
