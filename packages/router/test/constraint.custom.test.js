import FindMyWay from '../index.js';
const alpha = () => { }
const beta = () => { }
const gamma = () => { }
const delta = () => { }

const customHeaderConstraint = {
  name: 'requestedBy',
  storage: function () {
    let requestedBys = {}
    return {
      get: (requestedBy) => { return requestedBys[requestedBy] || null },
      set: (requestedBy, store) => { requestedBys[requestedBy] = store },
      del: (requestedBy) => { delete requestedBys[requestedBy] },
      empty: () => { requestedBys = {} }
    }
  },
  deriveConstraint: (req, ctx) => {
    return req.headers['user-agent']
  }
}

test('A route could support a custom constraint strategy', () => {
  expect.assertions(3)

  const findMyWay = FindMyWay({ constraints: { requestedBy: customHeaderConstraint } })

  findMyWay.on('GET', '/', { constraints: { requestedBy: 'curl' } }, alpha)
  findMyWay.on('GET', '/', { constraints: { requestedBy: 'wget' } }, beta)

  expect(findMyWay.find('GET', '/', { requestedBy: 'curl' }).handler).toBe(alpha)
  expect(findMyWay.find('GET', '/', { requestedBy: 'wget' }).handler).toBe(beta)
  expect(findMyWay.find('GET', '/', { requestedBy: 'chrome' })).toBeFalsy()
})

test('A route could support a custom constraint strategy (add strategy outside constructor)', () => {
  expect.assertions(3)

  const findMyWay = FindMyWay()

  findMyWay.addConstraintStrategy(customHeaderConstraint)

  findMyWay.on('GET', '/', { constraints: { requestedBy: 'curl' } }, alpha)
  findMyWay.on('GET', '/', { constraints: { requestedBy: 'wget' } }, beta)

  expect(findMyWay.find('GET', '/', { requestedBy: 'curl' }).handler).toBe(alpha)
  expect(findMyWay.find('GET', '/', { requestedBy: 'wget' }).handler).toBe(beta)
  expect(findMyWay.find('GET', '/', { requestedBy: 'chrome' })).toBeFalsy()
})

test('A route could support a custom constraint strategy while versioned', () => {
  expect.assertions(8)

  const findMyWay = FindMyWay({ constraints: { requestedBy: customHeaderConstraint } })

  findMyWay.on('GET', '/', { constraints: { requestedBy: 'curl', version: '1.0.0' } }, alpha)
  findMyWay.on('GET', '/', { constraints: { requestedBy: 'curl', version: '2.0.0' } }, beta)
  findMyWay.on('GET', '/', { constraints: { requestedBy: 'wget', version: '2.0.0' } }, gamma)
  findMyWay.on('GET', '/', { constraints: { requestedBy: 'wget', version: '3.0.0' } }, delta)

  expect(findMyWay.find('GET', '/', { requestedBy: 'curl', version: '1.x' }).handler).toBe(alpha)
  expect(findMyWay.find('GET', '/', { requestedBy: 'curl', version: '2.x' }).handler).toBe(beta)
  expect(findMyWay.find('GET', '/', { requestedBy: 'wget', version: '2.x' }).handler).toBe(gamma)
  expect(findMyWay.find('GET', '/', { requestedBy: 'wget', version: '3.x' }).handler).toBe(delta)

  expect(findMyWay.find('GET', '/', { requestedBy: 'chrome' })).toBeFalsy()
  expect(findMyWay.find('GET', '/', { requestedBy: 'chrome', version: '1.x' })).toBeFalsy()

  expect(findMyWay.find('GET', '/', { requestedBy: 'curl', version: '3.x' })).toBeFalsy()
  expect(findMyWay.find('GET', '/', { requestedBy: 'wget', version: '1.x' })).toBeFalsy()
})

