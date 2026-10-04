'use strict'


const FindMyWay = require('../')

test('should return null when maxParamLength is exceeded (current behavior)', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({ maxParamLength: 5 })
  findMyWay.on('GET', '/test/:param', () => 'param')

  const handle = findMyWay.find('GET', '/test/123456')
  expect(handle).toBe(null)
})

test('should still match other routes if one parametric route exceeds maxParamLength (static)', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay({ maxParamLength: 5 })
  findMyWay.on('GET', '/test/:param', () => 'param')
  findMyWay.on('GET', '/test/special', () => 'special')

  const handle = findMyWay.find('GET', '/test/special')
  expect(handle).toBeTruthy()
  expect(handle.handler()).toBe('special')
})

test('should fail to match any route if the only candidate exceeds maxParamLength', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({ maxParamLength: 5 })
  findMyWay.on('GET', '/test/:param', () => 'param')

  const handle = findMyWay.find('GET', '/test/123456789')
  expect(handle).toBe(null)
})

test('should match wildcard if parametric exceeds maxParamLength', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay({ maxParamLength: 5 })
  findMyWay.on('GET', '/test/:param', () => 'param')
  findMyWay.on('GET', '/test/*', () => 'wildcard')

  const handle = findMyWay.find('GET', '/test/123456789')
  expect(handle).toBeTruthy()
  expect(handle.handler()).toBe('wildcard')
})

test('should return custom onMaxParamLength handler if provided and no other route matches', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay({
    maxParamLength: 5,
    onMaxParamLength: (path, req, res) => 'custom error'
  })
  findMyWay.on('GET', '/test/:param', () => 'param')

  const handle = findMyWay.find('GET', '/test/123456')
  expect(handle).toBeTruthy()
  expect(handle.handler()).toBe('custom error')
})
