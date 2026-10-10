import FindMyWay from '../index.js';
const alpha = () => { }
const beta = () => { }
const gamma = () => { }

test('A route could support multiple host constraints while versioned', () => {
  expect.assertions(6)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/', { constraints: { host: 'fastify.io', version: '1.1.0' } }, beta)
  findMyWay.on('GET', '/', { constraints: { host: 'fastify.io', version: '2.1.0' } }, gamma)

  expect(findMyWay.find('GET', '/', { host: 'fastify.io', version: '1.x' }).handler).toBe(beta)
  expect(findMyWay.find('GET', '/', { host: 'fastify.io', version: '1.1.x' }).handler).toBe(beta)
  expect(findMyWay.find('GET', '/', { host: 'fastify.io', version: '2.x' }).handler).toBe(gamma)
  expect(findMyWay.find('GET', '/', { host: 'fastify.io', version: '2.1.x' }).handler).toBe(gamma)
  expect(findMyWay.find('GET', '/', { host: 'fastify.io', version: '3.x' })).toBeFalsy()
  expect(findMyWay.find('GET', '/', { host: 'something-else.io', version: '1.x' })).toBeFalsy()
})

test('Constrained routes are matched before unconstrainted routes when the constrained route is added last', () => {
  expect.assertions(3)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/', {}, alpha)
  findMyWay.on('GET', '/', { constraints: { host: 'fastify.io' } }, beta)

  expect(findMyWay.find('GET', '/', {}).handler).toBe(alpha)
  expect(findMyWay.find('GET', '/', { host: 'fastify.io' }).handler).toBe(beta)
  expect(findMyWay.find('GET', '/', { host: 'example.com' }).handler).toBe(alpha)
})

test('Constrained routes are matched before unconstrainted routes when the constrained route is added first', () => {
  expect.assertions(3)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/', { constraints: { host: 'fastify.io' } }, beta)
  findMyWay.on('GET', '/', {}, alpha)

  expect(findMyWay.find('GET', '/', {}).handler).toBe(alpha)
  expect(findMyWay.find('GET', '/', { host: 'fastify.io' }).handler).toBe(beta)
  expect(findMyWay.find('GET', '/', { host: 'example.com' }).handler).toBe(alpha)
})

test('Routes with multiple constraints are matched before routes with one constraint when the doubly-constrained route is added last', () => {
  expect.assertions(3)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/', { constraints: { host: 'fastify.io' } }, alpha)
  findMyWay.on('GET', '/', { constraints: { host: 'fastify.io', version: '1.0.0' } }, beta)

  expect(findMyWay.find('GET', '/', { host: 'fastify.io' }).handler).toBe(alpha)
  expect(findMyWay.find('GET', '/', { host: 'fastify.io', version: '1.0.0' }).handler).toBe(beta)
  expect(findMyWay.find('GET', '/', { host: 'fastify.io', version: '2.0.0' })).toBe(null)
})

test('Routes with multiple constraints are matched before routes with one constraint when the doubly-constrained route is added first', () => {
  expect.assertions(3)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/', { constraints: { host: 'fastify.io', version: '1.0.0' } }, beta)
  findMyWay.on('GET', '/', { constraints: { host: 'fastify.io' } }, alpha)

  expect(findMyWay.find('GET', '/', { host: 'fastify.io' }).handler).toBe(alpha)
  expect(findMyWay.find('GET', '/', { host: 'fastify.io', version: '1.0.0' }).handler).toBe(beta)
  expect(findMyWay.find('GET', '/', { host: 'fastify.io', version: '2.0.0' })).toBe(null)
})

test('Routes with multiple constraints are matched before routes with one constraint before unconstrained routes', () => {
  expect.assertions(3)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/', { constraints: { host: 'fastify.io', version: '1.0.0' } }, beta)
  findMyWay.on('GET', '/', { constraints: { host: 'fastify.io' } }, alpha)
  findMyWay.on('GET', '/', { constraints: {} }, gamma)

  expect(findMyWay.find('GET', '/', { host: 'fastify.io', version: '1.0.0' }).handler).toBe(beta)
  expect(findMyWay.find('GET', '/', { host: 'fastify.io', version: '2.0.0' })).toBe(null)
  expect(findMyWay.find('GET', '/', { host: 'example.io' }).handler).toBe(gamma)
})

test('Has constraint strategy method test', () => {
  expect.assertions(6)

  const findMyWay = FindMyWay()

  expect(findMyWay.hasConstraintStrategy('version')).toEqual(false)
  expect(findMyWay.hasConstraintStrategy('host')).toEqual(false)

  findMyWay.on('GET', '/', { constraints: { host: 'fastify.io' } }, () => {})

  expect(findMyWay.hasConstraintStrategy('version')).toEqual(false)
  expect(findMyWay.hasConstraintStrategy('host')).toEqual(true)

  findMyWay.on('GET', '/', { constraints: { host: 'fastify.io', version: '1.0.0' } }, () => {})

  expect(findMyWay.hasConstraintStrategy('version')).toEqual(true)
  expect(findMyWay.hasConstraintStrategy('host')).toEqual(true)
})
