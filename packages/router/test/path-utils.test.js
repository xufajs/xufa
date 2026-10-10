import FindMyWay from '../index.js';

test('removeDuplicateSlashes should return the same path when there are no duplicate slashes', () => {
  expect.assertions(1)

  const path = '/hello/world'
  expect(FindMyWay.removeDuplicateSlashes(path)).toBe('/hello/world')
})

test('removeDuplicateSlashes should collapse duplicate slash groups across the full path', () => {
  expect.assertions(1)

  const path = '/hello//world///foo////bar'
  expect(FindMyWay.removeDuplicateSlashes(path)).toBe('/hello/world/foo/bar')
})

test('removeDuplicateSlashes should normalize a path made only of slashes', () => {
  expect.assertions(1)

  const path = '////'
  expect(FindMyWay.removeDuplicateSlashes(path)).toBe('/')
})

test('removeDuplicateSlashes should keep encoded slashes untouched', () => {
  expect.assertions(1)

  const path = '/a/%2F//b'
  expect(FindMyWay.removeDuplicateSlashes(path)).toBe('/a/%2F/b')
})

test('trimLastSlash should remove one trailing slash from non-root paths', () => {
  expect.assertions(1)

  const path = '/hello/'
  expect(FindMyWay.trimLastSlash(path)).toBe('/hello')
})

test('trimLastSlash should leave root path untouched', () => {
  expect.assertions(1)

  const path = '/'
  expect(FindMyWay.trimLastSlash(path)).toBe('/')
})

test('trimLastSlash should leave paths without trailing slash untouched', () => {
  expect.assertions(1)

  const path = '/hello/world'
  expect(FindMyWay.trimLastSlash(path)).toBe('/hello/world')
})

test('trimLastSlash should remove only one trailing slash', () => {
  expect.assertions(1)

  const path = '/hello///'
  expect(FindMyWay.trimLastSlash(path)).toBe('/hello//')
})

test('removeDuplicateSlashes then trimLastSlash should match router path normalization order', () => {
  expect.assertions(1)

  const path = '//a//b//c//'
  const normalized = FindMyWay.trimLastSlash(FindMyWay.removeDuplicateSlashes(path))
  expect(normalized).toBe('/a/b/c')
})
