'use strict'



const Request = require('../../lib/request')
const Context = require('../../lib/context')
const {
  kReply,
  kRequest,
  kOptions
} = require('../../lib/symbols')

test('Regular request', () => {
  const headers = {
    host: 'hostname'
  }
  const req = {
    method: 'GET',
    url: '/',
    socket: { remoteAddress: 'ip' },
    headers
  }
  const context = new Context({
    schema: {
      body: {
        type: 'object',
        required: ['hello'],
        properties: {
          hello: { type: 'string' }
        }
      }
    },
    config: {
      some: 'config',
      url: req.url,
      method: req.method
    },
    server: {
      [kReply]: {},
      [kRequest]: Request,
      [kOptions]: {},
      server: {}
    }
  })
  req.connection = req.socket
  const request = new Request('id', 'params', req, 'query', 'log', context)
  expect(request instanceof Request).toBeTruthy()
  expect(request.validateInput instanceof Function).toBeTruthy()
  expect(request.getValidationFunction instanceof Function).toBeTruthy()
  expect(request.compileValidationSchema instanceof Function).toBeTruthy()
  expect(request.id).toBe('id')
  expect(request.params).toBe('params')
  expect(request.raw).toBe(req)
  expect(request.query).toBe('query')
  expect(request.headers).toBe(headers)
  expect(request.log).toBe('log')
  expect(request.ip).toBe('ip')
  expect(request.ips).toBe(undefined)
  expect(request.host).toBe('hostname')
  expect(request.body).toBe(undefined)
  expect(request.method).toBe('GET')
  expect(request.url).toBe('/')
  expect(request.originalUrl).toBe('/')
  expect(request.socket).toBe(req.socket)
  expect(request.protocol).toBe('http')
  // Aim to not bad property keys (including Symbols)
  expect('undefined' in request).toBeFalsy()
})

test('Request with undefined config', () => {
  const headers = {
    host: 'hostname'
  }
  const req = {
    method: 'GET',
    url: '/',
    socket: { remoteAddress: 'ip' },
    headers
  }
  const context = new Context({
    schema: {
      body: {
        type: 'object',
        required: ['hello'],
        properties: {
          hello: { type: 'string' }
        }
      }
    },
    server: {
      [kReply]: {},
      [kRequest]: Request,
      [kOptions]: {},
      server: {}
    }
  })
  req.connection = req.socket
  const request = new Request('id', 'params', req, 'query', 'log', context)
  expect(request).toBeTruthy()
  expect(request.validateInput).toBeTruthy()
  expect(request.getValidationFunction).toBeTruthy()
  expect(request.compileValidationSchema).toBeTruthy()
  expect(request.id).toBe('id')
  expect(request.params).toBe('params')
  expect(request.raw).toBe(req)
  expect(request.query).toBe('query')
  expect(request.headers).toBe(headers)
  expect(request.log).toBe('log')
  expect(request.ip).toBe('ip')
  expect(request.ips).toBe(undefined)
  expect(request.hostname).toBe('hostname')
  expect(request.body).toBe(undefined)
  expect(request.method).toBe('GET')
  expect(request.url).toBe('/')
  expect(request.originalUrl).toBe('/')
  expect(request.socket).toBe(req.socket)
  expect(request.protocol).toBe('http')

  // Aim to not bad property keys (including Symbols)
  expect('undefined' in request).toBeFalsy()
})

