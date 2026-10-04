'use strict'


const decorator = require('../../lib/decorate')
const {
  kState
} = require('../../lib/symbols')

test('decorate should add the given method to its instance', async () => {
  expect.assertions(1)
  function build () {
    server.add = decorator.add
    server[kState] = {
      listening: false,
      closing: false,
      started: false
    }
    return server
    function server () {}
  }

  const server = build()
  server.add('test', () => {})
  expect(server.test).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('decorate is chainable', async () => {
  expect.assertions(3)
  function build () {
    server.add = decorator.add
    server[kState] = {
      listening: false,
      closing: false,
      started: false
    }
    return server
    function server () {}
  }

  const server = build()
  server
    .add('test1', () => {})
    .add('test2', () => {})
    .add('test3', () => {})

  expect(server.test1).toBeTruthy()
  expect(server.test2).toBeTruthy()
  expect(server.test3).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('checkExistence should check if a property is part of the given instance', async () => {
  expect.assertions(1)
  const instance = { test: () => {} }
  expect(decorator.exist(instance, 'test')).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('checkExistence should find the instance if not given', async () => {
  expect.assertions(1)
  function build () {
    server.add = decorator.add
    server.check = decorator.exist
    server[kState] = {
      listening: false,
      closing: false,
      started: false
    }
    return server
    function server () {}
  }

  const server = build()
  server.add('test', () => {})
  expect(server.check('test')).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('checkExistence should check the prototype as well', async () => {
  expect.assertions(1)
  function Instance () {}
  Instance.prototype.test = () => {}

  const instance = new Instance()
  expect(decorator.exist(instance, 'test')).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('checkDependencies should throw if a dependency is not present', async () => {
  expect.assertions(2)
  const instance = {}
  try {
    decorator.dependencies(instance, 'foo', ['test'])
    expect.fail()
  } catch (e) {
    expect(e.code).toBe('XUFA_ERR_DEC_MISSING_DEPENDENCY')
    expect(e.message).toBe('The decorator is missing dependency \'test\'.')
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('decorate should internally call checkDependencies', async () => {
  expect.assertions(2)
  function build () {
    server.add = decorator.add
    server[kState] = {
      listening: false,
      closing: false,
      started: false
    }
    return server
    function server () {}
  }

  const server = build()

  try {
    server.add('method', () => {}, ['test'])
    expect.fail()
  } catch (e) {
    expect(e.code).toBe('XUFA_ERR_DEC_MISSING_DEPENDENCY')
    expect(e.message).toBe('The decorator is missing dependency \'test\'.')
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('decorate should recognize getter/setter objects', async () => {
  expect.assertions(6)

  const one = {
    [kState]: {
      listening: false,
      closing: false,
      started: false
    }
  }
  decorator.add.call(one, 'foo', {
    getter: () => this._a,
    setter: (val) => {
      expect(true).toBeTruthy()
      this._a = val
    }
  })
  expect(Object.hasOwn(one, 'foo')).toBe(true)
  expect(one.foo).toBe(undefined)
  one.foo = 'a'
  expect(one.foo).toBe('a')

  // getter only
  const two = {
    [kState]: {
      listening: false,
      closing: false,
      started: false
    }
  }
  decorator.add.call(two, 'foo', {
    getter: () => 'a getter'
  })
  expect(Object.hasOwn(two, 'foo')).toBe(true)
  expect(two.foo).toBe('a getter')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
