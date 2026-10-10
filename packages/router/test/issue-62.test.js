import FindMyWay from '../index.js';

const noop = function () {}

test('issue-62', () => {
  expect.assertions(2)

  const findMyWay = FindMyWay({ allowUnsafeRegex: true })

  findMyWay.on('GET', '/foo/:id(([a-f0-9]{3},?)+)', noop)

  expect(findMyWay.find('GET', '/foo/qwerty')).toBeFalsy()
  expect(findMyWay.find('GET', '/foo/bac,1ea')).toBeTruthy()
})

test('issue-62 - escape chars', () => {
  const findMyWay = FindMyWay()

  expect.assertions(2)

  findMyWay.get('/foo/:param(\\([a-f0-9]{3}\\))', noop)

  expect(findMyWay.find('GET', '/foo/abc')).toBeFalsy()
  expect(findMyWay.find('GET', '/foo/(abc)', {})).toBeTruthy()
})
