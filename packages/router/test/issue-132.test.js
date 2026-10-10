import FindMyWay from '../index.js';

test('Wildcard mixed with dynamic and common prefix / 1', () => {
  expect.assertions(5)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('OPTIONS', '/*', (req, res, params) => {
    expect(req.method).toBe('OPTIONS')
  })

  findMyWay.on('GET', '/obj/params/*', (req, res, params) => {
    expect(req.method).toBe('GET')
  })

  findMyWay.on('GET', '/obj/:id', (req, res, params) => {
    expect(req.method).toBe('GET')
  })

  findMyWay.on('GET', '/obj_params/*', (req, res, params) => {
    expect(req.method).toBe('GET')
  })

  findMyWay.lookup({ method: 'OPTIONS', url: '/obj/params', headers: {} }, null)

  findMyWay.lookup({ method: 'OPTIONS', url: '/obj/params/12', headers: {} }, null)

  findMyWay.lookup({ method: 'GET', url: '/obj/params/12', headers: {} }, null)

  findMyWay.lookup({ method: 'OPTIONS', url: '/obj_params/12', headers: {} }, null)

  findMyWay.lookup({ method: 'GET', url: '/obj_params/12', headers: {} }, null)
})

test('Wildcard mixed with dynamic and common prefix / 2', () => {
  expect.assertions(6)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('OPTIONS', '/*', (req, res, params) => {
    expect(req.method).toBe('OPTIONS')
  })

  findMyWay.on('OPTIONS', '/obj/*', (req, res, params) => {
    expect(req.method).toBe('OPTIONS')
  })

  findMyWay.on('GET', '/obj/params/*', (req, res, params) => {
    expect(req.method).toBe('GET')
  })

  findMyWay.on('GET', '/obj/:id', (req, res, params) => {
    expect(req.method).toBe('GET')
  })

  findMyWay.on('GET', '/obj_params/*', (req, res, params) => {
    expect(req.method).toBe('GET')
  })

  findMyWay.lookup({ method: 'OPTIONS', url: '/obj_params/params', headers: {} }, null)

  findMyWay.lookup({ method: 'OPTIONS', url: '/obj/params', headers: {} }, null)

  findMyWay.lookup({ method: 'OPTIONS', url: '/obj/params/12', headers: {} }, null)

  findMyWay.lookup({ method: 'GET', url: '/obj/params/12', headers: {} }, null)

  findMyWay.lookup({ method: 'OPTIONS', url: '/obj_params/12', headers: {} }, null)

  findMyWay.lookup({ method: 'GET', url: '/obj_params/12', headers: {} }, null)
})
