'use strict'


const FindMyWay = require('..')

test('lookup calls route handler with no context', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/example', function handle (req, res, params) {
    // without context, this will be the result object returned from router.find
    expect(this.handler).toBe(handle)
  })

  findMyWay.lookup({ method: 'GET', url: '/example', headers: {} }, null)
})

test('lookup calls route handler with context as scope', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay()

  const ctx = { foo: 'bar' }

  findMyWay.on('GET', '/example', function handle (req, res, params) {
    expect(this).toBe(ctx)
  })

  findMyWay.lookup({ method: 'GET', url: '/example', headers: {} }, null, ctx)
})

test('lookup calls default route handler with no context', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay({
    defaultRoute (req, res) {
      // without context, the default route's scope is the router itself
      expect(this).toBe(findMyWay)
    }
  })

  findMyWay.lookup({ method: 'GET', url: '/example', headers: {} }, null)
})

test('lookup calls default route handler with context as scope', () => {
  expect.assertions(1)

  const ctx = { foo: 'bar' }

  const findMyWay = FindMyWay({
    defaultRoute (req, res) {
      expect(this).toBe(ctx)
    }
  })

  findMyWay.lookup({ method: 'GET', url: '/example', headers: {} }, null, ctx)
})
