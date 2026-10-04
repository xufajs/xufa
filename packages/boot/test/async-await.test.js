'use strict'

/* eslint no-prototype-builtins: off */


const { setTimeout: sleep } = require('node:timers/promises')

const boot = require('..')

test('one level', async () => {
  expect.assertions(14)

  const app = boot()
  let firstLoaded = false
  let secondLoaded = false
  let thirdLoaded = false

  app.use(first)
  app.use(third)

  async function first (s, opts) {
    expect(firstLoaded).toBe(false)
    expect(secondLoaded).toBe(false)
    expect(thirdLoaded).toBe(false)
    firstLoaded = true
    s.use(second)
  }

  async function second (s, opts) {
    expect(firstLoaded).toBeTruthy()
    expect(secondLoaded).toBe(false)
    expect(thirdLoaded).toBe(false)
    secondLoaded = true
  }

  async function third (s, opts) {
    expect(firstLoaded).toBeTruthy()
    expect(secondLoaded).toBeTruthy()
    expect(thirdLoaded).toBe(false)
    thirdLoaded = true
  }

  const readyContext = await app.ready()

  expect(app).toEqual(readyContext)
  expect(firstLoaded).toBeTruthy()
  expect(secondLoaded).toBeTruthy()
  expect(thirdLoaded).toBeTruthy()
  expect('booted').toBeTruthy()
})

test('multiple reentrant plugin loading', async () => {
  expect.assertions(31)

  const app = boot()
  let firstLoaded = false
  let secondLoaded = false
  let thirdLoaded = false
  let fourthLoaded = false
  let fifthLoaded = false

  app.use(first)
  app.use(fifth)

  async function first (s, opts) {
    expect(firstLoaded).toBe(false)
    expect(secondLoaded).toBe(false)
    expect(thirdLoaded).toBe(false)
    expect(fourthLoaded).toBe(false)
    expect(fifthLoaded).toBe(false)
    firstLoaded = true
    s.use(second)
  }

  async function second (s, opts) {
    expect(firstLoaded).toBeTruthy()
    expect(secondLoaded).toBe(false)
    expect(thirdLoaded).toBe(false)
    expect(fourthLoaded).toBe(false)
    expect(fifthLoaded).toBe(false)
    secondLoaded = true
    s.use(third)
    await sleep(10)
    s.use(fourth)
  }

  async function third (s, opts) {
    expect(firstLoaded).toBeTruthy()
    expect(secondLoaded).toBeTruthy()
    expect(thirdLoaded).toBe(false)
    expect(fourthLoaded).toBe(false)
    expect(fifthLoaded).toBe(false)
    thirdLoaded = true
  }

  async function fourth (s, opts) {
    expect(firstLoaded).toBeTruthy()
    expect(secondLoaded).toBeTruthy()
    expect(thirdLoaded).toBeTruthy()
    expect(fourthLoaded).toBe(false)
    expect(fifthLoaded).toBe(false)
    fourthLoaded = true
  }

  async function fifth (s, opts) {
    expect(firstLoaded).toBeTruthy()
    expect(secondLoaded).toBeTruthy()
    expect(thirdLoaded).toBeTruthy()
    expect(fourthLoaded).toBeTruthy()
    expect(fifthLoaded).toBe(false)
    fifthLoaded = true
  }

  await app.ready()
  expect(firstLoaded).toBeTruthy()
  expect(secondLoaded).toBeTruthy()
  expect(thirdLoaded).toBeTruthy()
  expect(fourthLoaded).toBeTruthy()
  expect(fifthLoaded).toBeTruthy()
  expect('booted').toBeTruthy()
})

test('async ready plugin registration (errored)', async () => {
  expect.assertions(1)

  const app = boot()

  app.use(async (server, opts) => {
    await sleep(10)
    throw new Error('kaboom')
  })

  try {
    await app.ready()
    expect.fail('we should not be here')
  } catch (err) {
    expect(err.message).toBe('kaboom')
  }
})