test('A route could support a custom constraint strategy while versioned (add strategy outside constructor)', () => {
  expect.assertions(8)

  const findMyWay = FindMyWay()

  findMyWay.addConstraintStrategy(customHeaderConstraint)

  findMyWay.on('GET', '/', { constraints: { requestedBy: 'curl', version: '1.0.0' } }, alpha)
  findMyWay.on('GET', '/', { constraints: { requestedBy: 'curl', version: '2.0.0' } }, beta)
  findMyWay.on('GET', '/', { constraints: { requestedBy: 'wget', version: '2.0.0' } }, gamma)
  findMyWay.on('GET', '/', { constraints: { requestedBy: 'wget', version: '3.0.0' } }, delta)

  expect(findMyWay.find('GET', '/', { requestedBy: 'curl', version: '1.x' }).handler).toBe(alpha)
  expect(findMyWay.find('GET', '/', { requestedBy: 'curl', version: '2.x' }).handler).toBe(beta)
  expect(findMyWay.find('GET', '/', { requestedBy: 'wget', version: '2.x' }).handler).toBe(gamma)
  expect(findMyWay.find('GET', '/', { requestedBy: 'wget', version: '3.x' }).handler).toBe(delta)

  expect(findMyWay.find('GET', '/', { requestedBy: 'chrome' })).toBeFalsy()
  expect(findMyWay.find('GET', '/', { requestedBy: 'chrome', version: '1.x' })).toBeFalsy()

  expect(findMyWay.find('GET', '/', { requestedBy: 'curl', version: '3.x' })).toBeFalsy()
  expect(findMyWay.find('GET', '/', { requestedBy: 'wget', version: '1.x' })).toBeFalsy()
})

test('A route could support a custom constraint strategy while versioned and host constrained', () => {
  expect.assertions(9)

  const findMyWay = FindMyWay({ constraints: { requestedBy: customHeaderConstraint } })

  findMyWay.on('GET', '/', { constraints: { requestedBy: 'curl', version: '1.0.0', host: 'fastify.io' } }, alpha)
  findMyWay.on('GET', '/', { constraints: { requestedBy: 'curl', version: '2.0.0', host: 'fastify.io' } }, beta)
  findMyWay.on('GET', '/', { constraints: { requestedBy: 'curl', version: '2.0.0', host: 'example.io' } }, delta)

  expect(findMyWay.find('GET', '/', { requestedBy: 'curl', version: '1.x', host: 'fastify.io' }).handler).toBe(alpha)
  expect(findMyWay.find('GET', '/', { requestedBy: 'curl', version: '2.x', host: 'fastify.io' }).handler).toBe(beta)
  expect(findMyWay.find('GET', '/', { requestedBy: 'curl', version: '2.x', host: 'example.io' }).handler).toBe(delta)

  expect(findMyWay.find('GET', '/', { requestedBy: 'chrome' })).toBeFalsy()
  expect(findMyWay.find('GET', '/', { requestedBy: 'chrome', version: '1.x' })).toBeFalsy()
  expect(findMyWay.find('GET', '/', { requestedBy: 'curl', version: '1.x' })).toBeFalsy()
  expect(findMyWay.find('GET', '/', { requestedBy: 'curl', version: '2.x' })).toBeFalsy()
  expect(findMyWay.find('GET', '/', { requestedBy: 'curl', version: '3.x', host: 'fastify.io' })).toBeFalsy()
  expect(findMyWay.find('GET', '/', { requestedBy: 'curl', version: '1.x', host: 'example.io' })).toBeFalsy()
})

test('A route could support a custom constraint strategy while versioned and host constrained (add strategy outside constructor)', () => {
  expect.assertions(9)

  const findMyWay = FindMyWay()

  findMyWay.addConstraintStrategy(customHeaderConstraint)

  findMyWay.on('GET', '/', { constraints: { requestedBy: 'curl', version: '1.0.0', host: 'fastify.io' } }, alpha)
  findMyWay.on('GET', '/', { constraints: { requestedBy: 'curl', version: '2.0.0', host: 'fastify.io' } }, beta)
  findMyWay.on('GET', '/', { constraints: { requestedBy: 'curl', version: '2.0.0', host: 'example.io' } }, delta)

  expect(findMyWay.find('GET', '/', { requestedBy: 'curl', version: '1.x', host: 'fastify.io' }).handler).toBe(alpha)
  expect(findMyWay.find('GET', '/', { requestedBy: 'curl', version: '2.x', host: 'fastify.io' }).handler).toBe(beta)
  expect(findMyWay.find('GET', '/', { requestedBy: 'curl', version: '2.x', host: 'example.io' }).handler).toBe(delta)

  expect(findMyWay.find('GET', '/', { requestedBy: 'chrome' })).toBeFalsy()
  expect(findMyWay.find('GET', '/', { requestedBy: 'chrome', version: '1.x' })).toBeFalsy()
  expect(findMyWay.find('GET', '/', { requestedBy: 'curl', version: '1.x' })).toBeFalsy()
  expect(findMyWay.find('GET', '/', { requestedBy: 'curl', version: '2.x' })).toBeFalsy()
  expect(findMyWay.find('GET', '/', { requestedBy: 'curl', version: '3.x', host: 'fastify.io' })).toBeFalsy()
  expect(findMyWay.find('GET', '/', { requestedBy: 'curl', version: '1.x', host: 'example.io' })).toBeFalsy()
})

