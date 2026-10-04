'use strict'


const FindMyWay = require('../')
const noop = () => {}

test('single-character prefix', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/b/', noop)
  findMyWay.on('GET', '/b/bulk', noop)

  expect(findMyWay.find('GET', '/bulk')).toBe(null)
})

test('multi-character prefix', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/bu/', noop)
  findMyWay.on('GET', '/bu/bulk', noop)

  expect(findMyWay.find('GET', '/bulk')).toBe(null)
})

test('static / 1', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/bb/', noop)
  findMyWay.on('GET', '/bb/bulk', noop)

  expect(findMyWay.find('GET', '/bulk')).toBe(null)
})

test('static / 2', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/bb/ff/', noop)
  findMyWay.on('GET', '/bb/ff/bulk', noop)

  expect(findMyWay.find('GET', '/bulk')).toBe(null)
  expect(findMyWay.find('GET', '/ff/bulk')).toBe(null)
})

test('static / 3', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/bb/ff/', noop)
  findMyWay.on('GET', '/bb/ff/bulk', noop)
  findMyWay.on('GET', '/bb/ff/gg/bulk', noop)
  findMyWay.on('GET', '/bb/ff/bulk/bulk', noop)

  expect(findMyWay.find('GET', '/bulk')).toBe(null)
})

test('with parameter / 1', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/:foo/', noop)
  findMyWay.on('GET', '/:foo/bulk', noop)

  expect(findMyWay.find('GET', '/bulk')).toBe(null)
})

test('with parameter / 2', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/bb/', noop)
  findMyWay.on('GET', '/bb/:foo', noop)

  expect(findMyWay.find('GET', '/bulk')).toBe(null)
})

test('with parameter / 3', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/bb/ff/', noop)
  findMyWay.on('GET', '/bb/ff/:foo', noop)

  expect(findMyWay.find('GET', '/bulk')).toBe(null)
})

test('with parameter / 4', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/bb/:foo/', noop)
  findMyWay.on('GET', '/bb/:foo/bulk', noop)

  expect(findMyWay.find('GET', '/bulk')).toBe(null)
})

test('with parameter / 5', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/bb/:foo/aa/', noop)
  findMyWay.on('GET', '/bb/:foo/aa/bulk', noop)

  expect(findMyWay.find('GET', '/bulk')).toBe(null)
  expect(findMyWay.find('GET', '/bb/foo/bulk')).toBe(null)
})

test('with parameter / 6', () => {
  expect.assertions(3)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/static/:parametric/static/:parametric', noop)
  findMyWay.on('GET', '/static/:parametric/static/:parametric/bulk', noop)

  expect(findMyWay.find('GET', '/bulk')).toBe(null)
  expect(findMyWay.find('GET', '/static/foo/bulk')).toBe(null)
  expect(findMyWay.find('GET', '/static/foo/static/bulk')).not.toBe(null)
})

test('wildcard / 1', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/bb/', noop)
  findMyWay.on('GET', '/bb/*', noop)

  expect(findMyWay.find('GET', '/bulk')).toBe(null)
})
