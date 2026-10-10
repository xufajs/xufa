import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const rfdc = require('rfdc')({ proto: true })
import FindMyWay from '../index.js';

function equalRouters (t, router1, router2) {
  expect(router1._opts).toEqual(router2._opts)
  expect(router1.routes).toEqual(router2.routes)
  expect(JSON.stringify(router1.trees)).toEqual(JSON.stringify(router2.trees))

  expect(router1.constrainer.strategies).toEqual(router2.constrainer.strategies)
  expect(router1.constrainer.strategiesInUse).toEqual(router2.constrainer.strategiesInUse)
  expect(router1.constrainer.asyncStrategiesInUse).toEqual(router2.constrainer.asyncStrategiesInUse)
}

test('hasRoute returns false if there is no routes', (ctx) => {
  expect.assertions(7)

  const findMyWay = FindMyWay()
  const fundMyWayClone = rfdc(findMyWay)

  const hasRoute = findMyWay.hasRoute('GET', '/example')
  expect(hasRoute).toBe(false)

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('hasRoute returns true for a static route', (ctx) => {
  expect.assertions(7)

  const findMyWay = FindMyWay()
  findMyWay.on('GET', '/example', () => {})

  const fundMyWayClone = rfdc(findMyWay)

  const hasRoute = findMyWay.hasRoute('GET', '/example')
  expect(hasRoute).toBe(true)

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('hasRoute returns false for a static route', (ctx) => {
  expect.assertions(7)

  const findMyWay = FindMyWay()
  findMyWay.on('GET', '/example', () => {})

  const fundMyWayClone = rfdc(findMyWay)

  const hasRoute = findMyWay.hasRoute('GET', '/example1')
  expect(hasRoute).toBe(false)

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('hasRoute returns true for a parametric route', (ctx) => {
  expect.assertions(7)

  const findMyWay = FindMyWay()
  findMyWay.on('GET', '/:param', () => {})

  const fundMyWayClone = rfdc(findMyWay)

  const hasRoute = findMyWay.hasRoute('GET', '/:param')
  expect(hasRoute).toBe(true)

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('hasRoute returns false for a parametric route', (ctx) => {
  expect.assertions(7)

  const findMyWay = FindMyWay()
  findMyWay.on('GET', '/foo/:param', () => {})

  const fundMyWayClone = rfdc(findMyWay)

  const hasRoute = findMyWay.hasRoute('GET', '/bar/:param')
  expect(hasRoute).toBe(false)

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('hasRoute returns true for a parametric route with static suffix', (ctx) => {
  expect.assertions(7)

  const findMyWay = FindMyWay()
  findMyWay.on('GET', '/:param-static', () => {})

  const fundMyWayClone = rfdc(findMyWay)

  const hasRoute = findMyWay.hasRoute('GET', '/:param-static')
  expect(hasRoute).toBe(true)

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('hasRoute returns false for a parametric route with static suffix', (ctx) => {
  expect.assertions(7)

  const findMyWay = FindMyWay()
  findMyWay.on('GET', '/:param-static1', () => {})

  const fundMyWayClone = rfdc(findMyWay)

  const hasRoute = findMyWay.hasRoute('GET', '/:param-static2')
  expect(hasRoute).toBe(false)

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('hasRoute returns true even if a param name different', (ctx) => {
  expect.assertions(7)

  const findMyWay = FindMyWay()
  findMyWay.on('GET', '/:param1', () => {})

  const fundMyWayClone = rfdc(findMyWay)

  const hasRoute = findMyWay.hasRoute('GET', '/:param2')
  expect(hasRoute).toBe(true)

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('hasRoute returns true for a multi-parametric route', (ctx) => {
  expect.assertions(7)

  const findMyWay = FindMyWay()
  findMyWay.on('GET', '/:param1-:param2', () => {})

  const fundMyWayClone = rfdc(findMyWay)

  const hasRoute = findMyWay.hasRoute('GET', '/:param1-:param2')
  expect(hasRoute).toBe(true)

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('hasRoute returns false for a multi-parametric route', (ctx) => {
  expect.assertions(7)

  const findMyWay = FindMyWay()
  findMyWay.on('GET', '/foo/:param1-:param2/bar1', () => {})

  const fundMyWayClone = rfdc(findMyWay)

  const hasRoute = findMyWay.hasRoute('GET', '/foo/:param1-:param2/bar2')
  expect(hasRoute).toBe(false)

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('hasRoute returns true for a regexp route', (ctx) => {
  expect.assertions(7)

  const findMyWay = FindMyWay()
  findMyWay.on('GET', '/:param(^\\d+$)', () => {})

  const fundMyWayClone = rfdc(findMyWay)

  const hasRoute = findMyWay.hasRoute('GET', '/:param(^\\d+$)')
  expect(hasRoute).toBe(true)

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('hasRoute returns false for a regexp route', (ctx) => {
  expect.assertions(7)

  const findMyWay = FindMyWay()
  findMyWay.on('GET', '/:file(^\\S+).png', () => {})

  const fundMyWayClone = rfdc(findMyWay)

  const hasRoute = findMyWay.hasRoute('GET', '/:file(^\\D+).png')
  expect(hasRoute).toBe(false)

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('hasRoute returns true for a wildcard route', (ctx) => {
  expect.assertions(7)

  const findMyWay = FindMyWay()
  findMyWay.on('GET', '/example/*', () => {})

  const fundMyWayClone = rfdc(findMyWay)

  const hasRoute = findMyWay.hasRoute('GET', '/example/*')
  expect(hasRoute).toBe(true)

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('hasRoute returns false for a wildcard route', (ctx) => {
  expect.assertions(7)

  const findMyWay = FindMyWay()
  findMyWay.on('GET', '/foo1/*', () => {})

  const fundMyWayClone = rfdc(findMyWay)

  const hasRoute = findMyWay.hasRoute('GET', '/foo2/*')
  expect(hasRoute).toBe(false)

  equalRouters(ctx, findMyWay, fundMyWayClone)
})
