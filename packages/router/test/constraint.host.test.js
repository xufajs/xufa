import FindMyWay from '../index.js';
const alpha = () => { }
const beta = () => { }
const gamma = () => { }

test('A route supports multiple host constraints', () => {
  expect.assertions(4)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/', {}, alpha)
  findMyWay.on('GET', '/', { constraints: { host: 'fastify.io' } }, beta)
  findMyWay.on('GET', '/', { constraints: { host: 'example.com' } }, gamma)

  expect(findMyWay.find('GET', '/', {}).handler).toBe(alpha)
  expect(findMyWay.find('GET', '/', { host: 'something-else.io' }).handler).toBe(alpha)
  expect(findMyWay.find('GET', '/', { host: 'fastify.io' }).handler).toBe(beta)
  expect(findMyWay.find('GET', '/', { host: 'example.com' }).handler).toBe(gamma)
})

test('A route supports wildcard host constraints', () => {
  expect.assertions(4)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/', { constraints: { host: 'fastify.io' } }, beta)
  findMyWay.on('GET', '/', { constraints: { host: /.*\.fastify\.io/ } }, gamma)

  expect(findMyWay.find('GET', '/', { host: 'fastify.io' }).handler).toBe(beta)
  expect(findMyWay.find('GET', '/', { host: 'foo.fastify.io' }).handler).toBe(gamma)
  expect(findMyWay.find('GET', '/', { host: 'bar.fastify.io' }).handler).toBe(gamma)
  expect(findMyWay.find('GET', '/', { host: 'example.com' })).toBeFalsy()
})

test('A route supports multiple host constraints (lookup)', () => {
  expect.assertions(4)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/', {}, (req, res) => {})
  findMyWay.on('GET', '/', { constraints: { host: 'fastify.io' } }, (req, res) => {
    expect(req.headers.host).toBe('fastify.io')
  })
  findMyWay.on('GET', '/', { constraints: { host: 'example.com' } }, (req, res) => {
    expect(req.headers.host).toBe('example.com')
  })
  findMyWay.on('GET', '/', { constraints: { host: /.+\.fancy\.ca/ } }, (req, res) => {
    expect(req.headers.host.endsWith('.fancy.ca')).toBeTruthy()
  })

  findMyWay.lookup({
    method: 'GET',
    url: '/',
    headers: { host: 'fastify.io' }
  })

  findMyWay.lookup({
    method: 'GET',
    url: '/',
    headers: { host: 'example.com' }
  })
  findMyWay.lookup({
    method: 'GET',
    url: '/',
    headers: { host: 'foo.fancy.ca' }
  })
  findMyWay.lookup({
    method: 'GET',
    url: '/',
    headers: { host: 'bar.fancy.ca' }
  })
})

test('A route supports up to 31 host constraints', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay()

  for (let i = 0; i < 31; i++) {
    const host = `h${i.toString().padStart(2, '0')}`
    findMyWay.on('GET', '/', { constraints: { host } }, alpha)
  }

  expect(findMyWay.find('GET', '/', { host: 'h01' }).handler).toBe(alpha)
})

test('A route throws when constraint limit exceeded', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay()

  for (let i = 0; i < 31; i++) {
    const host = `h${i.toString().padStart(2, '0')}`
    findMyWay.on('GET', '/', { constraints: { host } }, alpha)
  }

  expect(() => findMyWay.on('GET', '/', { constraints: { host: 'h31' } }, beta)).toThrow(new Error('find-my-way supports a maximum of 31 route handlers per node when there are constraints, limit reached'))
})
