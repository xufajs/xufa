'use strict'


const Fastify = require('..')

test('pretty print - static routes', (done) => {
  expect.assertions(2)

  const fastify = Fastify({ exposeHeadRoutes: false })
  fastify.get('/test', () => {})
  fastify.get('/test/hello', () => {})
  fastify.get('/hello/world', () => {})

  fastify.ready(() => {
    const tree = fastify.printRoutes()

    const expected = `\
└── /
    ├── test (GET)
    │   └── /hello (GET)
    └── hello/world (GET)
`

    expect(typeof tree).toBe('string')
    expect(tree).toBe(expected)
    done()
  })
})

test('pretty print - internal tree - static routes', (done) => {
  expect.assertions(4)

  const fastify = Fastify({ exposeHeadRoutes: false })
  fastify.get('/test', () => {})
  fastify.get('/test/hello', () => {})
  fastify.get('/hello/world', () => {})

  fastify.put('/test', () => {})
  fastify.put('/test/foo', () => {})

  fastify.ready(() => {
    const getTree = fastify.printRoutes({ method: 'GET' })
    const expectedGetTree = `\
└── /
    ├── test (GET)
    │   └── /hello (GET)
    └── hello/world (GET)
`

    expect(typeof getTree).toBe('string')
    expect(getTree).toBe(expectedGetTree)

    const putTree = fastify.printRoutes({ method: 'PUT' })
    const expectedPutTree = `\
└── /
    └── test (PUT)
        └── /foo (PUT)
`

    expect(typeof putTree).toBe('string')
    expect(putTree).toBe(expectedPutTree)
    done()
  })
})

test('pretty print - parametric routes', (done) => {
  expect.assertions(2)

  const fastify = Fastify({ exposeHeadRoutes: false })
  fastify.get('/test', () => {})
  fastify.get('/test/:hello', () => {})
  fastify.get('/hello/:world', () => {})

  fastify.ready(() => {
    const tree = fastify.printRoutes()

    const expected = `\
└── /
    ├── test (GET)
    │   └── /
    │       └── :hello (GET)
    └── hello/
        └── :world (GET)
`

    expect(typeof tree).toBe('string')
    expect(tree).toBe(expected)
    done()
  })
})

test('pretty print - internal tree - parametric routes', (done) => {
  expect.assertions(4)

  const fastify = Fastify({ exposeHeadRoutes: false })
  fastify.get('/test', () => {})
  fastify.get('/test/:hello', () => {})
  fastify.get('/hello/:world', () => {})

  fastify.put('/test', () => {})
  fastify.put('/test/:hello', () => {})

  fastify.ready(() => {
    const getTree = fastify.printRoutes({ method: 'GET' })
    const expectedGetTree = `\
└── /
    ├── test (GET)
    │   └── /
    │       └── :hello (GET)
    └── hello/
        └── :world (GET)
`

    expect(typeof getTree).toBe('string')
    expect(getTree).toBe(expectedGetTree)

    const putTree = fastify.printRoutes({ method: 'PUT' })
    const expectedPutTree = `\
└── /
    └── test (PUT)
        └── /
            └── :hello (PUT)
`

    expect(typeof putTree).toBe('string')
    expect(putTree).toBe(expectedPutTree)
    done()
  })
})

test('pretty print - mixed parametric routes', (done) => {
  expect.assertions(2)

  const fastify = Fastify({ exposeHeadRoutes: false })
  fastify.get('/test', () => {})
  fastify.get('/test/:hello', () => {})
  fastify.post('/test/:hello', () => {})
  fastify.get('/test/:hello/world', () => {})

  fastify.ready(() => {
    const tree = fastify.printRoutes()

    const expected = `\
└── /
    └── test (GET)
        └── /
            └── :hello (GET, POST)
                └── /world (GET)
`

    expect(typeof tree).toBe('string')
    expect(tree).toBe(expected)
    done()
  })
})

test('pretty print - wildcard routes', (done) => {
  expect.assertions(2)

  const fastify = Fastify({ exposeHeadRoutes: false })
  fastify.get('/test', () => {})
  fastify.get('/test/*', () => {})
  fastify.get('/hello/*', () => {})

  fastify.ready(() => {
    const tree = fastify.printRoutes()

    const expected = `\
└── /
    ├── test (GET)
    │   └── /
    │       └── * (GET)
    └── hello/
        └── * (GET)
`

    expect(typeof tree).toBe('string')
    expect(tree).toBe(expected)
    done()
  })
})

test('pretty print - internal tree - wildcard routes', (done) => {
  expect.assertions(4)

  const fastify = Fastify({ exposeHeadRoutes: false })
  fastify.get('/test', () => {})
  fastify.get('/test/*', () => {})
  fastify.get('/hello/*', () => {})

  fastify.put('/*', () => {})
  fastify.put('/test/*', () => {})

  fastify.ready(() => {
    const getTree = fastify.printRoutes({ method: 'GET' })
    const expectedGetTree = `\
└── /
    ├── test (GET)
    │   └── /
    │       └── * (GET)
    └── hello/
        └── * (GET)
`

    expect(typeof getTree).toBe('string')
    expect(getTree).toBe(expectedGetTree)

    const putTree = fastify.printRoutes({ method: 'PUT' })
    const expectedPutTree = `\
└── /
    ├── test/
    │   └── * (PUT)
    └── * (PUT)
`

    expect(typeof putTree).toBe('string')
    expect(putTree).toBe(expectedPutTree)
    done()
  })
})

