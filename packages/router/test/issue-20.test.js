import FindMyWay from '../index.js';

test('Standard case', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be here')
    }
  })

  findMyWay.on('GET', '/a/:param', (req, res, params) => {
    expect(params.param).toBe('perfectly-fine-route')
  })

  findMyWay.lookup({ method: 'GET', url: '/a/perfectly-fine-route', headers: {} }, null)
})

test('Should be 404 / 1', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect('Everything good').toBeTruthy()
    }
  })

  findMyWay.on('GET', '/a/:param', (req, res, params) => {
    expect.fail('We should not be here')
  })

  findMyWay.lookup({ method: 'GET', url: '/a', headers: {} }, null)
})

test('Should be 404 / 2', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect('Everything good').toBeTruthy()
    }
  })

  findMyWay.on('GET', '/a/:param', (req, res, params) => {
    expect.fail('We should not be here')
  })

  findMyWay.lookup({ method: 'GET', url: '/a-non-existing-route', headers: {} }, null)
})

test('Should be 404 / 3', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect('Everything good').toBeTruthy()
    }
  })

  findMyWay.on('GET', '/a/:param', (req, res, params) => {
    expect.fail('We should not be here')
  })

  findMyWay.lookup({ method: 'GET', url: '/a//', headers: {} }, null)
})

test('Should get an empty parameter', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('We should not be here')
    }
  })

  findMyWay.on('GET', '/a/:param', (req, res, params) => {
    expect(params.param).toBe('')
  })

  findMyWay.lookup({ method: 'GET', url: '/a/', headers: {} }, null)
})
