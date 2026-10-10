import FindMyWay from '../index.js';

test('route with matching regex', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: () => {
      expect.fail('route not matched')
    }
  })

  findMyWay.on('GET', '/test/:id(^\\d+$)', () => {
    expect('regex match').toBeTruthy()
  })

  findMyWay.lookup({ method: 'GET', url: '/test/12', headers: {} }, null)
})

test('route without matching regex', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: () => {
      expect('route not matched').toBeTruthy()
    }
  })

  findMyWay.on('GET', '/test/:id(^\\d+$)', () => {
    expect.fail('regex match')
  })

  findMyWay.lookup({ method: 'GET', url: '/test/test', headers: {} }, null)
})

test('route with an extension regex 2', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay({
    defaultRoute: (req) => {
      expect.fail(`route not matched: ${req.url}`)
    }
  })
  findMyWay.on('GET', '/test/S/:file(^\\S+).png', () => {
    expect('regex match').toBeTruthy()
  })
  findMyWay.on('GET', '/test/D/:file(^\\D+).png', () => {
    expect('regex match').toBeTruthy()
  })
  findMyWay.lookup({ method: 'GET', url: '/test/S/foo.png', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/test/D/foo.png', headers: {} }, null)
})

test('nested route with matching regex', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: () => {
      expect.fail('route not matched')
    }
  })

  findMyWay.on('GET', '/test/:id(^\\d+$)/hello', () => {
    expect('regex match').toBeTruthy()
  })

  findMyWay.lookup({ method: 'GET', url: '/test/12/hello', headers: {} }, null)
})

test('mixed nested route with matching regex', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay({
    defaultRoute: () => {
      expect.fail('route not matched')
    }
  })

  findMyWay.on('GET', '/test/:id(^\\d+$)/hello/:world', (req, res, params) => {
    expect(params.id).toBe('12')
    expect(params.world).toBe('world')
  })

  findMyWay.lookup({ method: 'GET', url: '/test/12/hello/world', headers: {} }, null)
})

test('mixed nested route with double matching regex', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay({
    defaultRoute: () => {
      expect.fail('route not matched')
    }
  })

  findMyWay.on('GET', '/test/:id(^\\d+$)/hello/:world(^\\d+$)', (req, res, params) => {
    expect(params.id).toBe('12')
    expect(params.world).toBe('15')
  })

  findMyWay.lookup({ method: 'GET', url: '/test/12/hello/15', headers: {} }, null)
})

test('mixed nested route without double matching regex', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: () => {
      expect('route not matched').toBeTruthy()
    }
  })

  findMyWay.on('GET', '/test/:id(^\\d+$)/hello/:world(^\\d+$)', (req, res, params) => {
    expect.fail('route mathed')
  })

  findMyWay.lookup({ method: 'GET', url: '/test/12/hello/test', headers: {} }, null)
})

test('route with an extension regex', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: () => {
      expect.fail('route not matched')
    }
  })

  findMyWay.on('GET', '/test/:file(^\\d+).png', () => {
    expect('regex match').toBeTruthy()
  })

  findMyWay.lookup({ method: 'GET', url: '/test/12.png', headers: {} }, null)
})

test('route with an extension regex - no match', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: () => {
      expect('route not matched').toBeTruthy()
    }
  })

  findMyWay.on('GET', '/test/:file(^\\d+).png', () => {
    expect.fail('regex match')
  })

  findMyWay.lookup({ method: 'GET', url: '/test/aa.png', headers: {} }, null)
})

test('safe decodeURIComponent', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: () => {
      expect('route not matched').toBeTruthy()
    }
  })

  findMyWay.on('GET', '/test/:id(^\\d+$)', () => {
    expect.fail('we should not be here')
  })

  expect(findMyWay.find('GET', '/test/hel%"Flo', {})).toEqual(null)
})

test('Should check if a regex is safe to use', () => {
  expect.assertions(13)

  const noop = () => {}

  // https://github.com/substack/safe-regex/blob/master/test/regex.js
  const good = [
    /\bOakland\b/,
    /\b(Oakland|San Francisco)\b/i,
    /^\d+1337\d+$/i,
    /^\d+(1337|404)\d+$/i,
    /^\d+(1337|404)*\d+$/i,
    RegExp(Array(26).join('a?') + Array(26).join('a'))
  ]

  const bad = [
    /^(a?){25}(a){25}$/,
    RegExp(Array(27).join('a?') + Array(27).join('a')),
    /(x+x+)+y/,
    /foo|(x+x+)+y/,
    /(a+){10}y/,
    /(a+){2}y/,
    /(.*){1,32000}[bc]/
  ]

  const findMyWay = FindMyWay()

  good.forEach(regex => {
    try {
      findMyWay.on('GET', `/test/:id(${regex.toString()})`, noop)
      expect('ok').toBeTruthy()
      findMyWay.off('GET', `/test/:id(${regex.toString()})`)
    } catch (err) {
      expect.fail(err)
    }
  })

  bad.forEach(regex => {
    try {
      findMyWay.on('GET', `/test/:id(${regex.toString()})`, noop)
      expect.fail('should throw')
    } catch (err) {
      expect(err).toBeTruthy()
    }
  })
})

test('Disable safe regex check', () => {
  expect.assertions(13)

  const noop = () => {}

  // https://github.com/substack/safe-regex/blob/master/test/regex.js
  const good = [
    /\bOakland\b/,
    /\b(Oakland|San Francisco)\b/i,
    /^\d+1337\d+$/i,
    /^\d+(1337|404)\d+$/i,
    /^\d+(1337|404)*\d+$/i,
    RegExp(Array(26).join('a?') + Array(26).join('a'))
  ]

  const bad = [
    /^(a?){25}(a){25}$/,
    RegExp(Array(27).join('a?') + Array(27).join('a')),
    /(x+x+)+y/,
    /foo|(x+x+)+y/,
    /(a+){10}y/,
    /(a+){2}y/,
    /(.*){1,32000}[bc]/
  ]

  const findMyWay = FindMyWay({ allowUnsafeRegex: true })

  good.forEach(regex => {
    try {
      findMyWay.on('GET', `/test/:id(${regex.toString()})`, noop)
      expect('ok').toBeTruthy()
      findMyWay.off('GET', `/test/:id(${regex.toString()})`)
    } catch (err) {
      expect.fail(err)
    }
  })

  bad.forEach(regex => {
    try {
      findMyWay.on('GET', `/test/:id(${regex.toString()})`, noop)
      expect('ok').toBeTruthy()
      findMyWay.off('GET', `/test/:id(${regex.toString()})`)
    } catch (err) {
      expect.fail(err)
    }
  })
})

test('prevent back-tracking', () => {
  expect.assertions(0)

  const findMyWay = FindMyWay({
    defaultRoute: () => {
      expect.fail('route not matched')
    }
  })

  findMyWay.on('GET', '/:foo-:bar-', (req, res, params) => {})
  findMyWay.find('GET', '/' + '-'.repeat(16000) + 'a', { host: 'fastify.io' })
}, 20)

test('lookup matches empty regex captures', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/test/:id(^((?!abc).)*$)', (req, res, params) => expect(params.id).toBe(''))

  findMyWay.lookup({ method: 'GET', url: '/test/', headers: {} }, {
    statusCode: 0,
    end: () => {}
  })
})
