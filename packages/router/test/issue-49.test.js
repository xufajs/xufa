'use strict'


const FindMyWay = require('../')
const noop = () => {}

test('Defining static route after parametric - 1', () => {
  expect.assertions(3)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/static', noop)
  findMyWay.on('GET', '/:param', noop)

  expect(findMyWay.find('GET', '/static')).toBeTruthy()
  expect(findMyWay.find('GET', '/para')).toBeTruthy()
  expect(findMyWay.find('GET', '/s')).toBeTruthy()
})

test('Defining static route after parametric - 2', () => {
  expect.assertions(3)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/:param', noop)
  findMyWay.on('GET', '/static', noop)

  expect(findMyWay.find('GET', '/static')).toBeTruthy()
  expect(findMyWay.find('GET', '/para')).toBeTruthy()
  expect(findMyWay.find('GET', '/s')).toBeTruthy()
})

test('Defining static route after parametric - 3', () => {
  expect.assertions(4)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/:param', noop)
  findMyWay.on('GET', '/static', noop)
  findMyWay.on('GET', '/other', noop)

  expect(findMyWay.find('GET', '/static')).toBeTruthy()
  expect(findMyWay.find('GET', '/para')).toBeTruthy()
  expect(findMyWay.find('GET', '/s')).toBeTruthy()
  expect(findMyWay.find('GET', '/o')).toBeTruthy()
})

test('Defining static route after parametric - 4', () => {
  expect.assertions(4)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/static', noop)
  findMyWay.on('GET', '/other', noop)
  findMyWay.on('GET', '/:param', noop)

  expect(findMyWay.find('GET', '/static')).toBeTruthy()
  expect(findMyWay.find('GET', '/para')).toBeTruthy()
  expect(findMyWay.find('GET', '/s')).toBeTruthy()
  expect(findMyWay.find('GET', '/o')).toBeTruthy()
})

test('Defining static route after parametric - 5', () => {
  expect.assertions(4)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/static', noop)
  findMyWay.on('GET', '/:param', noop)
  findMyWay.on('GET', '/other', noop)

  expect(findMyWay.find('GET', '/static')).toBeTruthy()
  expect(findMyWay.find('GET', '/para')).toBeTruthy()
  expect(findMyWay.find('GET', '/s')).toBeTruthy()
  expect(findMyWay.find('GET', '/o')).toBeTruthy()
})

test('Should produce the same tree - 1', () => {
  expect.assertions(1)
  const findMyWay1 = FindMyWay()
  const findMyWay2 = FindMyWay()

  findMyWay1.on('GET', '/static', noop)
  findMyWay1.on('GET', '/:param', noop)

  findMyWay2.on('GET', '/:param', noop)
  findMyWay2.on('GET', '/static', noop)

  expect(findMyWay1.tree).toBe(findMyWay2.tree)
})

test('Should produce the same tree - 2', () => {
  expect.assertions(3)
  const findMyWay1 = FindMyWay()
  const findMyWay2 = FindMyWay()
  const findMyWay3 = FindMyWay()

  findMyWay1.on('GET', '/:param', noop)
  findMyWay1.on('GET', '/static', noop)
  findMyWay1.on('GET', '/other', noop)

  findMyWay2.on('GET', '/static', noop)
  findMyWay2.on('GET', '/:param', noop)
  findMyWay2.on('GET', '/other', noop)

  findMyWay3.on('GET', '/static', noop)
  findMyWay3.on('GET', '/other', noop)
  findMyWay3.on('GET', '/:param', noop)

  expect(findMyWay1.tree).toBe(findMyWay2.tree)
  expect(findMyWay2.tree).toBe(findMyWay3.tree)
  expect(findMyWay1.tree).toBe(findMyWay3.tree)
})
