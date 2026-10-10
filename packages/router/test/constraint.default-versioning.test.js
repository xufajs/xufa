import FindMyWay from '../index.js';
const noop = () => { }

test('A route could support multiple versions (find) / 1', () => {
  expect.assertions(7)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/', { constraints: { version: '1.2.3' } }, noop)
  findMyWay.on('GET', '/', { constraints: { version: '3.2.0' } }, noop)

  expect(findMyWay.find('GET', '/', { version: '1.x' })).toBeTruthy()
  expect(findMyWay.find('GET', '/', { version: '1.2.3' })).toBeTruthy()
  expect(findMyWay.find('GET', '/', { version: '3.x' })).toBeTruthy()
  expect(findMyWay.find('GET', '/', { version: '3.2.0' })).toBeTruthy()
  expect(findMyWay.find('GET', '/', { version: '2.x' })).toBeFalsy()
  expect(findMyWay.find('GET', '/', { version: '2.3.4' })).toBeFalsy()
  expect(findMyWay.find('GET', '/', { version: '3.2.1' })).toBeFalsy()
})

test('A route could support multiple versions (find) / 2', () => {
  expect.assertions(7)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/test', { constraints: { version: '1.2.3' } }, noop)
  findMyWay.on('GET', '/test', { constraints: { version: '3.2.0' } }, noop)

  expect(findMyWay.find('GET', '/test', { version: '1.x' })).toBeTruthy()
  expect(findMyWay.find('GET', '/test', { version: '1.2.3' })).toBeTruthy()
  expect(findMyWay.find('GET', '/test', { version: '3.x' })).toBeTruthy()
  expect(findMyWay.find('GET', '/test', { version: '3.2.0' })).toBeTruthy()
  expect(findMyWay.find('GET', '/test', { version: '2.x' })).toBeFalsy()
  expect(findMyWay.find('GET', '/test', { version: '2.3.4' })).toBeFalsy()
  expect(findMyWay.find('GET', '/test', { version: '3.2.1' })).toBeFalsy()
})

test('A route could support multiple versions (find) / 3', () => {
  expect.assertions(10)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/test/:id/hello', { constraints: { version: '1.2.3' } }, noop)
  findMyWay.on('GET', '/test/:id/hello', { constraints: { version: '3.2.0' } }, noop)
  findMyWay.on('GET', '/test/name/hello', { constraints: { version: '4.0.0' } }, noop)

  expect(findMyWay.find('GET', '/test/1234/hello', { version: '1.x' })).toBeTruthy()
  expect(findMyWay.find('GET', '/test/1234/hello', { version: '1.2.3' })).toBeTruthy()
  expect(findMyWay.find('GET', '/test/1234/hello', { version: '3.x' })).toBeTruthy()
  expect(findMyWay.find('GET', '/test/1234/hello', { version: '3.2.0' })).toBeTruthy()
  expect(findMyWay.find('GET', '/test/name/hello', { version: '4.x' })).toBeTruthy()
  expect(findMyWay.find('GET', '/test/name/hello', { version: '3.x' })).toBeTruthy()
  expect(findMyWay.find('GET', '/test/1234/hello', { version: '2.x' })).toBeFalsy()
  expect(findMyWay.find('GET', '/test/1234/hello', { version: '2.3.4' })).toBeFalsy()
  expect(findMyWay.find('GET', '/test/1234/hello', { version: '3.2.1' })).toBeFalsy()
  expect(findMyWay.find('GET', '/test/1234/hello', { version: '4.x' })).toBeFalsy()
})

