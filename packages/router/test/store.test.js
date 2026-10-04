'use strict'


const FindMyWay = require('../')

test('handler should have the store object', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/test', (req, res, params, store) => {
    expect(store.hello).toBe('world')
  }, { hello: 'world' })

  findMyWay.lookup({ method: 'GET', url: '/test', headers: {} }, null)
})

test('find a store object', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()
  const fn = () => {}

  findMyWay.on('GET', '/test', fn, { hello: 'world' })

  expect(findMyWay.find('GET', '/test')).toEqual({
    handler: fn,
    params: {},
    store: { hello: 'world' },
    searchParams: {}
  })
})

test('update the store', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay()
  let bool = false

  findMyWay.on('GET', '/test', (req, res, params, store) => {
    if (!bool) {
      expect(store.hello).toBe('world')
      store.hello = 'hello'
      bool = true
      findMyWay.lookup({ method: 'GET', url: '/test', headers: {} }, null)
    } else {
      expect(store.hello).toBe('hello')
    }
  }, { hello: 'world' })

  findMyWay.lookup({ method: 'GET', url: '/test', headers: {} }, null)
})
