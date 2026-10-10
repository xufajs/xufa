import FindMyWay from '../index.js';

test('Parametric regex match with similar routes', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/:a(a)', () => {})
  findMyWay.on('GET', '/:param/static', () => {})

  expect(findMyWay.find('GET', '/a', {}).params).toEqual({ a: 'a' })
  expect(findMyWay.find('GET', '/param/static', {}).params).toEqual({ param: 'param' })
})

test('Parametric regex match with similar routes', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/:a(a)', () => {})
  findMyWay.on('GET', '/:b(b)/static', () => {})

  expect(findMyWay.find('GET', '/a', {}).params).toEqual({ a: 'a' })
  expect(findMyWay.find('GET', '/b/static', {}).params).toEqual({ b: 'b' })
})

test('Parametric regex match with similar routes', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/:a(a)/static', { constraints: { version: '1.0.0' } }, () => {})
  findMyWay.on('GET', '/:b(b)/static', { constraints: { version: '2.0.0' } }, () => {})

  expect(findMyWay.find('GET', '/a/static', { version: '1.0.0' }).params).toEqual({ a: 'a' })
  expect(findMyWay.find('GET', '/b/static', { version: '2.0.0' }).params).toEqual({ b: 'b' })
})
