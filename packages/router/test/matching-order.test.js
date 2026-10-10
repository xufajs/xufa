import FindMyWay from '../index.js';

test('Matching order', () => {
  expect.assertions(3)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/foo/bar/static', { constraints: { host: 'test' } }, () => {})
  findMyWay.on('GET', '/foo/bar/*', () => {})
  findMyWay.on('GET', '/foo/:param/static', () => {})

  expect(findMyWay.find('GET', '/foo/bar/static', { host: 'test' }).params).toEqual({})
  expect(findMyWay.find('GET', '/foo/bar/static').params).toEqual({ '*': 'static' })
  expect(findMyWay.find('GET', '/foo/value/static').params).toEqual({ param: 'value' })
})