test('pretty print - empty plugins', (done) => {
  expect.assertions(2)

  const fastify = Fastify()
  fastify.ready(() => {
    const tree = fastify.printPlugins()
    expect(typeof tree).toBe('string')
    expect(tree).toMatch(/root \d+ ms\n└── bound _after \d+ ms/m)
    done()
  })
})

test('pretty print - nested plugins', (done) => {
  expect.assertions(4)

  const fastify = Fastify()
  fastify.register(async function foo (instance) {
    instance.register(async function bar () {})
    instance.register(async function baz () {})
  })
  fastify.ready(() => {
    const tree = fastify.printPlugins()
    expect(typeof tree).toBe('string')
    expect(tree).toMatch(/foo/)
    expect(tree).toMatch(/bar/)
    expect(tree).toMatch(/baz/)
    done()
  })
})

test('pretty print - commonPrefix', (done) => {
  expect.assertions(4)

  const fastify = Fastify()
  fastify.get('/hello', () => {})
  fastify.put('/hello', () => {})
  fastify.get('/helicopter', () => {})

  fastify.ready(() => {
    const radixTree = fastify.printRoutes()
    const flatTree = fastify.printRoutes({ commonPrefix: false })

    const radixExpected = `\
└── /
    └── hel
        ├── lo (GET, HEAD, PUT)
        └── icopter (GET, HEAD)
`
    const flatExpected = `\
├── /hello (GET, HEAD, PUT)
└── /helicopter (GET, HEAD)
`
    expect(typeof radixTree).toBe('string')
    expect(typeof flatTree).toBe('string')
    expect(radixTree).toBe(radixExpected)
    expect(flatTree).toBe(flatExpected)
    done()
  })
})

test('pretty print - includeMeta, includeHooks', (done) => {
  expect.assertions(6)

  const fastify = Fastify()
  const onTimeout = () => {}
  fastify.get('/hello', () => {})
  fastify.put('/hello', () => {})
  fastify.get('/helicopter', () => {})

  fastify.addHook('onRequest', () => {})
  fastify.addHook('onTimeout', onTimeout)

  fastify.ready(() => {
    const radixTree = fastify.printRoutes({ includeHooks: true, includeMeta: ['errorHandler'] })
    const flatTree = fastify.printRoutes({ commonPrefix: false, includeHooks: true, includeMeta: ['errorHandler'] })
    const hooksOnly = fastify.printRoutes({ commonPrefix: false, includeHooks: true })

    const radixExpected = `\
└── /
    └── hel
        ├── lo (GET, PUT)
        │   • (onTimeout) ["onTimeout()"]
        │   • (onRequest) ["anonymous()"]
        │   • (errorHandler) "defaultErrorHandler()"
        │   lo (HEAD)
        │   • (onTimeout) ["onTimeout()"]
        │   • (onRequest) ["anonymous()"]
        │   • (onSend) ["headRouteOnSendHandler()"]
        │   • (errorHandler) "defaultErrorHandler()"
        └── icopter (GET)
            • (onTimeout) ["onTimeout()"]
            • (onRequest) ["anonymous()"]
            • (errorHandler) "defaultErrorHandler()"
            icopter (HEAD)
            • (onTimeout) ["onTimeout()"]
            • (onRequest) ["anonymous()"]
            • (onSend) ["headRouteOnSendHandler()"]
            • (errorHandler) "defaultErrorHandler()"
`
    const flatExpected = `\
├── /hello (GET, PUT)
│   • (onTimeout) ["onTimeout()"]
│   • (onRequest) ["anonymous()"]
│   • (errorHandler) "defaultErrorHandler()"
│   /hello (HEAD)
│   • (onTimeout) ["onTimeout()"]
│   • (onRequest) ["anonymous()"]
│   • (onSend) ["headRouteOnSendHandler()"]
│   • (errorHandler) "defaultErrorHandler()"
└── /helicopter (GET)
    • (onTimeout) ["onTimeout()"]
    • (onRequest) ["anonymous()"]
    • (errorHandler) "defaultErrorHandler()"
    /helicopter (HEAD)
    • (onTimeout) ["onTimeout()"]
    • (onRequest) ["anonymous()"]
    • (onSend) ["headRouteOnSendHandler()"]
    • (errorHandler) "defaultErrorHandler()"
`

    const hooksOnlyExpected = `\
├── /hello (GET, PUT)
│   • (onTimeout) ["onTimeout()"]
│   • (onRequest) ["anonymous()"]
│   /hello (HEAD)
│   • (onTimeout) ["onTimeout()"]
│   • (onRequest) ["anonymous()"]
│   • (onSend) ["headRouteOnSendHandler()"]
└── /helicopter (GET)
    • (onTimeout) ["onTimeout()"]
    • (onRequest) ["anonymous()"]
    /helicopter (HEAD)
    • (onTimeout) ["onTimeout()"]
    • (onRequest) ["anonymous()"]
    • (onSend) ["headRouteOnSendHandler()"]
`
    expect(typeof radixTree).toBe('string')
    expect(typeof flatTree).toBe('string')
    expect(typeof hooksOnlyExpected).toBe('string')
    expect(radixTree).toBe(radixExpected)
    expect(flatTree).toBe(flatExpected)
    expect(hooksOnly).toBe(hooksOnlyExpected)
    done()
  })
})
