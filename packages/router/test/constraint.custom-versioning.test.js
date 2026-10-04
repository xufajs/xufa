'use strict'


const FindMyWay = require('..')
const noop = () => { }

const customVersioning = {
  name: 'version',
  // storage factory
  storage: function () {
    let versions = {}
    return {
      get: (version) => { return versions[version] || null },
      set: (version, store) => { versions[version] = store },
      del: (version) => { delete versions[version] },
      empty: () => { versions = {} }
    }
  },
  deriveConstraint: (req, ctx) => {
    return req.headers.accept
  }
}

test('A route could support multiple versions (find) / 1', () => {
  expect.assertions(5)

  const findMyWay = FindMyWay({ constraints: { version: customVersioning } })

  findMyWay.on('GET', '/', { constraints: { version: 'application/vnd.example.api+json;version=2' } }, noop)
  findMyWay.on('GET', '/', { constraints: { version: 'application/vnd.example.api+json;version=3' } }, noop)

  expect(findMyWay.find('GET', '/', { version: 'application/vnd.example.api+json;version=2' })).toBeTruthy()
  expect(findMyWay.find('GET', '/', { version: 'application/vnd.example.api+json;version=3' })).toBeTruthy()
  expect(findMyWay.find('GET', '/', { version: 'application/vnd.example.api+json;version=4' })).toBeFalsy()
  expect(findMyWay.find('GET', '/', { version: 'application/vnd.example.api+json;version=5' })).toBeFalsy()
  expect(findMyWay.find('GET', '/', { version: 'application/vnd.example.api+json;version=6' })).toBeFalsy()
})

test('A route could support multiple versions (find) / 1 (add strategy outside constructor)', () => {
  expect.assertions(5)

  const findMyWay = FindMyWay()

  findMyWay.addConstraintStrategy(customVersioning)

  findMyWay.on('GET', '/', { constraints: { version: 'application/vnd.example.api+json;version=2' } }, noop)
  findMyWay.on('GET', '/', { constraints: { version: 'application/vnd.example.api+json;version=3' } }, noop)

  expect(findMyWay.find('GET', '/', { version: 'application/vnd.example.api+json;version=2' })).toBeTruthy()
  expect(findMyWay.find('GET', '/', { version: 'application/vnd.example.api+json;version=3' })).toBeTruthy()
  expect(findMyWay.find('GET', '/', { version: 'application/vnd.example.api+json;version=4' })).toBeFalsy()
  expect(findMyWay.find('GET', '/', { version: 'application/vnd.example.api+json;version=5' })).toBeFalsy()
  expect(findMyWay.find('GET', '/', { version: 'application/vnd.example.api+json;version=6' })).toBeFalsy()
})

test('Overriding default strategies uses the custom deriveConstraint function', () => {
  expect.assertions(2)

  const findMyWay = FindMyWay({ constraints: { version: customVersioning } })

  findMyWay.on('GET', '/', { constraints: { version: 'application/vnd.example.api+json;version=2' } }, (req, res, params) => {
    expect(req.headers.accept).toBe('application/vnd.example.api+json;version=2')
  })

  findMyWay.on('GET', '/', { constraints: { version: 'application/vnd.example.api+json;version=3' } }, (req, res, params) => {
    expect(req.headers.accept).toBe('application/vnd.example.api+json;version=3')
  })

  findMyWay.lookup({
    method: 'GET',
    url: '/',
    headers: { accept: 'application/vnd.example.api+json;version=2' }
  })
  findMyWay.lookup({
    method: 'GET',
    url: '/',
    headers: { accept: 'application/vnd.example.api+json;version=3' }
  })
})

test('Overriding default strategies uses the custom deriveConstraint function (add strategy outside constructor)', () => {
  expect.assertions(2)

  const findMyWay = FindMyWay()

  findMyWay.addConstraintStrategy(customVersioning)

  findMyWay.on('GET', '/', { constraints: { version: 'application/vnd.example.api+json;version=2' } }, (req, res, params) => {
    expect(req.headers.accept).toBe('application/vnd.example.api+json;version=2')
  })

  findMyWay.on('GET', '/', { constraints: { version: 'application/vnd.example.api+json;version=3' } }, (req, res, params) => {
    expect(req.headers.accept).toBe('application/vnd.example.api+json;version=3')
  })

  findMyWay.lookup({
    method: 'GET',
    url: '/',
    headers: { accept: 'application/vnd.example.api+json;version=2' }
  })
  findMyWay.lookup({
    method: 'GET',
    url: '/',
    headers: { accept: 'application/vnd.example.api+json;version=3' }
  })
})

test('Overriding custom strategies throws as error (add strategy outside constructor)', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay()

  findMyWay.addConstraintStrategy(customVersioning)

  expect(() => findMyWay.addConstraintStrategy(customVersioning)).toThrow(new Error('There already exists a custom constraint with the name version.'))
})

test('Overriding default strategies after defining a route with constraint', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/', { constraints: { host: 'fastify.io', version: '1.0.0' } }, () => {})

  expect(() => findMyWay.addConstraintStrategy(customVersioning)).toThrow(new Error('There already exists a route with version constraint.'))
})
