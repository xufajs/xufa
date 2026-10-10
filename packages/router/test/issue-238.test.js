import FindMyWay from '../index.js';

test('Multi-parametric tricky path', () => {
  expect.assertions(6)
  const findMyWay = FindMyWay({
    defaultRoute: () => expect.fail('Should not be defaultRoute')
  })

  findMyWay.on('GET', '/:param1-static-:param2', () => {})

  expect(findMyWay.find('GET', '/param1-static-param2', {}).params).toEqual({ param1: 'param1', param2: 'param2' })
  expect(findMyWay.find('GET', '/param1.1-param1.2-static-param2.1-param2.2', {}).params).toEqual({ param1: 'param1.1-param1.2', param2: 'param2.1-param2.2' })
  expect(findMyWay.find('GET', '/param1-1-param1-2-static-param2-1-param2-2', {}).params).toEqual({ param1: 'param1-1-param1-2', param2: 'param2-1-param2-2' })
  expect(findMyWay.find('GET', '/static-static-static', {}).params).toEqual({ param1: 'static', param2: 'static' })
  expect(findMyWay.find('GET', '/static-static-static-static', {}).params).toEqual({ param1: 'static', param2: 'static-static' })
  expect(findMyWay.find('GET', '/static-static1-static-static', {}).params).toEqual({ param1: 'static-static1', param2: 'static' })
})

test('Multi-parametric nodes with different static ending 1', () => {
  expect.assertions(4)
  const findMyWay = FindMyWay({
    defaultRoute: () => expect.fail('Should not be defaultRoute')
  })

  const paramHandler = () => {}
  const multiParamHandler = () => {}

  findMyWay.on('GET', '/v1/foo/:code', paramHandler)
  findMyWay.on('GET', '/v1/foo/:code.png', multiParamHandler)

  expect(findMyWay.find('GET', '/v1/foo/hello', {}).handler).toEqual(paramHandler)
  expect(findMyWay.find('GET', '/v1/foo/hello', {}).params).toEqual({ code: 'hello' })

  expect(findMyWay.find('GET', '/v1/foo/hello.png', {}).handler).toEqual(multiParamHandler)
  expect(findMyWay.find('GET', '/v1/foo/hello.png', {}).params).toEqual({ code: 'hello' })
})

test('Multi-parametric nodes with different static ending 2', () => {
  expect.assertions(4)
  const findMyWay = FindMyWay({
    defaultRoute: () => expect.fail('Should not be defaultRoute')
  })

  const jpgHandler = () => {}
  const pngHandler = () => {}

  findMyWay.on('GET', '/v1/foo/:code.jpg', jpgHandler)
  findMyWay.on('GET', '/v1/foo/:code.png', pngHandler)

  expect(findMyWay.find('GET', '/v1/foo/hello.jpg', {}).handler).toEqual(jpgHandler)
  expect(findMyWay.find('GET', '/v1/foo/hello.jpg', {}).params).toEqual({ code: 'hello' })

  expect(findMyWay.find('GET', '/v1/foo/hello.png', {}).handler).toEqual(pngHandler)
  expect(findMyWay.find('GET', '/v1/foo/hello.png', {}).params).toEqual({ code: 'hello' })
})

test('Multi-parametric nodes with different static ending 3', () => {
  expect.assertions(4)
  const findMyWay = FindMyWay({
    defaultRoute: () => expect.fail('Should not be defaultRoute')
  })

  const jpgHandler = () => {}
  const pngHandler = () => {}

  findMyWay.on('GET', '/v1/foo/:code.jpg/bar', jpgHandler)
  findMyWay.on('GET', '/v1/foo/:code.png/bar', pngHandler)

  expect(findMyWay.find('GET', '/v1/foo/hello.jpg/bar', {}).handler).toEqual(jpgHandler)
  expect(findMyWay.find('GET', '/v1/foo/hello.jpg/bar', {}).params).toEqual({ code: 'hello' })

  expect(findMyWay.find('GET', '/v1/foo/hello.png/bar', {}).handler).toEqual(pngHandler)
  expect(findMyWay.find('GET', '/v1/foo/hello.png/bar', {}).params).toEqual({ code: 'hello' })
})

test('Multi-parametric nodes with different static ending 4', () => {
  expect.assertions(6)
  const findMyWay = FindMyWay({
    defaultRoute: () => expect.fail('Should not be defaultRoute')
  })

  const handler = () => {}
  const jpgHandler = () => {}
  const pngHandler = () => {}

  findMyWay.on('GET', '/v1/foo/:code/bar', handler)
  findMyWay.on('GET', '/v1/foo/:code.jpg/bar', jpgHandler)
  findMyWay.on('GET', '/v1/foo/:code.png/bar', pngHandler)

  expect(findMyWay.find('GET', '/v1/foo/hello/bar', {}).handler).toEqual(handler)
  expect(findMyWay.find('GET', '/v1/foo/hello/bar', {}).params).toEqual({ code: 'hello' })

  expect(findMyWay.find('GET', '/v1/foo/hello.jpg/bar', {}).handler).toEqual(jpgHandler)
  expect(findMyWay.find('GET', '/v1/foo/hello.jpg/bar', {}).params).toEqual({ code: 'hello' })

  expect(findMyWay.find('GET', '/v1/foo/hello.png/bar', {}).handler).toEqual(pngHandler)
  expect(findMyWay.find('GET', '/v1/foo/hello.png/bar', {}).params).toEqual({ code: 'hello' })
})
