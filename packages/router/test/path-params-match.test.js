import FindMyWay from '../index.js';

test('path params match', () => {
  expect.assertions(24)

  const findMyWay = FindMyWay({ ignoreTrailingSlash: true, ignoreDuplicateSlashes: true })

  const b1Path = function b1StaticPath () {}
  const b2Path = function b2StaticPath () {}
  const cPath = function cStaticPath () {}
  const paramPath = function parameterPath () {}

  findMyWay.on('GET', '/ab1', b1Path)
  findMyWay.on('GET', '/ab2', b2Path)
  findMyWay.on('GET', '/ac', cPath)
  findMyWay.on('GET', '/:pam', paramPath)

  expect(findMyWay.find('GET', '/ab1').handler).toBe(b1Path)
  expect(findMyWay.find('GET', '/ab1/').handler).toBe(b1Path)
  expect(findMyWay.find('GET', '//ab1').handler).toBe(b1Path)
  expect(findMyWay.find('GET', '//ab1//').handler).toBe(b1Path)
  expect(findMyWay.find('GET', '/ab2').handler).toBe(b2Path)
  expect(findMyWay.find('GET', '/ab2/').handler).toBe(b2Path)
  expect(findMyWay.find('GET', '//ab2').handler).toBe(b2Path)
  expect(findMyWay.find('GET', '//ab2//').handler).toBe(b2Path)
  expect(findMyWay.find('GET', '/ac').handler).toBe(cPath)
  expect(findMyWay.find('GET', '/ac/').handler).toBe(cPath)
  expect(findMyWay.find('GET', '//ac').handler).toBe(cPath)
  expect(findMyWay.find('GET', '//ac//').handler).toBe(cPath)
  expect(findMyWay.find('GET', '/foo').handler).toBe(paramPath)
  expect(findMyWay.find('GET', '/foo/').handler).toBe(paramPath)
  expect(findMyWay.find('GET', '//foo').handler).toBe(paramPath)
  expect(findMyWay.find('GET', '//foo//').handler).toBe(paramPath)

  const noTrailingSlashRet = findMyWay.find('GET', '/abcdef')
  expect(noTrailingSlashRet.handler).toBe(paramPath)
  expect(noTrailingSlashRet.params).toEqual({ pam: 'abcdef' })

  const trailingSlashRet = findMyWay.find('GET', '/abcdef/')
  expect(trailingSlashRet.handler).toBe(paramPath)
  expect(trailingSlashRet.params).toEqual({ pam: 'abcdef' })

  const noDuplicateSlashRet = findMyWay.find('GET', '/abcdef')
  expect(noDuplicateSlashRet.handler).toBe(paramPath)
  expect(noDuplicateSlashRet.params).toEqual({ pam: 'abcdef' })

  const duplicateSlashRet = findMyWay.find('GET', '//abcdef')
  expect(duplicateSlashRet.handler).toBe(paramPath)
  expect(duplicateSlashRet.params).toEqual({ pam: 'abcdef' })
})