test('Custom constraint strategies can set mustMatchWhenDerived flag to true which prevents matches to unconstrained routes when a constraint is derived and there are no other routes', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay({
    constraints: {
      requestedBy: {
        ...customHeaderConstraint,
        mustMatchWhenDerived: true
      }
    },
    defaultRoute (req, res) {
      expect('pass').toBeTruthy()
    }
  })

  findMyWay.on('GET', '/', {}, () => expect.fail())

  findMyWay.lookup({ method: 'GET', url: '/', headers: { 'user-agent': 'node' } }, null)
})

test('Custom constraint strategies can set mustMatchWhenDerived flag to true which prevents matches to unconstrained routes when a constraint is derived and there are no other routes (add strategy outside constructor)', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay({
    defaultRoute (req, res) {
      expect('pass').toBeTruthy()
    }
  })

  findMyWay.addConstraintStrategy({
    ...customHeaderConstraint,
    mustMatchWhenDerived: true
  })

  findMyWay.on('GET', '/', {}, () => expect.fail())

  findMyWay.lookup({ method: 'GET', url: '/', headers: { 'user-agent': 'node' } }, null)
})

test('Custom constraint strategies can set mustMatchWhenDerived flag to true which prevents matches to unconstrained routes when a constraint is derived when there are constrained routes', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay({
    constraints: {
      requestedBy: {
        ...customHeaderConstraint,
        mustMatchWhenDerived: true
      }
    },
    defaultRoute (req, res) {
      expect('pass').toBeTruthy()
    }
  })

  findMyWay.on('GET', '/', {}, () => expect.fail())
  findMyWay.on('GET', '/', { constraints: { requestedBy: 'curl' } }, () => expect.fail())
  findMyWay.on('GET', '/', { constraints: { requestedBy: 'wget' } }, () => expect.fail())

  findMyWay.lookup({ method: 'GET', url: '/', headers: { 'user-agent': 'node' } }, null)
})

test('Custom constraint strategies can set mustMatchWhenDerived flag to true which prevents matches to unconstrained routes when a constraint is derived when there are constrained routes (add strategy outside constructor)', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay({
    defaultRoute (req, res) {
      expect('pass').toBeTruthy()
    }
  })

  findMyWay.addConstraintStrategy({
    ...customHeaderConstraint,
    mustMatchWhenDerived: true
  })

  findMyWay.on('GET', '/', {}, () => expect.fail())
  findMyWay.on('GET', '/', { constraints: { requestedBy: 'curl' } }, () => expect.fail())
  findMyWay.on('GET', '/', { constraints: { requestedBy: 'wget' } }, () => expect.fail())

  findMyWay.lookup({ method: 'GET', url: '/', headers: { 'user-agent': 'node' } }, null)
})

test('Custom constraint strategies can set mustMatchWhenDerived flag to false which allows matches to unconstrained routes when a constraint is derived', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay({
    constraints: {
      requestedBy: {
        ...customHeaderConstraint,
        mustMatchWhenDerived: false
      }
    },
    defaultRoute (req, res) {
      expect.fail()
    }
  })

  findMyWay.on('GET', '/', {}, () => expect('pass').toBeTruthy())

  findMyWay.lookup({ method: 'GET', url: '/', headers: { 'user-agent': 'node' } }, null)
})

test('Custom constraint strategies can set mustMatchWhenDerived flag to false which allows matches to unconstrained routes when a constraint is derived (add strategy outside constructor)', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay({
    defaultRoute (req, res) {
      expect('pass').toBeTruthy()
    }
  })

  findMyWay.addConstraintStrategy({
    ...customHeaderConstraint,
    mustMatchWhenDerived: true
  })

  findMyWay.on('GET', '/', {}, () => expect('pass').toBeTruthy())

  findMyWay.lookup({ method: 'GET', url: '/', headers: { 'user-agent': 'node' } }, null)
})

test('Has constraint strategy method test', () => {
  expect.assertions(2)

  const findMyWay = FindMyWay()

  expect(findMyWay.hasConstraintStrategy(customHeaderConstraint.name)).toEqual(false)
  findMyWay.addConstraintStrategy(customHeaderConstraint)
  expect(findMyWay.hasConstraintStrategy(customHeaderConstraint.name)).toEqual(true)
})
