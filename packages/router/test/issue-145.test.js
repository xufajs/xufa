import FindMyWay from '../index.js';

test('issue-145', () => {
  expect.assertions(8)

  const findMyWay = FindMyWay({ ignoreTrailingSlash: true })

  const fixedPath = function staticPath () {}
  const varPath = function parameterPath () {}
  findMyWay.on('GET', '/a/b', fixedPath)
  findMyWay.on('GET', '/a/:pam/c', varPath)

  expect(findMyWay.find('GET', '/a/b').handler).toBe(fixedPath)
  expect(findMyWay.find('GET', '/a/b/').handler).toBe(fixedPath)
  expect(findMyWay.find('GET', '/a/b/c').handler).toBe(varPath)
  expect(findMyWay.find('GET', '/a/b/c/').handler).toBe(varPath)
  expect(findMyWay.find('GET', '/a/foo/c').handler).toBe(varPath)
  expect(findMyWay.find('GET', '/a/foo/c/').handler).toBe(varPath)
  expect(findMyWay.find('GET', '/a/c')).toBeFalsy()
  expect(findMyWay.find('GET', '/a/c/')).toBeFalsy()
})
