import FindMyWay from '../index.js';

test('Set method property when splitting node', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  function handler (req, res, params) {
    expect().toBeTruthy()
  }

  findMyWay.on('GET', '/health-a/health', handler)
  findMyWay.on('GET', '/health-b/health', handler)

  expect(findMyWay.prettyPrint().includes('undefined')).toBeFalsy()
})