test('A route could support multiple versions (find) / 4', () => {
  expect.assertions(8)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/test/*', { constraints: { version: '1.2.3' } }, noop)
  findMyWay.on('GET', '/test/hello', { constraints: { version: '3.2.0' } }, noop)

  expect(findMyWay.find('GET', '/test/1234/hello', { version: '1.x' })).toBeTruthy()
  expect(findMyWay.find('GET', '/test/1234/hello', { version: '1.2.3' })).toBeTruthy()
  expect(findMyWay.find('GET', '/test/hello', { version: '3.x' })).toBeTruthy()
  expect(findMyWay.find('GET', '/test/hello', { version: '3.2.0' })).toBeTruthy()
  expect(findMyWay.find('GET', '/test/1234/hello', { version: '3.2.0' })).toBeFalsy()
  expect(findMyWay.find('GET', '/test/1234/hello', { version: '3.x' })).toBeFalsy()
  expect(findMyWay.find('GET', '/test/1234/hello', { version: '2.x' })).toBeFalsy()
  expect(findMyWay.find('GET', '/test/hello', { version: '2.x' })).toBeFalsy()
})

test('A route could support multiple versions (find) / 5', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/', { constraints: { version: '1.2.3' } }, () => false)
  findMyWay.on('GET', '/', { constraints: { version: '3.2.0' } }, () => true)

  expect(findMyWay.find('GET', '/', { version: '*' }).handler()).toBeTruthy()
})

test('Find with a version but without versioned routes', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/', noop)

  expect(findMyWay.find('GET', '/', { version: '1.x' })).toBeFalsy()
})

test('A route could support multiple versions (lookup)', () => {
  expect.assertions(7)

  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      const versions = ['2.x', '2.3.4', '3.2.1']
      expect(versions.indexOf(req.headers['accept-version']) > -1).toBeTruthy()
    }
  })

  findMyWay.on('GET', '/', { constraints: { version: '1.2.3' } }, (req, res) => {
    const versions = ['1.x', '1.2.3']
    expect(versions.indexOf(req.headers['accept-version']) > -1).toBeTruthy()
  })

  findMyWay.on('GET', '/', { constraints: { version: '3.2.0' } }, (req, res) => {
    const versions = ['3.x', '3.2.0']
    expect(versions.indexOf(req.headers['accept-version']) > -1).toBeTruthy()
  })

  findMyWay.lookup({
    method: 'GET',
    url: '/',
    headers: { 'accept-version': '1.x' }
  }, null)

  findMyWay.lookup({
    method: 'GET',
    url: '/',
    headers: { 'accept-version': '1.2.3' }
  }, null)

  findMyWay.lookup({
    method: 'GET',
    url: '/',
    headers: { 'accept-version': '3.x' }
  }, null)

  findMyWay.lookup({
    method: 'GET',
    url: '/',
    headers: { 'accept-version': '3.2.0' }
  }, null)

  findMyWay.lookup({
    method: 'GET',
    url: '/',
    headers: { 'accept-version': '2.x' }
  }, null)

  findMyWay.lookup({
    method: 'GET',
    url: '/',
    headers: { 'accept-version': '2.3.4' }
  }, null)

  findMyWay.lookup({
    method: 'GET',
    url: '/',
    headers: { 'accept-version': '3.2.1' }
  }, null)
})

test('It should always choose the highest version of a route', () => {
  expect.assertions(3)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/', { constraints: { version: '2.3.0' } }, (req, res) => {
    expect.fail('We should not be here')
  })

  findMyWay.on('GET', '/', { constraints: { version: '2.4.0' } }, (req, res) => {
    expect('Yeah!').toBeTruthy()
  })

  findMyWay.on('GET', '/', { constraints: { version: '3.3.0' } }, (req, res) => {
    expect('Yeah!').toBeTruthy()
  })

  findMyWay.on('GET', '/', { constraints: { version: '3.2.0' } }, (req, res) => {
    expect.fail('We should not be here')
  })

  findMyWay.on('GET', '/', { constraints: { version: '3.2.2' } }, (req, res) => {
    expect.fail('We should not be here')
  })

  findMyWay.on('GET', '/', { constraints: { version: '4.4.0' } }, (req, res) => {
    expect.fail('We should not be here')
  })

  findMyWay.on('GET', '/', { constraints: { version: '4.3.2' } }, (req, res) => {
    expect('Yeah!').toBeTruthy()
  })

  findMyWay.lookup({
    method: 'GET',
    url: '/',
    headers: { 'accept-version': '2.x' }
  }, null)

  findMyWay.lookup({
    method: 'GET',
    url: '/',
    headers: { 'accept-version': '3.x' }
  }, null)

  findMyWay.lookup({
    method: 'GET',
    url: '/',
    headers: { 'accept-version': '4.3.x' }
  }, null)
})

test('Declare the same route with and without version', () => {
  expect.assertions(2)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/', noop)
  findMyWay.on('GET', '/', { constraints: { version: '1.2.0' } }, noop)

  expect(findMyWay.find('GET', '/', { version: '1.x' })).toBeTruthy()
  expect(findMyWay.find('GET', '/', {})).toBeTruthy()
})

test('It should throw if you declare multiple times the same route', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/', { constraints: { version: '1.2.3' } }, noop)

  try {
    findMyWay.on('GET', '/', { constraints: { version: '1.2.3' } }, noop)
    expect.fail('It should throw')
  } catch (err) {
    expect(err.message).toBe('Method \'GET\' already declared for route \'/\' with constraints \'{"version":"1.2.3"}\'')
  }
})

test('Versioning won\'t work if there are no versioned routes', () => {
  expect.assertions(2)

  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('We should not be here')
    }
  })

  findMyWay.on('GET', '/', (req, res) => {
    expect('Yeah!').toBeTruthy()
  })

  findMyWay.lookup({
    method: 'GET',
    url: '/',
    headers: { 'accept-version': '2.x' }
  }, null)

  findMyWay.lookup({
    method: 'GET',
    url: '/'
  }, null)
})

test('Unversioned routes aren\'t triggered when unknown versions are requested', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect('We should be here').toBeTruthy()
    }
  })

  findMyWay.on('GET', '/', (req, res) => {
    expect.fail('unversioned route shouldnt be hit!')
  })
  findMyWay.on('GET', '/', { constraints: { version: '1.0.0' } }, (req, res) => {
    expect.fail('versioned route shouldnt be hit for wrong version!')
  })

  findMyWay.lookup({
    method: 'GET',
    url: '/',
    headers: { 'accept-version': '2.x' }
  }, null)
})
