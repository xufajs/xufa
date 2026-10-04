'use strict'


const FindMyWay = require('../')
const noop = () => {}

test('static routes', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/b/', noop)
  findMyWay.on('GET', '/b/bulk', noop)
  findMyWay.on('GET', '/b/ulk', noop)

  expect(findMyWay.find('GET', '/bulk')).toBe(null)
})

test('parametric routes', () => {
  expect.assertions(5)
  const findMyWay = FindMyWay()

  function foo () { }

  findMyWay.on('GET', '/foo/:fooParam', foo)
  findMyWay.on('GET', '/foo/bar/:barParam', noop)
  findMyWay.on('GET', '/foo/search', noop)
  findMyWay.on('GET', '/foo/submit', noop)

  expect(findMyWay.find('GET', '/foo/awesome-parameter').handler).toBe(foo)
  expect(findMyWay.find('GET', '/foo/b-first-character').handler).toBe(foo)
  expect(findMyWay.find('GET', '/foo/s-first-character').handler).toBe(foo)
  expect(findMyWay.find('GET', '/foo/se-prefix').handler).toBe(foo)
  expect(findMyWay.find('GET', '/foo/sx-prefix').handler).toBe(foo)
})

test('parametric with common prefix', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/test', noop)
  findMyWay.on('GET', '/:test', (req, res, params) => {
    expect({ test: 'text' }).toEqual(params)
  })
  findMyWay.on('GET', '/text/hello', noop)

  findMyWay.lookup({ url: '/text', method: 'GET', headers: {} })
})
