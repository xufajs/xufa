import FindMyWay from '../index.js';

test('If onBadUrl is defined, then a bad url should be handled differently (find)', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    },
    onBadUrl: (path, req, res) => {
      expect(path).toBe('/%world')
    }
  })

  findMyWay.on('GET', '/hello/:id', (req, res) => {
    expect.fail('Should not be here')
  })

  const handle = findMyWay.find('GET', '/hello/%world')
  expect(handle).not.toEqual(null)
})

test('If onBadUrl is defined, then a bad url should be handled differently (lookup)', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    },
    onBadUrl: (path, req, res) => {
      expect(path).toBe('/hello/%world')
    }
  })

  findMyWay.on('GET', '/hello/:id', (req, res) => {
    expect.fail('Should not be here')
  })

  findMyWay.lookup({ method: 'GET', url: '/hello/%world', headers: {} }, null)
})

test('If onBadUrl is not defined, then we should call the defaultRoute (find)', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/hello/:id', (req, res) => {
    expect.fail('Should not be here')
  })

  const handle = findMyWay.find('GET', '/hello/%world')
  expect(handle).toBe(null)
})

test('If onBadUrl is not defined, then we should call the defaultRoute (lookup)', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect('Everything fine').toBeTruthy()
    }
  })

  findMyWay.on('GET', '/hello/:id', (req, res) => {
    expect.fail('Should not be here')
  })

  findMyWay.lookup({ method: 'GET', url: '/hello/%world', headers: {} }, null)
})
