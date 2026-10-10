import FindMyWay from '../index.js';

test('Match static url without encoding option', () => {
  expect.assertions(2)

  const findMyWay = FindMyWay()

  const handler = () => {}

  findMyWay.on('GET', '/🍌', handler)

  expect(findMyWay.find('GET', '/🍌').handler).toEqual(handler)
  expect(findMyWay.find('GET', '/%F0%9F%8D%8C').handler).toEqual(handler)
})

test('Match parametric url with encoding option', () => {
  expect.assertions(2)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/🍌/:param', () => {})

  expect(findMyWay.find('GET', '/🍌/@').params).toEqual({ param: '@' })
  expect(findMyWay.find('GET', '/%F0%9F%8D%8C/@').params).toEqual({ param: '@' })
})

test('Match encoded parametric url with encoding option', () => {
  expect.assertions(2)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/🍌/:param', () => {})

  expect(findMyWay.find('GET', '/🍌/%23').params).toEqual({ param: '#' })
  expect(findMyWay.find('GET', '/%F0%9F%8D%8C/%23').params).toEqual({ param: '#' })
})

test('Decode url components', () => {
  expect.assertions(3)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/:param1/:param2', () => {})

  expect(findMyWay.find('GET', '/foo%23bar/foo%23bar').params).toEqual({ param1: 'foo#bar', param2: 'foo#bar' })
  expect(findMyWay.find('GET', '/%F0%9F%8D%8C/%F0%9F%8D%8C').params).toEqual({ param1: '🍌', param2: '🍌' })
  expect(findMyWay.find('GET', '/%F0%9F%8D%8C/foo%23bar').params).toEqual({ param1: '🍌', param2: 'foo#bar' })
})

test('Decode url components', () => {
  expect.assertions(5)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/foo🍌bar/:param1/:param2', () => {})
  findMyWay.on('GET', '/user/:id', () => {})

  expect(findMyWay.find('GET', '/foo%F0%9F%8D%8Cbar/foo%23bar/foo%23bar').params).toEqual({ param1: 'foo#bar', param2: 'foo#bar' })
  expect(findMyWay.find('GET', '/user/maintainer+tomas').params).toEqual({ id: 'maintainer+tomas' })
  expect(findMyWay.find('GET', '/user/maintainer%2Btomas').params).toEqual({ id: 'maintainer+tomas' })
  expect(findMyWay.find('GET', '/user/maintainer%20tomas').params).toEqual({ id: 'maintainer tomas' })
  expect(findMyWay.find('GET', '/user/maintainer%252Btomas').params).toEqual({ id: 'maintainer%2Btomas' })
})

test('Decode url components', () => {
  expect.assertions(18)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/:param1', () => {})
  expect(findMyWay.find('GET', '/foo%23bar').params).toEqual({ param1: 'foo#bar' })
  expect(findMyWay.find('GET', '/foo%24bar').params).toEqual({ param1: 'foo$bar' })
  expect(findMyWay.find('GET', '/foo%26bar').params).toEqual({ param1: 'foo&bar' })
  expect(findMyWay.find('GET', '/foo%2bbar').params).toEqual({ param1: 'foo+bar' })
  expect(findMyWay.find('GET', '/foo%2Bbar').params).toEqual({ param1: 'foo+bar' })
  expect(findMyWay.find('GET', '/foo%2cbar').params).toEqual({ param1: 'foo,bar' })
  expect(findMyWay.find('GET', '/foo%2Cbar').params).toEqual({ param1: 'foo,bar' })
  expect(findMyWay.find('GET', '/foo%2fbar').params).toEqual({ param1: 'foo/bar' })
  expect(findMyWay.find('GET', '/foo%2Fbar').params).toEqual({ param1: 'foo/bar' })

  expect(findMyWay.find('GET', '/foo%3abar').params).toEqual({ param1: 'foo:bar' })
  expect(findMyWay.find('GET', '/foo%3Abar').params).toEqual({ param1: 'foo:bar' })
  expect(findMyWay.find('GET', '/foo%3bbar').params).toEqual({ param1: 'foo;bar' })
  expect(findMyWay.find('GET', '/foo%3Bbar').params).toEqual({ param1: 'foo;bar' })
  expect(findMyWay.find('GET', '/foo%3dbar').params).toEqual({ param1: 'foo=bar' })
  expect(findMyWay.find('GET', '/foo%3Dbar').params).toEqual({ param1: 'foo=bar' })
  expect(findMyWay.find('GET', '/foo%3fbar').params).toEqual({ param1: 'foo?bar' })
  expect(findMyWay.find('GET', '/foo%3Fbar').params).toEqual({ param1: 'foo?bar' })

  expect(findMyWay.find('GET', '/foo%40bar').params).toEqual({ param1: 'foo@bar' })
})
