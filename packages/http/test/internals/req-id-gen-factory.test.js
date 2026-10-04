'use strict'


const { reqIdGenFactory } = require('../../lib/req-id')

test('should create incremental ids deterministically', async () => {
  expect.assertions(1)
  const reqIdGen = reqIdGenFactory()

  for (let i = 1; i < 1e4; ++i) {
    if (reqIdGen() !== 'req-' + i.toString(36)) {
      expect.fail()
      break
    }
  }
  expect(true).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('should have prefix "req-"', async () => {
  expect.assertions(1)
  const reqIdGen = reqIdGenFactory()

  expect(reqIdGen().startsWith('req-')).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('different id generator functions should have separate internal counters', async () => {
  expect.assertions(5)
  const reqIdGenA = reqIdGenFactory()
  const reqIdGenB = reqIdGenFactory()

  expect(reqIdGenA()).toBe('req-1')
  expect(reqIdGenA()).toBe('req-2')
  expect(reqIdGenB()).toBe('req-1')
  expect(reqIdGenA()).toBe('req-3')
  expect(reqIdGenB()).toBe('req-2')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('should start counting with 1', async () => {
  expect.assertions(1)
  const reqIdGen = reqIdGenFactory()

  expect(reqIdGen()).toBe('req-1')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('should handle requestIdHeader and return provided id in header', async () => {
  expect.assertions(1)

  const reqIdGen = reqIdGenFactory('id')

  expect(reqIdGen({ headers: { id: '1337' } })).toBe('1337')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('should handle requestIdHeader and fallback if id is not provided in header', async () => {
  expect.assertions(1)

  const reqIdGen = reqIdGenFactory('id')

  expect(reqIdGen({ headers: { notId: '1337' } })).toBe('req-1')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('should handle requestIdHeader and increment internal counter if no header was provided', async () => {
  expect.assertions(4)

  const reqIdGen = reqIdGenFactory('id')

  expect(reqIdGen({ headers: {} })).toBe('req-1')
  expect(reqIdGen({ headers: {} })).toBe('req-2')
  expect(reqIdGen({ headers: { id: '1337' } })).toBe('1337')
  expect(reqIdGen({ headers: {} })).toBe('req-3')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('should use optGenReqId to generate ids', async () => {
  expect.assertions(4)

  let i = 1
  let gotCalled = false
  function optGenReqId () {
    gotCalled = true
    return (i++).toString(16)
  }
  const reqIdGen = reqIdGenFactory(undefined, optGenReqId)

  expect(gotCalled).toBe(false)
  expect(reqIdGen()).toBe('1')
  expect(gotCalled).toBe(true)
  expect(reqIdGen()).toBe('2')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('should use optGenReqId to generate ids if requestIdHeader is used but not provided', async () => {
  expect.assertions(4)

  let i = 1
  let gotCalled = false
  function optGenReqId () {
    gotCalled = true
    return (i++).toString(16)
  }
  const reqIdGen = reqIdGenFactory('reqId', optGenReqId)

  expect(gotCalled).toBe(false)
  expect(reqIdGen({ headers: {} })).toBe('1')
  expect(gotCalled).toBe(true)
  expect(reqIdGen({ headers: {} })).toBe('2')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('should not use optGenReqId to generate ids if requestIdHeader is used and provided', async () => {
  expect.assertions(2)

  function optGenReqId () {
    expect.fail()
  }
  const reqIdGen = reqIdGenFactory('reqId', optGenReqId)

  expect(reqIdGen({ headers: { reqId: 'r1' } })).toBe('r1')
  expect(reqIdGen({ headers: { reqId: 'r2' } })).toBe('r2')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('should fallback to use optGenReqId to generate ids if requestIdHeader is sometimes provided', async () => {
  expect.assertions(4)

  let i = 1
  let gotCalled = false
  function optGenReqId () {
    gotCalled = true
    return (i++).toString(16)
  }
  const reqIdGen = reqIdGenFactory('reqId', optGenReqId)

  expect(reqIdGen({ headers: { reqId: 'r1' } })).toBe('r1')
  expect(gotCalled).toBe(false)
  expect(reqIdGen({ headers: {} })).toBe('1')
  expect(gotCalled).toBe(true)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
