'use strict'


const FindMyWay = require('../')

test('issue-240: .find matching', () => {
  expect.assertions(14)

  const findMyWay = FindMyWay({ ignoreDuplicateSlashes: true })

  const fixedPath = function staticPath () {}
  const varPath = function parameterPath () {}
  findMyWay.on('GET', '/a/b', fixedPath)
  findMyWay.on('GET', '/a/:pam/c', varPath)

  expect(findMyWay.find('GET', '/a/b').handler).toBe(fixedPath)
  expect(findMyWay.find('GET', '/a//b').handler).toBe(fixedPath)
  expect(findMyWay.find('GET', '/a/b/c').handler).toBe(varPath)
  expect(findMyWay.find('GET', '/a//b/c').handler).toBe(varPath)
  expect(findMyWay.find('GET', '/a///b/c').handler).toBe(varPath)
  expect(findMyWay.find('GET', '/a//b//c').handler).toBe(varPath)
  expect(findMyWay.find('GET', '/a///b///c').handler).toBe(varPath)
  expect(findMyWay.find('GET', '/a/foo/c').handler).toBe(varPath)
  expect(findMyWay.find('GET', '/a//foo/c').handler).toBe(varPath)
  expect(findMyWay.find('GET', '/a///foo/c').handler).toBe(varPath)
  expect(findMyWay.find('GET', '/a//foo//c').handler).toBe(varPath)
  expect(findMyWay.find('GET', '/a///foo///c').handler).toBe(varPath)
  expect(findMyWay.find('GET', '/a/c')).toBeFalsy()
  expect(findMyWay.find('GET', '/a//c')).toBeFalsy()
})
