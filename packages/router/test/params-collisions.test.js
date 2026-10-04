'use strict'


const FindMyWay = require('..')

test('should setup parametric and regexp node', () => {
  expect.assertions(2)

  const findMyWay = FindMyWay()

  const paramHandler = () => {}
  const regexpHandler = () => {}

  findMyWay.on('GET', '/foo/:bar', paramHandler)
  findMyWay.on('GET', '/foo/:bar(123)', regexpHandler)

  expect(findMyWay.find('GET', '/foo/value').handler).toBe(paramHandler)
  expect(findMyWay.find('GET', '/foo/123').handler).toBe(regexpHandler)
})

test('should setup parametric and multi-parametric node', () => {
  expect.assertions(2)

  const findMyWay = FindMyWay()

  const paramHandler = () => {}
  const regexpHandler = () => {}

  findMyWay.on('GET', '/foo/:bar', paramHandler)
  findMyWay.on('GET', '/foo/:bar.png', regexpHandler)

  expect(findMyWay.find('GET', '/foo/value').handler).toBe(paramHandler)
  expect(findMyWay.find('GET', '/foo/value.png').handler).toBe(regexpHandler)
})

test('should throw when set upping two parametric nodes', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay()
  findMyWay.on('GET', '/foo/:bar', () => {})

  expect(() => findMyWay.on('GET', '/foo/:baz', () => {})).toThrow()
})

test('should throw when set upping two regexp nodes', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay()
  findMyWay.on('GET', '/foo/:bar(123)', () => {})

  expect(() => findMyWay.on('GET', '/foo/:bar(456)', () => {})).toThrow()
})

test('should set up two parametric nodes with static ending', () => {
  expect.assertions(2)

  const findMyWay = FindMyWay()

  const paramHandler1 = () => {}
  const paramHandler2 = () => {}

  findMyWay.on('GET', '/foo/:bar.png', paramHandler1)
  findMyWay.on('GET', '/foo/:bar.jpeg', paramHandler2)

  expect(findMyWay.find('GET', '/foo/value.png').handler).toBe(paramHandler1)
  expect(findMyWay.find('GET', '/foo/value.jpeg').handler).toBe(paramHandler2)
})

test('should set up two regexp nodes with static ending', () => {
  expect.assertions(2)

  const findMyWay = FindMyWay()

  const paramHandler1 = () => {}
  const paramHandler2 = () => {}

  findMyWay.on('GET', '/foo/:bar(123).png', paramHandler1)
  findMyWay.on('GET', '/foo/:bar(456).jpeg', paramHandler2)

  expect(findMyWay.find('GET', '/foo/123.png').handler).toBe(paramHandler1)
  expect(findMyWay.find('GET', '/foo/456.jpeg').handler).toBe(paramHandler2)
})

test('node with longer static suffix should have higher priority', () => {
  expect.assertions(2)

  const findMyWay = FindMyWay()

  const paramHandler1 = () => {}
  const paramHandler2 = () => {}

  findMyWay.on('GET', '/foo/:bar.png', paramHandler1)
  findMyWay.on('GET', '/foo/:bar.png.png', paramHandler2)

  expect(findMyWay.find('GET', '/foo/value.png').handler).toBe(paramHandler1)
  expect(findMyWay.find('GET', '/foo/value.png.png').handler).toBe(paramHandler2)
})

test('node with longer static suffix should have higher priority', () => {
  expect.assertions(2)

  const findMyWay = FindMyWay()

  const paramHandler1 = () => {}
  const paramHandler2 = () => {}

  findMyWay.on('GET', '/foo/:bar.png.png', paramHandler2)
  findMyWay.on('GET', '/foo/:bar.png', paramHandler1)

  expect(findMyWay.find('GET', '/foo/value.png').handler).toBe(paramHandler1)
  expect(findMyWay.find('GET', '/foo/value.png.png').handler).toBe(paramHandler2)
})

test('should set up regexp node and node with static ending', () => {
  expect.assertions(2)

  const regexHandler = () => {}
  const multiParamHandler = () => {}

  const findMyWay = FindMyWay()
  findMyWay.on('GET', '/foo/:bar(123)', regexHandler)
  findMyWay.on('GET', '/foo/:bar(123).jpeg', multiParamHandler)

  expect(findMyWay.find('GET', '/foo/123.jpeg').handler).toBe(multiParamHandler)
  expect(findMyWay.find('GET', '/foo/123').handler).toBe(regexHandler)
})
