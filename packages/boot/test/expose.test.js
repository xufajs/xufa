'use strict'


const boot = require('..')
const { BOOT_ERR_EXPOSE_ALREADY_DEFINED, BOOT_ERR_ATTRIBUTE_ALREADY_DEFINED } = require('../lib/errors')
const { kBoot } = require('..')

for (const key of ['use', 'after', 'ready', 'onClose', 'close']) {
  test('throws if ' + key + ' is by default already there', () => {
    expect.assertions(1)

    const app = {}
    app[key] = () => { }

    expect(() => boot(app)).toThrow(new BOOT_ERR_EXPOSE_ALREADY_DEFINED(key, key))
  })

  test('throws if ' + key + ' is already there', () => {
    expect.assertions(1)

    const app = {}
    app['cust' + key] = () => { }

    expect(() => boot(app, { expose: { [key]: 'cust' + key } })).toThrow(new BOOT_ERR_EXPOSE_ALREADY_DEFINED('cust' + key, key))
  })

  test('support expose for ' + key, () => {
    const app = {}
    app[key] = () => { }

    const expose = {}
    expose[key] = 'muahah'

    boot(app, {
      expose
    })
  })
}

test('set the kBoot to true on the server', () => {
  expect.assertions(1)

  const server = {}
  boot(server)

  expect(server[kBoot]).toBeTruthy()
})

describe('.then()', () => {
  test('.then() can not be overwritten', () => {
    expect.assertions(1)

    const server = {
      then: () => {}
    }

    expect(() => boot(server)).toThrow(BOOT_ERR_ATTRIBUTE_ALREADY_DEFINED('then'))
  })

  test('.then() is a function', () => {
    expect.assertions(1)

    const server = {}
    boot(server)
    expect(typeof server.then).toBe('function')
  })

  test('.then() can not be overwritten', () => {
    expect.assertions(1)

    const server = {}
    boot(server)

    expect(() => { server.then = 'invalid' }).toThrow(TypeError('Cannot set property then of #<Object> which has only a getter'))
  })
})
