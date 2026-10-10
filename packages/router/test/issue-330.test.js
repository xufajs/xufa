import FindMyWay from '../index.js';
import { HandlerStorage } from '../lib/constraints.js';
import { Constrainer } from '../lib/constraints.js';
import { safeDecodeURIComponent } from '../index.js';
import { version as acceptVersionStrategy } from '../lib/strategies.js';
import { httpMethod as httpMethodStrategy } from '../lib/strategies.js';
import indexModule from '../index.js';

test('OPTIONAL_PARAM_REGEXP should be considered safe', () => {
  expect.assertions(1)

  expect(() => indexModule).not.toThrow()
})

test('double colon does not define parametric node', () => {
  expect.assertions(2)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/::id', () => {})
  const route1 = findMyWay.findRoute('GET', '/::id')
  expect(route1.params).toEqual([])

  findMyWay.on('GET', '/:foo(\\d+)::bar', () => {})
  const route2 = findMyWay.findRoute('GET', '/:foo(\\d+)::bar')
  expect(route2.params).toEqual(['foo'])
})

test('case insensitive static routes', () => {
  expect.assertions(3)

  const findMyWay = FindMyWay({
    caseSensitive: false
  })

  findMyWay.on('GET', '/foo', () => {})
  findMyWay.on('GET', '/foo/bar', () => {})
  findMyWay.on('GET', '/foo/bar/baz', () => {})

  expect(findMyWay.findRoute('GET', '/FoO')).toBeTruthy()
  expect(findMyWay.findRoute('GET', '/FOo/Bar')).toBeTruthy()
  expect(findMyWay.findRoute('GET', '/fOo/Bar/bAZ')).toBeTruthy()
})

test('wildcard must be the last character in the route', () => {
  expect.assertions(3)

  const expectedError = new Error('Wildcard must be the last character in the route')

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '*', () => {})
  expect(() => findMyWay.findRoute('GET', '*1')).toThrow(expectedError)
  expect(() => findMyWay.findRoute('GET', '*/')).toThrow(expectedError)
  expect(() => findMyWay.findRoute('GET', '*?')).toThrow(expectedError)
})

test('does not find the route if maxParamLength is exceeded', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay({
    maxParamLength: 2
  })

  findMyWay.on('GET', '/:id(\\d+)', () => {})

  expect(findMyWay.find('GET', '/123')).toBe(null)
  expect(findMyWay.find('GET', '/12')).toBeTruthy()
})

test('Should check if a regex is safe to use', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay()

  // we must pass a safe regex to register the route
  // findRoute will still throws the expected assertion error if we try to access it with unsafe reggex
  findMyWay.on('GET', '/test/:id(\\d+)', () => {})

  const unSafeRegex = /(x+x+)+y/
  expect(() => findMyWay.findRoute('GET', `/test/:id(${unSafeRegex.toString()})`)).toThrow(expect.objectContaining({ message: "The regex '(/(x+x+)+y/)' is not safe!" }))
})

test('Disable safe regex check', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay({ allowUnsafeRegex: true })

  const unSafeRegex = /(x+x+)+y/
  findMyWay.on('GET', `/test2/:id(${unSafeRegex.toString()})`, () => {})
  expect(() => findMyWay.findRoute('GET', `/test2/:id(${unSafeRegex.toString()})`)).not.toThrow()
})

test('throws error if no strategy registered for constraint key', () => {
  expect.assertions(2)

  const constrainer = new Constrainer()
  const error = new Error('No strategy registered for constraint key invalid-constraint')
  expect(() => constrainer.newStoreForConstraint('invalid-constraint')).toThrow(error)
  expect(() => constrainer.validateConstraints({ 'invalid-constraint': 'foo' })).toThrow(error)
})

test('throws error if pass an undefined constraint value', () => {
  expect.assertions(1)

  const constrainer = new Constrainer()
  const error = new Error('Can\'t pass an undefined constraint value, must pass null or no key at all')
  expect(() => constrainer.validateConstraints({ key: undefined })).toThrow(error)
})

test('Constrainer.noteUsage', () => {
  expect.assertions(3)

  const constrainer = new Constrainer()
  expect(constrainer.strategiesInUse.size).toBe(0)

  constrainer.noteUsage()
  expect(constrainer.strategiesInUse.size).toBe(0)

  constrainer.noteUsage({ host: 'fastify.io' })
  expect(constrainer.strategiesInUse.size).toBe(1)
})

test('Cannot derive constraints without active strategies.', () => {
  expect.assertions(1)

  const constrainer = new Constrainer()
  const before = constrainer.deriveSync
  constrainer.buildDeriveSync()
  expect(constrainer.deriveSync).toEqual(before)
})

test('getMatchingHandler should return null if not compiled', () => {
  expect.assertions(1)

  const handlerStorage = new HandlerStorage()
  expect(handlerStorage.getMatchingHandler({ foo: 'bar' })).toBe(null)
})

test('SemVerStore version should be a string', () => {
  expect.assertions(1)

  const Storage = acceptVersionStrategy.storage

  expect(() => new Storage().set(1)).toThrow(new TypeError('Version should be a string'))
})

test('SemVerStore.maxMajor should increase automatically', () => {
  expect.assertions(3)

  const Storage = acceptVersionStrategy.storage
  const storage = new Storage()

  expect(storage.maxMajor).toBe(0)

  storage.set('2')
  expect(storage.maxMajor).toBe(2)

  storage.set('1')
  expect(storage.maxMajor).toBe(2)
})

test('SemVerStore.maxPatches should increase automatically', () => {
  expect.assertions(3)

  const Storage = acceptVersionStrategy.storage
  const storage = new Storage()

  storage.set('2.0.0')
  expect(storage.maxPatches).toEqual({ '2.0': 0 })

  storage.set('2.0.2')
  expect(storage.maxPatches).toEqual({ '2.0': 2 })

  storage.set('2.0.1')
  expect(storage.maxPatches).toEqual({ '2.0': 2 })
})

test('Major version must be a numeric value', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay()

  expect(() => findMyWay.on('GET', '/test', { constraints: { version: 'x' } }, () => {})).toThrow(new TypeError('Major version must be a numeric value'))
})

test('httpMethodStrategy storage handles set and get operations correctly', () => {
  expect.assertions(2)

  const storage = httpMethodStrategy.storage()

  expect(storage.get('foo')).toBe(null)

  storage.set('foo', { bar: 'baz' })
  expect(storage.get('foo')).toEqual({ bar: 'baz' })
})

test('if buildPrettyMeta argument is undefined, will return an object', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay()
  expect(findMyWay.buildPrettyMeta()).toEqual({})
})
