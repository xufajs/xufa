'use strict'


const { hookRunnerGenerator, onSendHookRunner } = require('../../lib/hooks')

test('hookRunner - Basic', async () => {
  expect.assertions(9)

  const hookRunner = hookRunnerGenerator(iterator)

  hookRunner([fn1, fn2, fn3], 'a', 'b', done)

  function iterator (fn, a, b, done) {
    return fn(a, b, done)
  }

  function fn1 (a, b, done) {
    expect(a).toBe('a')
    expect(b).toBe('b')
    done()
  }

  function fn2 (a, b, done) {
    expect(a).toBe('a')
    expect(b).toBe('b')
    done()
  }

  function fn3 (a, b, done) {
    expect(a).toBe('a')
    expect(b).toBe('b')
    done()
  }

  function done (err, a, b) {
    expect(err).toBeFalsy()
    expect(a).toBe('a')
    expect(b).toBe('b')
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('hookRunner - In case of error should skip to done', async () => {
  expect.assertions(7)

  const hookRunner = hookRunnerGenerator(iterator)

  hookRunner([fn1, fn2, fn3], 'a', 'b', done)

  function iterator (fn, a, b, done) {
    return fn(a, b, done)
  }

  function fn1 (a, b, done) {
    expect(a).toBe('a')
    expect(b).toBe('b')
    done()
  }

  function fn2 (a, b, done) {
    expect(a).toBe('a')
    expect(b).toBe('b')
    done(new Error('kaboom'))
  }

  function fn3 () {
    expect.fail('We should not be here')
  }

  function done (err, a, b) {
    expect(err.message).toBe('kaboom')
    expect(a).toBe('a')
    expect(b).toBe('b')
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('hookRunner - Should handle throw', async () => {
  expect.assertions(7)

  const hookRunner = hookRunnerGenerator(iterator)

  hookRunner([fn1, fn2, fn3], 'a', 'b', done)

  function iterator (fn, a, b, done) {
    return fn(a, b, done)
  }

  function fn1 (a, b, done) {
    expect(a).toBe('a')
    expect(b).toBe('b')
    done()
  }

  function fn2 (a, b, done) {
    expect(a).toBe('a')
    expect(b).toBe('b')
    throw new Error('kaboom')
  }

  function fn3 () {
    expect.fail('We should not be here')
  }

  function done (err, a, b) {
    expect(err.message).toBe('kaboom')
    expect(a).toBe('a')
    expect(b).toBe('b')
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('hookRunner - Should handle promises', async () => {
  expect.assertions(9)

  const hookRunner = hookRunnerGenerator(iterator)

  hookRunner([fn1, fn2, fn3], 'a', 'b', done)

  function iterator (fn, a, b, done) {
    return fn(a, b, done)
  }

  function fn1 (a, b) {
    expect(a).toBe('a')
    expect(b).toBe('b')
    return Promise.resolve()
  }

  function fn2 (a, b) {
    expect(a).toBe('a')
    expect(b).toBe('b')
    return Promise.resolve()
  }

  function fn3 (a, b) {
    expect(a).toBe('a')
    expect(b).toBe('b')
    return Promise.resolve()
  }

  function done (err, a, b) {
    expect(err).toBeFalsy()
    expect(a).toBe('a')
    expect(b).toBe('b')
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('hookRunner - In case of error should skip to done (with promises)', async () => {
  expect.assertions(7)

  const hookRunner = hookRunnerGenerator(iterator)

  hookRunner([fn1, fn2, fn3], 'a', 'b', done)

  function iterator (fn, a, b, done) {
    return fn(a, b, done)
  }

  function fn1 (a, b) {
    expect(a).toBe('a')
    expect(b).toBe('b')
    return Promise.resolve()
  }

  function fn2 (a, b) {
    expect(a).toBe('a')
    expect(b).toBe('b')
    return Promise.reject(new Error('kaboom'))
  }

  function fn3 () {
    expect.fail('We should not be here')
  }

  function done (err, a, b) {
    expect(err.message).toBe('kaboom')
    expect(a).toBe('a')
    expect(b).toBe('b')
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('hookRunner - Be able to exit before its natural end', async () => {
  expect.assertions(4)

  const hookRunner = hookRunnerGenerator(iterator)

  let shouldStop = false
  hookRunner([fn1, fn2, fn3], 'a', 'b', done)

  function iterator (fn, a, b, done) {
    if (shouldStop) {
      return undefined
    }
    return fn(a, b, done)
  }

  function fn1 (a, b, done) {
    expect(a).toBe('a')
    expect(b).toBe('b')
    done()
  }

  function fn2 (a, b) {
    expect(a).toBe('a')
    expect(b).toBe('b')
    shouldStop = true
    return Promise.resolve()
  }

  function fn3 () {
    expect.fail('this should not be called')
  }

  function done () {
    expect.fail('this should not be called')
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('hookRunner - Promises that resolve to a value do not change the state', async () => {
  expect.assertions(5)

  const originalState = { a: 'a', b: 'b' }

  const hookRunner = hookRunnerGenerator(iterator)

  hookRunner([fn1, fn2, fn3], originalState, 'b', done)

  function iterator (fn, state, b, done) {
    return fn(state, b, done)
  }

  function fn1 (state, b, done) {
    expect(state).toBe(originalState)
    return Promise.resolve(null)
  }

  function fn2 (state, b, done) {
    expect(state).toBe(originalState)
    return Promise.resolve('string')
  }

  function fn3 (state, b, done) {
    expect(state).toBe(originalState)
    return Promise.resolve({ object: true })
  }

  function done (err, state, b) {
    expect(err).toBeFalsy()
    expect(state).toBe(originalState)
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('onSendHookRunner - Basic', async () => {
  expect.assertions(13)

  const originalRequest = { body: null }
  const originalReply = { request: originalRequest }
  const originalPayload = 'payload'

  onSendHookRunner([fn1, fn2, fn3], originalRequest, originalReply, originalPayload, done)

  function fn1 (request, reply, payload, done) {
    expect(request).toEqual(originalRequest)
    expect(reply).toEqual(originalReply)
    expect(payload).toBe(originalPayload)
    done()
  }

  function fn2 (request, reply, payload, done) {
    expect(request).toEqual(originalRequest)
    expect(reply).toEqual(originalReply)
    expect(payload).toBe(originalPayload)
    done()
  }

  function fn3 (request, reply, payload, done) {
    expect(request).toEqual(originalRequest)
    expect(reply).toEqual(originalReply)
    expect(payload).toBe(originalPayload)
    done()
  }

  function done (err, request, reply, payload) {
    expect(err).toBeFalsy()
    expect(request).toEqual(originalRequest)
    expect(reply).toEqual(originalReply)
    expect(payload).toBe(originalPayload)
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('onSendHookRunner - Can change the payload', async () => {
  expect.assertions(7)

  const originalRequest = { body: null }
  const originalReply = { request: originalRequest }
  const v1 = { hello: 'world' }
  const v2 = { ciao: 'mondo' }
  const v3 = { winter: 'is coming' }
  const v4 = { winter: 'has come' }

  onSendHookRunner([fn1, fn2, fn3], originalRequest, originalReply, v1, done)

  function fn1 (request, reply, payload, done) {
    expect(payload).toEqual(v1)
    done(null, v2)
  }

  function fn2 (request, reply, payload, done) {
    expect(payload).toEqual(v2)
    done(null, v3)
  }

  function fn3 (request, reply, payload, done) {
    expect(payload).toEqual(v3)
    done(null, v4)
  }

  function done (err, request, reply, payload) {
    expect(err).toBeFalsy()
    expect(request).toEqual(originalRequest)
    expect(reply).toEqual(originalReply)
    expect(payload).toEqual(v4)
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('onSendHookRunner - In case of error should skip to done', async () => {
  expect.assertions(6)

  const originalRequest = { body: null }
  const originalReply = { request: originalRequest }
  const v1 = { hello: 'world' }
  const v2 = { ciao: 'mondo' }

  onSendHookRunner([fn1, fn2, fn3], originalRequest, originalReply, v1, done)

  function fn1 (request, reply, payload, done) {
    expect(payload).toEqual(v1)
    done(null, v2)
  }

  function fn2 (request, reply, payload, done) {
    expect(payload).toEqual(v2)
    done(new Error('kaboom'))
  }

  function fn3 () {
    expect.fail('We should not be here')
  }

  function done (err, request, reply, payload) {
    expect(err.message).toBe('kaboom')
    expect(request).toEqual(originalRequest)
    expect(reply).toEqual(originalReply)
    expect(payload).toEqual(v2)
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('onSendHookRunner - Should handle promises', async () => {
  expect.assertions(7)

  const originalRequest = { body: null }
  const originalReply = { request: originalRequest }
  const v1 = { hello: 'world' }
  const v2 = { ciao: 'mondo' }
  const v3 = { winter: 'is coming' }
  const v4 = { winter: 'has come' }

  onSendHookRunner([fn1, fn2, fn3], originalRequest, originalReply, v1, done)

  function fn1 (request, reply, payload) {
    expect(payload).toEqual(v1)
    return Promise.resolve(v2)
  }

  function fn2 (request, reply, payload) {
    expect(payload).toEqual(v2)
    return Promise.resolve(v3)
  }

  function fn3 (request, reply, payload) {
    expect(payload).toEqual(v3)
    return Promise.resolve(v4)
  }

  function done (err, request, reply, payload) {
    expect(err).toBeFalsy()
    expect(request).toEqual(originalRequest)
    expect(reply).toEqual(originalReply)
    expect(payload).toEqual(v4)
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('onSendHookRunner - In case of error should skip to done (with promises)', async () => {
  expect.assertions(6)

  const originalRequest = { body: null }
  const originalReply = { request: originalRequest }
  const v1 = { hello: 'world' }
  const v2 = { ciao: 'mondo' }

  onSendHookRunner([fn1, fn2, fn3], originalRequest, originalReply, v1, done)

  function fn1 (request, reply, payload) {
    expect(payload).toEqual(v1)
    return Promise.resolve(v2)
  }

  function fn2 (request, reply, payload) {
    expect(payload).toEqual(v2)
    return Promise.reject(new Error('kaboom'))
  }

  function fn3 () {
    expect.fail('We should not be here')
  }

  function done (err, request, reply, payload) {
    expect(err.message).toBe('kaboom')
    expect(request).toEqual(originalRequest)
    expect(reply).toEqual(originalReply)
    expect(payload).toEqual(v2)
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('onSendHookRunner - Be able to exit before its natural end', async () => {
  expect.assertions(2)

  const originalRequest = { body: null }
  const originalReply = { request: originalRequest }
  const v1 = { hello: 'world' }
  const v2 = { ciao: 'mondo' }

  onSendHookRunner([fn1, fn2, fn3], originalRequest, originalReply, v1, done)

  function fn1 (request, reply, payload, done) {
    expect(payload).toEqual(v1)
    done(null, v2)
  }

  function fn2 (request, reply, payload) {
    expect(payload).toEqual(v2)
  }

  function fn3 () {
    expect.fail('this should not be called')
  }

  function done () {
    expect.fail('this should not be called')
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
