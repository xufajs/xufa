import FindMyWay from '../index.js';

test('sanitizeUrlPath should decode reserved characters inside params and strip querystring', () => {
  expect.assertions(1)

  const url = '/%65ncod%65d?foo=bar'
  const sanitized = FindMyWay.sanitizeUrlPath(url)

  expect(sanitized).toBe('/encoded')
})

test('sanitizeUrlPath should decode non-reserved characters but keep reserved encoded when not in params', () => {
  expect.assertions(1)

  const url = '/hello/%20world?foo=bar'
  const sanitized = FindMyWay.sanitizeUrlPath(url)

  expect(sanitized).toBe('/hello/ world')
})

test('sanitizeUrlPath should treat semicolon as queryparameter delimiter when enabled', () => {
  expect.assertions(2)

  const url = '/hello/%23world;foo=bar'

  const sanitizedWithDelimiter = FindMyWay.sanitizeUrlPath(url, true)
  expect(sanitizedWithDelimiter).toBe('/hello/#world')

  const sanitizedWithoutDelimiter = FindMyWay.sanitizeUrlPath(url, false)
  expect(sanitizedWithoutDelimiter).toBe('/hello/#world;foo=bar')
})

test('sanitizeUrlPath trigger an error if the url is invalid', () => {
  expect.assertions(1)

  const url = '/Hello%3xWorld/world'
  expect(() => {
    FindMyWay.sanitizeUrlPath(url)
  }).toThrow()
})
