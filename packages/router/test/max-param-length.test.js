'use strict'


const FindMyWay = require('../')

test('maxParamLength default value is 500', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay()
  expect(findMyWay.maxParamLength).toBe(100)
})

test('maxParamLength should set the maximum length for a parametric route', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay({ maxParamLength: 10 })
  findMyWay.on('GET', '/test/:param', () => {})
  expect(findMyWay.find('GET', '/test/123456789abcd')).toEqual(null)
})

test('maxParamLength should set the maximum length for a parametric (regex) route', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay({ maxParamLength: 10 })
  findMyWay.on('GET', '/test/:param(^\\d+$)', () => {})

  expect(findMyWay.find('GET', '/test/123456789abcd')).toEqual(null)
})

test('maxParamLength should set the maximum length for a parametric (multi) route', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay({ maxParamLength: 10 })
  findMyWay.on('GET', '/test/:param-bar', () => {})
  expect(findMyWay.find('GET', '/test/123456789abcd')).toEqual(null)
})

test('maxParamLength should set the maximum length for a parametric (regex with suffix) route', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay({ maxParamLength: 10 })
  findMyWay.on('GET', '/test/:param(^\\w{3})bar', () => {})
  expect(findMyWay.find('GET', '/test/123456789abcd')).toEqual(null)
})