test('after', async () => {
  expect.assertions(15)

  const app = boot()
  let firstLoaded = false
  let secondLoaded = false
  let thirdLoaded = false

  app.use(first)

  async function first (s, opts) {
    expect(firstLoaded).toBe(false)
    expect(secondLoaded).toBe(false)
    expect(thirdLoaded).toBe(false)
    firstLoaded = true
    s.after(second)
    s.after(third)
  }

  async function second (err) {
    expect(err).toBeFalsy()
    expect(firstLoaded).toBeTruthy()
    expect(secondLoaded).toBe(false)
    expect(thirdLoaded).toBe(false)
    await sleep(10)
    secondLoaded = true
  }

  async function third () {
    expect(firstLoaded).toBeTruthy()
    expect(secondLoaded).toBeTruthy()
    expect(thirdLoaded).toBe(false)
    await sleep(10)
    thirdLoaded = true
  }

  const readyContext = await app.ready()

  expect(app).toEqual(readyContext)
  expect(firstLoaded).toBeTruthy()
  expect(secondLoaded).toBeTruthy()
  expect(thirdLoaded).toBeTruthy()
  expect('booted').toBeTruthy()
})

test('after wrapped', async () => {
  expect.assertions(15)

  const app = {}
  boot(app)
  let firstLoaded = false
  let secondLoaded = false
  let thirdLoaded = false

  app.use(first)

  async function first (s, opts) {
    expect(firstLoaded).toBe(false)
    expect(secondLoaded).toBe(false)
    expect(thirdLoaded).toBe(false)
    firstLoaded = true
    s.after(second)
    s.after(third)
  }

  async function second (err) {
    expect(err).toBeFalsy()
    expect(firstLoaded).toBeTruthy()
    expect(secondLoaded).toBe(false)
    expect(thirdLoaded).toBe(false)
    await sleep(10)
    secondLoaded = true
  }

  async function third () {
    expect(firstLoaded).toBeTruthy()
    expect(secondLoaded).toBeTruthy()
    expect(thirdLoaded).toBe(false)
    await sleep(10)
    thirdLoaded = true
  }

  const readyContext = await app.ready()

  expect(app).toEqual(readyContext)
  expect(firstLoaded).toBeTruthy()
  expect(secondLoaded).toBeTruthy()
  expect(thirdLoaded).toBeTruthy()
  expect('booted').toBeTruthy()
})

test('promise plugins', async () => {
  expect.assertions(14)

  const app = boot()
  let firstLoaded = false
  let secondLoaded = false
  let thirdLoaded = false

  app.use(first())
  app.use(third())

  async function first () {
    return async function (s, opts) {
      expect(firstLoaded).toBe(false)
      expect(secondLoaded).toBe(false)
      expect(thirdLoaded).toBe(false)
      firstLoaded = true
      s.use(second())
    }
  }

  async function second () {
    return async function (s, opts) {
      expect(firstLoaded).toBeTruthy()
      expect(secondLoaded).toBe(false)
      expect(thirdLoaded).toBe(false)
      secondLoaded = true
    }
  }

  async function third () {
    return async function (s, opts) {
      expect(firstLoaded).toBeTruthy()
      expect(secondLoaded).toBeTruthy()
      expect(thirdLoaded).toBe(false)
      thirdLoaded = true
    }
  }

  const readyContext = await app.ready()

  expect(app).toEqual(readyContext)
  expect(firstLoaded).toBeTruthy()
  expect(secondLoaded).toBeTruthy()
  expect(thirdLoaded).toBeTruthy()
  expect('booted').toBeTruthy()
})

test('skip override with promise', async () => {
  expect.assertions(3)

  const server = { my: 'server' }
  const app = boot(server)

  app.override = function (s, func) {
    expect('override called').toBeTruthy()

    if (func[Symbol.for('skip-override')]) {
      return s
    }
    return Object.create(s)
  }

  app.use(first())

  async function first () {
    async function fn (s, opts) {
      expect(s).toEqual(server)
      expect(Object.prototype.isPrototypeOf.call(server, s)).toBe(false)
    }

    fn[Symbol.for('skip-override')] = true

    return fn
  }

  await app.ready()
})

test('ready queue error', async () => {
  const app = boot()
  app.use(first)

  async function first (s, opts) {}

  app.ready(function (_, worker, done) {
    const error = new Error('kaboom')
    done(error)
  })

  await expect(app.ready()).rejects.toThrow(expect.objectContaining({ message: 'kaboom' }))
})
