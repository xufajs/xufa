import FindMyWay from '../index.js';

test('Parametric and static with shared prefix / 1', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/woo', (req, res, params) => {
    expect.fail('we should not be here')
  })

  findMyWay.on('GET', '/:param', (req, res, params) => {
    expect(params.param).toBe('winter')
  })

  findMyWay.lookup({ method: 'GET', url: '/winter', headers: {} }, null)
})

test('Parametric and static with shared prefix / 2', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/woo', (req, res, params) => {
    expect('we should be here').toBeTruthy()
  })

  findMyWay.on('GET', '/:param', (req, res, params) => {
    expect.fail('we should not be here')
  })

  findMyWay.lookup({ method: 'GET', url: '/woo', headers: {} }, null)
})

test('Parametric and static with shared prefix (nested)', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect('We should be here').toBeTruthy()
    }
  })

  findMyWay.on('GET', '/woo', (req, res, params) => {
    expect.fail('we should not be here')
  })

  findMyWay.on('GET', '/:param', (req, res, params) => {
    expect.fail('we should not be here')
  })

  findMyWay.lookup({ method: 'GET', url: '/winter/coming', headers: {} }, null)
})

test('Parametric and static with shared prefix and different suffix', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('We should not be here')
    }
  })

  findMyWay.on('GET', '/example/shared/nested/test', (req, res, params) => {
    expect.fail('We should not be here')
  })

  findMyWay.on('GET', '/example/:param/nested/other', (req, res, params) => {
    expect('We should be here').toBeTruthy()
  })

  findMyWay.lookup({ method: 'GET', url: '/example/shared/nested/other', headers: {} }, null)
})

test('Parametric and static with shared prefix (with wildcard)', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/woo', (req, res, params) => {
    expect.fail('we should not be here')
  })

  findMyWay.on('GET', '/:param', (req, res, params) => {
    expect(params.param).toBe('winter')
  })

  findMyWay.on('GET', '/*', (req, res, params) => {
    expect.fail('we should not be here')
  })

  findMyWay.lookup({ method: 'GET', url: '/winter', headers: {} }, null)
})

test('Parametric and static with shared prefix (nested with wildcard)', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/woo', (req, res, params) => {
    expect.fail('we should not be here')
  })

  findMyWay.on('GET', '/:param', (req, res, params) => {
    expect.fail('we should not be here')
  })

  findMyWay.on('GET', '/*', (req, res, params) => {
    expect(params['*']).toBe('winter/coming')
  })

  findMyWay.lookup({ method: 'GET', url: '/winter/coming', headers: {} }, null)
})

test('Parametric and static with shared prefix (nested with split)', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('we should not be here')
    }
  })

  findMyWay.on('GET', '/woo', (req, res, params) => {
    expect.fail('we should not be here')
  })

  findMyWay.on('GET', '/:param', (req, res, params) => {
    expect(params.param).toBe('winter')
  })

  findMyWay.on('GET', '/wo', (req, res, params) => {
    expect.fail('we should not be here')
  })

  findMyWay.lookup({ method: 'GET', url: '/winter', headers: {} }, null)
})
