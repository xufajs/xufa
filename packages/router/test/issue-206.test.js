'use strict'


const FindMyWay = require('..')

test('Decode the URL before the routing', () => {
  expect.assertions(8)
  const findMyWay = FindMyWay()

  function space (req, res, params) {}
  function percentTwenty (req, res, params) {}
  function percentTwentyfive (req, res, params) {}

  findMyWay.on('GET', '/static/:pathParam', () => {})
  findMyWay.on('GET', '/[...]/a .html', space)
  findMyWay.on('GET', '/[...]/a%20.html', percentTwenty)
  findMyWay.on('GET', '/[...]/a%2520.html', percentTwentyfive)

  expect(findMyWay.find('GET', '/[...]/a .html').handler).toBe(space)
  expect(findMyWay.find('GET', '/%5B...%5D/a .html').handler).toBe(space)
  expect(findMyWay.find('GET', '/[...]/a%20.html').handler).toBe(space)
  expect(findMyWay.find('GET', '/%5B...%5D/a%20.html').handler).toBe(space)
  expect(findMyWay.find('GET', '/[...]/a%2520.html').handler).toBe(percentTwenty)
  expect(findMyWay.find('GET', '/%5B...%5D/a%252520.html').handler).toBe(percentTwentyfive)
  expect(findMyWay.find('GET', '/[...]/a  .html')).toBe(null)
  expect(findMyWay.find('GET', '/static/%25E0%A4%A')).toBe(null)
})

test('double encoding', () => {
  expect.assertions(8)
  const findMyWay = FindMyWay()

  function pathParam (req, res, params) {
    expect(params).toEqual(this.expect)
    expect(pathParam).toEqual(this.handler)
  }
  function regexPathParam (req, res, params) {
    expect(params).toEqual(this.expect)
    expect(regexPathParam).toEqual(this.handler)
  }
  function wildcard (req, res, params) {
    expect(params).toEqual(this.expect)
    expect(wildcard).toEqual(this.handler)
  }

  findMyWay.on('GET', '/:pathParam', pathParam)
  findMyWay.on('GET', '/reg/:regExeParam(^.*$)', regexPathParam)
  findMyWay.on('GET', '/wild/*', wildcard)

  findMyWay.lookup(get('/' + doubleEncode('reg/hash# .png')), null,
    { expect: { pathParam: singleEncode('reg/hash# .png') }, handler: pathParam }
  )
  findMyWay.lookup(get('/' + doubleEncode('special # $ & + , / : ; = ? @')), null,
    { expect: { pathParam: singleEncode('special # $ & + , / : ; = ? @') }, handler: pathParam }
  )
  findMyWay.lookup(get('/reg/' + doubleEncode('hash# .png')), null,
    { expect: { regExeParam: singleEncode('hash# .png') }, handler: regexPathParam }
  )
  findMyWay.lookup(get('/wild/' + doubleEncode('mail@mail.it')), null,
    { expect: { '*': singleEncode('mail@mail.it') }, handler: wildcard }
  )

  function doubleEncode (str) {
    return encodeURIComponent(encodeURIComponent(str))
  }
  function singleEncode (str) {
    return encodeURIComponent(str)
  }
})

test('Special chars on path parameter', () => {
  expect.assertions(10)
  const findMyWay = FindMyWay()

  function pathParam (req, res, params) {
    expect(params).toEqual(this.expect)
    expect(pathParam).toEqual(this.handler)
  }
  function regexPathParam (req, res, params) {
    expect(params).toEqual(this.expect)
    expect(regexPathParam).toEqual(this.handler)
  }
  function staticEncoded (req, res, params) {
    expect(params).toEqual(this.expect)
    expect(staticEncoded).toEqual(this.handler)
  }

  findMyWay.on('GET', '/:pathParam', pathParam)
  findMyWay.on('GET', '/reg/:regExeParam(^\\d+) .png', regexPathParam)
  findMyWay.on('GET', '/[...]/a%2520.html', staticEncoded)

  findMyWay.lookup(get('/%5B...%5D/a%252520.html'), null, { expect: {}, handler: staticEncoded })
  findMyWay.lookup(get('/[...].html'), null, { expect: { pathParam: '[...].html' }, handler: pathParam })
  findMyWay.lookup(get('/reg/123 .png'), null, { expect: { regExeParam: '123' }, handler: regexPathParam })
  findMyWay.lookup(get('/reg%2F123 .png'), null, { expect: { pathParam: 'reg/123 .png' }, handler: pathParam }) // en encoded / is considered a parameter
  findMyWay.lookup(get('/reg/123%20.png'), null, { expect: { regExeParam: '123' }, handler: regexPathParam })
})

test('Multi parametric route with encoded colon separator', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/:param(.*)::suffix', (req, res, params) => {
    expect(params.param).toBe('foo-bar')
  })

  findMyWay.lookup({ method: 'GET', url: '/foo-bar%3Asuffix', headers: {} }, null)
})

function get (url) {
  return { method: 'GET', url, headers: {} }
}

// http://localhost:3000/parameter with / in it
// http://localhost:3000/parameter%20with%20%2F%20in%20it

// http://localhost:3000/parameter with %252F in it
