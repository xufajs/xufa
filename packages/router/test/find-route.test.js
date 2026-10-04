'use strict'


const rfdc = require('rfdc')({ proto: true })
const FindMyWay = require('..')

function equalRouters (t, router1, router2) {
  expect(router1._opts).toEqual(router2._opts)
  expect(router1.routes).toEqual(router2.routes)
  expect(JSON.stringify(router1.trees)).toEqual(JSON.stringify(router2.trees))

  expect(router1.constrainer.strategies).toEqual(router2.constrainer.strategies)
  expect(router1.constrainer.strategiesInUse).toEqual(router2.constrainer.strategiesInUse)
  expect(router1.constrainer.asyncStrategiesInUse).toEqual(router2.constrainer.asyncStrategiesInUse)
}

test('findRoute returns null if there is no routes', (ctx) => {
  expect.assertions(7)

  const findMyWay = FindMyWay()
  const fundMyWayClone = rfdc(findMyWay)

  const route = findMyWay.findRoute('GET', '/example')
  expect(route).toBe(null)

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('findRoute returns handler and store for a static route', (ctx) => {
  expect.assertions(9)

  const findMyWay = FindMyWay()

  const handler = () => {}
  const store = { hello: 'world' }
  findMyWay.on('GET', '/example', handler, store)

  const fundMyWayClone = rfdc(findMyWay)

  const route = findMyWay.findRoute('GET', '/example')
  expect(route.handler).toBe(handler)
  expect(route.store).toBe(store)
  expect(route.params).toEqual([])

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('findRoute returns null for a static route', (ctx) => {
  expect.assertions(7)

  const findMyWay = FindMyWay()

  const handler = () => {}
  findMyWay.on('GET', '/example', handler)

  const fundMyWayClone = rfdc(findMyWay)

  const route = findMyWay.findRoute('GET', '/example1')
  expect(route).toBe(null)

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('findRoute returns handler and params for a parametric route', (ctx) => {
  expect.assertions(8)

  const findMyWay = FindMyWay()

  const handler = () => {}
  findMyWay.on('GET', '/:param', handler)

  const fundMyWayClone = rfdc(findMyWay)

  const route = findMyWay.findRoute('GET', '/:param')
  expect(route.handler).toBe(handler)
  expect(route.params).toEqual(['param'])

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('findRoute returns null for a parametric route', (ctx) => {
  expect.assertions(7)

  const findMyWay = FindMyWay()

  const handler = () => {}
  findMyWay.on('GET', '/foo/:param', handler)

  const fundMyWayClone = rfdc(findMyWay)

  const route = findMyWay.findRoute('GET', '/bar/:param')
  expect(route).toBe(null)

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('findRoute returns handler and params for a parametric route with static suffix', (ctx) => {
  expect.assertions(8)

  const findMyWay = FindMyWay()

  const handler = () => {}
  findMyWay.on('GET', '/:param-static', handler)

  const fundMyWayClone = rfdc(findMyWay)

  const route = findMyWay.findRoute('GET', '/:param-static')
  expect(route.handler).toBe(handler)
  expect(route.params).toEqual(['param'])

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('findRoute returns null for a parametric route with static suffix', (ctx) => {
  expect.assertions(7)

  const findMyWay = FindMyWay()
  findMyWay.on('GET', '/:param-static1', () => {})

  const fundMyWayClone = rfdc(findMyWay)

  const route = findMyWay.findRoute('GET', '/:param-static2')
  expect(route).toBe(null)

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('findRoute returns handler and original params even if a param name different', (ctx) => {
  expect.assertions(8)

  const findMyWay = FindMyWay()

  const handler = () => {}
  findMyWay.on('GET', '/:param1', handler)

  const fundMyWayClone = rfdc(findMyWay)

  const route = findMyWay.findRoute('GET', '/:param2')
  expect(route.handler).toBe(handler)
  expect(route.params).toEqual(['param1'])

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('findRoute returns handler and params for a multi-parametric route', (ctx) => {
  expect.assertions(8)

  const findMyWay = FindMyWay()

  const handler = () => {}
  findMyWay.on('GET', '/:param1-:param2', handler)

  const fundMyWayClone = rfdc(findMyWay)

  const route = findMyWay.findRoute('GET', '/:param1-:param2')
  expect(route.handler).toBe(handler)
  expect(route.params).toEqual(['param1', 'param2'])

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('findRoute returns null for a multi-parametric route', (ctx) => {
  expect.assertions(7)

  const findMyWay = FindMyWay()
  findMyWay.on('GET', '/foo/:param1-:param2/bar1', () => {})

  const fundMyWayClone = rfdc(findMyWay)

  const route = findMyWay.findRoute('GET', '/foo/:param1-:param2/bar2')
  expect(route).toBe(null)

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('findRoute returns handler for a regex + non-regex multi-param route', (ctx) => {
  expect.assertions(8)

  const findMyWay = FindMyWay()

  const handler = () => {}
  findMyWay.on('GET', '/:name(\\d+)-:other', handler)

  const fundMyWayClone = rfdc(findMyWay)

  const route = findMyWay.findRoute('GET', '/:name(\\d+)-:other')
  expect(route.handler).toBe(handler)
  expect(route.params).toEqual(['name', 'other'])

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('findRoute returns handler and regexp param for a regexp route', (ctx) => {
  expect.assertions(8)

  const findMyWay = FindMyWay()

  const handler = () => {}
  findMyWay.on('GET', '/:param(^\\d+$)', handler)

  const fundMyWayClone = rfdc(findMyWay)

  const route = findMyWay.findRoute('GET', '/:param(^\\d+$)')
  expect(route.handler).toBe(handler)
  expect(route.params).toEqual(['param'])

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('findRoute returns null for a regexp route', (ctx) => {
  expect.assertions(7)

  const findMyWay = FindMyWay()
  findMyWay.on('GET', '/:file(^\\S+).png', () => {})

  const fundMyWayClone = rfdc(findMyWay)

  const route = findMyWay.findRoute('GET', '/:file(^\\D+).png')
  expect(route).toBe(null)

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('findRoute returns handler and wildcard param for a wildcard route', (ctx) => {
  expect.assertions(8)

  const findMyWay = FindMyWay()

  const handler = () => {}
  findMyWay.on('GET', '/example/*', handler)

  const fundMyWayClone = rfdc(findMyWay)

  const route = findMyWay.findRoute('GET', '/example/*')
  expect(route.handler).toBe(handler)
  expect(route.params).toEqual(['*'])

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('findRoute returns null for a wildcard route', (ctx) => {
  expect.assertions(7)

  const findMyWay = FindMyWay()
  findMyWay.on('GET', '/foo1/*', () => {})

  const fundMyWayClone = rfdc(findMyWay)

  const route = findMyWay.findRoute('GET', '/foo2/*')
  expect(route).toBe(null)

  equalRouters(ctx, findMyWay, fundMyWayClone)
})

test('findRoute returns handler for a constrained route', (ctx) => {
  expect.assertions(9)

  const findMyWay = FindMyWay()

  const handler = () => {}
  findMyWay.on(
    'GET',
    '/example',
    { constraints: { version: '1.0.0' } },
    handler
  )

  const fundMyWayClone = rfdc(findMyWay)

  {
    const route = findMyWay.findRoute('GET', '/example')
    expect(route).toBe(null)
  }

  {
    const route = findMyWay.findRoute('GET', '/example', { version: '1.0.0' })
    expect(route.handler).toBe(handler)
  }

  {
    const route = findMyWay.findRoute('GET', '/example', { version: '2.0.0' })
    expect(route).toBe(null)
  }

  equalRouters(ctx, findMyWay, fundMyWayClone)
})