test('Regular request - hostname from authority', async () => {
  expect.assertions(3)
  const headers = {
    ':authority': 'authority'
  }
  const req = {
    method: 'GET',
    url: '/',
    socket: { remoteAddress: 'ip' },
    headers
  }
  const context = new Context({
    schema: {
      body: {
        type: 'object',
        required: ['hello'],
        properties: {
          hello: { type: 'string' }
        }
      }
    },
    config: {
      some: 'config',
      url: req.url,
      method: req.method
    },
    server: {
      [kReply]: {},
      [kRequest]: Request,
      [kOptions]: {},
      server: {}
    }
  })

  const request = new Request('id', 'params', req, 'query', 'log', context)
  expect(request instanceof Request).toBeTruthy()
  expect(request.host).toBe('authority')
  expect(request.port).toBe(null)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Regular request - host header has precedence over authority', async () => {
  expect.assertions(3)
  const headers = {
    host: 'hostname',
    ':authority': 'authority'
  }
  const req = {
    method: 'GET',
    url: '/',
    socket: { remoteAddress: 'ip' },
    headers
  }
  const context = new Context({
    schema: {
      body: {
        type: 'object',
        required: ['hello'],
        properties: {
          hello: { type: 'string' }
        }
      }
    },
    config: {
      some: 'config',
      url: req.url,
      method: req.method
    },
    server: {
      [kReply]: {},
      [kRequest]: Request,
      [kOptions]: {},
      server: {}
    }
  })
  const request = new Request('id', 'params', req, 'query', 'log', context)
  expect(request instanceof Request).toBeTruthy()
  expect(request.host).toBe('hostname')
  expect(request.port).toBe(null)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Request with trust proxy', async () => {
  expect.assertions(18)
  const headers = {
    'x-forwarded-for': '2.2.2.2, 1.1.1.1',
    'x-forwarded-host': 'fastify.test'
  }
  const req = {
    method: 'GET',
    url: '/',
    socket: { remoteAddress: 'ip' },
    headers
  }
  const context = new Context({
    schema: {
      body: {
        type: 'object',
        required: ['hello'],
        properties: {
          hello: { type: 'string' }
        }
      }
    },
    config: {
      some: 'config',
      url: req.url,
      method: req.method
    },
    server: {
      [kReply]: {},
      [kRequest]: Request,
      [kOptions]: {}
    }
  })

  const TpRequest = Request.buildRequest(Request, true)
  const request = new TpRequest('id', 'params', req, 'query', 'log', context)
  expect(request instanceof TpRequest).toBeTruthy()
  expect(request.id).toBe('id')
  expect(request.params).toBe('params')
  expect(request.raw).toEqual(req)
  expect(request.query).toBe('query')
  expect(request.headers).toBe(headers)
  expect(request.log).toBe('log')
  expect(request.ip).toBe('2.2.2.2')
  expect(request.ips).toEqual(['ip', '1.1.1.1', '2.2.2.2'])
  expect(request.host).toBe('fastify.test')
  expect(request.body).toBe(undefined)
  expect(request.method).toBe('GET')
  expect(request.url).toBe('/')
  expect(request.socket).toBe(req.socket)
  expect(request.protocol).toBe('http')
  expect(request.validateInput instanceof Function).toBeTruthy()
  expect(request.getValidationFunction instanceof Function).toBeTruthy()
  expect(request.compileValidationSchema instanceof Function).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Request with trust proxy, encrypted', async () => {
  expect.assertions(2)
  const headers = {
    'x-forwarded-for': '2.2.2.2, 1.1.1.1',
    'x-forwarded-host': 'fastify.test'
  }
  const req = {
    method: 'GET',
    url: '/',
    socket: { remoteAddress: 'ip', encrypted: true },
    headers
  }

  const TpRequest = Request.buildRequest(Request, true)
  const request = new TpRequest('id', 'params', req, 'query', 'log')
  expect(request instanceof TpRequest).toBeTruthy()
  expect(request.protocol).toBe('https')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Request with trust proxy - no x-forwarded-host header', async () => {
  expect.assertions(2)
  const headers = {
    'x-forwarded-for': '2.2.2.2, 1.1.1.1',
    host: 'hostname'
  }
  const req = {
    method: 'GET',
    url: '/',
    socket: { remoteAddress: 'ip' },
    headers
  }
  const context = new Context({
    schema: {
      body: {
        type: 'object',
        required: ['hello'],
        properties: {
          hello: { type: 'string' }
        }
      }
    },
    config: {
      some: 'config',
      url: req.url,
      method: req.method
    },
    server: {
      [kReply]: {},
      [kRequest]: Request,
      [kOptions]: {},
      server: {}
    }
  })

  const TpRequest = Request.buildRequest(Request, true)
  const request = new TpRequest('id', 'params', req, 'query', 'log', context)
  expect(request instanceof TpRequest).toBeTruthy()
  expect(request.host).toBe('hostname')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Request with trust proxy - no x-forwarded-host header and fallback to authority', async () => {
  expect.assertions(3)
  const headers = {
    'x-forwarded-for': '2.2.2.2, 1.1.1.1',
    ':authority': 'authority:4321'
  }
  const req = {
    method: 'GET',
    url: '/',
    socket: { remoteAddress: 'ip' },
    headers
  }
  const context = new Context({
    schema: {
      body: {
        type: 'object',
        required: ['hello'],
        properties: {
          hello: { type: 'string' }
        }
      }
    },
    config: {
      some: 'config',
      url: req.url,
      method: req.method
    },
    server: {
      [kReply]: {},
      [kRequest]: Request,
      [kOptions]: {},
      server: {}
    }
  })

  const TpRequest = Request.buildRequest(Request, true)
  const request = new TpRequest('id', 'params', req, 'query', 'log', context)
  expect(request instanceof TpRequest).toBeTruthy()
  expect(request.host).toBe('authority:4321')
  expect(request.port).toBe(4321)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Request with trust proxy - x-forwarded-host header has precedence over host', async () => {
  expect.assertions(4)
  const headers = {
    'x-forwarded-for': ' 2.2.2.2, 1.1.1.1',
    'x-forwarded-host': 'fastify.test:1234',
    host: 'hostname:5678'
  }
  const req = {
    method: 'GET',
    url: '/',
    socket: { remoteAddress: 'ip' },
    headers
  }

  const TpRequest = Request.buildRequest(Request, true)
  const request = new TpRequest('id', 'params', req, 'query', 'log')
  expect(request instanceof TpRequest).toBeTruthy()
  expect(request.host).toBe('fastify.test:1234')
  expect(request.hostname).toBe('fastify.test')
  expect(request.port).toBe(1234)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Request with trust proxy - handles multiple entries in x-forwarded-host/proto', async () => {
  expect.assertions(3)
  const headers = {
    'x-forwarded-host': 'example2.com, fastify.test',
    'x-forwarded-proto': 'http, https'
  }
  const req = {
    method: 'GET',
    url: '/',
    socket: { remoteAddress: 'ip' },
    headers
  }

  const TpRequest = Request.buildRequest(Request, true)
  const request = new TpRequest('id', 'params', req, 'query', 'log')
  expect(request instanceof TpRequest).toBeTruthy()
  expect(request.host).toBe('fastify.test')
  expect(request.protocol).toBe('https')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Request with trust proxy - host getter reads the merged headers once', async () => {
  expect.assertions(2)
  const req = {
    method: 'GET',
    url: '/',
    socket: { remoteAddress: 'ip' },
    headers: { host: 'fastify.test' }
  }

  const TpRequest = Request.buildRequest(Request, true)
  const request = new TpRequest('id', 'params', req, 'query', 'log')
  // the headers getter may allocate a new object once request.headers was
  // assigned in a hook, so the host getter must read it once per access
  const additional = { 'user-assigned': 'yes' }
  let reads = 0
  Object.defineProperty(request, 'headers', {
    get () {
      reads++
      return Object.assign({}, req.headers, additional)
    }
  })
  expect(request.host).toBe('fastify.test')
  expect(reads).toBe(1)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Request with trust proxy - protocol getter reads the merged headers once', async () => {
  expect.assertions(2)
  const req = {
    method: 'GET',
    url: '/',
    socket: { remoteAddress: 'ip' },
    headers: { 'x-forwarded-proto': 'https' }
  }

  const TpRequest = Request.buildRequest(Request, true)
  const request = new TpRequest('id', 'params', req, 'query', 'log')
  // the headers getter may allocate a new object once request.headers was
  // assigned in a hook, so the protocol getter must read it once per access
  const additional = { 'user-assigned': 'yes' }
  let reads = 0
  Object.defineProperty(request, 'headers', {
    get () {
      reads++
      return Object.assign({}, req.headers, additional)
    }
  })
  expect(request.protocol).toBe('https')
  expect(reads).toBe(1)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Request with trust proxy - plain', async () => {
  expect.assertions(1)
  const headers = {
    'x-forwarded-for': '2.2.2.2, 1.1.1.1',
    'x-forwarded-host': 'fastify.test'
  }
  const req = {
    method: 'GET',
    url: '/',
    socket: { remoteAddress: 'ip' },
    headers
  }

  const TpRequest = Request.buildRequest(Request, true)
  const request = new TpRequest('id', 'params', req, 'query', 'log')
  expect(request.protocol).toEqual('http')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Request with undefined socket', async () => {
  expect.assertions(18)
  const headers = {
    host: 'hostname'
  }
  const req = {
    method: 'GET',
    url: '/',
    socket: undefined,
    headers
  }
  const context = new Context({
    schema: {
      body: {
        type: 'object',
        required: ['hello'],
        properties: {
          hello: { type: 'string' }
        }
      }
    },
    config: {
      some: 'config',
      url: req.url,
      method: req.method
    },
    server: {
      [kReply]: {},
      [kRequest]: Request,
      [kOptions]: {},
      server: {}
    }
  })
  const request = new Request('id', 'params', req, 'query', 'log', context)
  expect(request instanceof Request).toBeTruthy()
  expect(request.id).toBe('id')
  expect(request.params).toBe('params')
  expect(request.raw).toEqual(req)
  expect(request.query).toBe('query')
  expect(request.headers).toBe(headers)
  expect(request.log).toBe('log')
  expect(request.ip).toBe(undefined)
  expect(request.ips).toBe(undefined)
  expect(request.host).toBe('hostname')
  expect(request.body).toEqual(undefined)
  expect(request.method).toBe('GET')
  expect(request.url).toBe('/')
  expect(request.protocol).toBe(undefined)
  expect(request.socket).toEqual(req.socket)
  expect(request.validateInput instanceof Function).toBeTruthy()
  expect(request.getValidationFunction instanceof Function).toBeTruthy()
  expect(request.compileValidationSchema instanceof Function).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Request with trust proxy and undefined socket does not trust x-forwarded-host/proto', async () => {
  expect.assertions(2)
  const headers = {
    host: 'hostname',
    'x-forwarded-for': '2.2.2.2, 1.1.1.1',
    'x-forwarded-host': 'fastify.test',
    'x-forwarded-proto': 'https'
  }
  const req = {
    method: 'GET',
    url: '/',
    socket: undefined,
    headers
  }

  const TpRequest = Request.buildRequest(Request, true)
  const request = new TpRequest('id', 'params', req, 'query', 'log')
  expect(request.host).toBe('hostname')
  expect(request.protocol).toEqual(undefined)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Request with trust proxy and null socket does not trust x-forwarded-host/proto', async () => {
  expect.assertions(2)
  const headers = {
    host: 'hostname',
    'x-forwarded-for': '2.2.2.2, 1.1.1.1',
    'x-forwarded-host': 'fastify.test',
    'x-forwarded-proto': 'https'
  }
  const req = {
    method: 'GET',
    url: '/',
    socket: null,
    headers
  }

  const TpRequest = Request.buildRequest(Request, true)
  const request = new TpRequest('id', 'params', req, 'query', 'log')
  expect(request.host).toBe('hostname')
  expect(request.protocol).toEqual(undefined)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
