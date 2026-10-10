import FindMyWay from '../index.js';
const noop = () => {}

test('Should keep semver store when split node', () => {
  expect.assertions(4)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/t1', { constraints: { version: '1.0.0' } }, noop)
  findMyWay.on('GET', '/t2', { constraints: { version: '2.1.0' } }, noop)

  expect(findMyWay.find('GET', '/t1', { version: '1.0.0' })).toBeTruthy()
  expect(findMyWay.find('GET', '/t2', { version: '2.x' })).toBeTruthy()
  expect(findMyWay.find('GET', '/t1', { version: '2.x' })).toBeFalsy()
  expect(findMyWay.find('GET', '/t2', { version: '1.0.0' })).toBeFalsy()
})
