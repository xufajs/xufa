'use strict'


const { formatParamUrl } = require('../lib/util/format-param-url')
const { hasParams, matchParams } = require('../lib/util/match-params')
const { generateParamsSchema, paramName } = require('../lib/util/generate-params-schema')
const { shouldRouteHide } = require('../lib/util/should-route-hide')

const cases = [
  ['/example/:userId', '/example/{userId}'],
  ['/example/:userId/:secretToken', '/example/{userId}/{secretToken}'],
  ['/example/near/:lat-:lng/radius/:r', '/example/near/{lat}-{lng}/radius/{r}'],
  ['/example/near/:lat_1-:lng_1/radius/:r_1', '/example/near/{lat_1}-{lng_1}/radius/{r_1}'],
  ['/example/*', '/example/{*}'],
  ['/example/:file(^\\d+).png', '/example/{file}.png'],
  ['/example/at/:hour(^\\d{2})h:minute(^\\d{2})m', '/example/at/{hour}h{minute}m'],
  ['/example/at/(^\\d{2})h(^\\d{2})m', '/example/at/{regexp1}h{regexp2}m'],
  ['/example/at/(^([0-9]{2})h$)-(^([0-9]{2})m$)', '/example/at/{regexp1}-{regexp2}'],
  ['/name::verb', '/name:verb'],
  ['/api/v1/postalcode-jp/:code(^[0-9]{7}$)', '/api/v1/postalcode-jp/{code}'],
  ['/api/v1/postalcode-jp/(^[0-9]{7}$)', '/api/v1/postalcode-jp/{regexp1}']
]

describe('formatParamUrl', () => {
for (const kase of cases) {
    test(`formatParamUrl ${kase}`, () => {
      expect(formatParamUrl(kase[0])).toBe(kase[1])
    })
  }
})

describe('hasParams function', () => {
test('should return false for empty url', () => {
    const url = ''
    const result = hasParams(url)
    expect(result).toBe(false)
  })
test('should return true for url with parameters', () => {
    const url = '/example/{userId}'
    const result = hasParams(url)
    expect(result).toBe(true)
  })
test('should return true for url with multiple parameters', () => {
    const url = '/example/{userId}/{secretToken}'
    const result = hasParams(url)
    expect(result).toBe(true)
  })
test('should return false for url without parameters', () => {
    const url = '/example/path'
    const result = hasParams(url)
    expect(result).toBe(false)
  })
})

describe('matchParams function', () => {
test('should return an empty array for empty url', () => {
    const url = ''
    const result = matchParams(url)
    expect(result).toEqual([])
  })
test('should return an array of matched parameters', () => {
    const url = '/example/{userId}/{secretToken}'
    const result = matchParams(url)
    expect(result).toEqual(['{userId}', '{secretToken}'])
  })
test('should return an empty array for url without parameters', () => {
    const url = '/example/path'
    const result = matchParams(url)
    expect(result).toEqual([])
  })
})

describe('generateParamsSchema function', () => {
const urlsToShemas = [
    [
      '/example/{userId}', {
        params: {
          type: 'object',
          properties: {
            userId: {
              type: 'string'
            }
          }
        }
      }
    ],
    [
      '/example/{userId}/{secretToken}', {
        params: {
          type: 'object',
          properties: {
            userId: {
              type: 'string'
            },
            secretToken: {
              type: 'string'
            }
          }
        }
      }
    ],
    [
      '/example/near/{lat}-{lng}', {
        params: {
          type: 'object',
          properties: {
            lat: {
              type: 'string'
            },
            lng: {
              type: 'string'
            }
          }
        }
      }
    ]
  ]
test('generateParamsSchema', () => {
    for (const [url, expectedSchema] of urlsToShemas) {
      const result = generateParamsSchema(url)

      expect(result).toEqual(expectedSchema)
    }
  })
})

describe('paramName function', () => {
test('should return the captured value from the param', () => {
    const param = '{userId}'
    const result = paramName(param)
    expect(result).toBe('userId')
  })
test('should return the same value if there are no captures', () => {
    const param = 'userId'
    const result = paramName(param)
    expect(result).toBe('userId')
  })
})

describe('shouldRouteHide', () => {
test('shouldRouteHide should return true for hidden route', () => {
    expect(shouldRouteHide({ hide: true }, {})).toBeTruthy()
  })
test('shouldRouteHide should return true for hideUntagged', () => {
    expect(shouldRouteHide({ tags: [] }, { hideUntagged: true })).toBeTruthy()
  })
test('shouldRouteHide should return true for hiddenTag', () => {
    expect(shouldRouteHide({ tags: ['x-test'] }, { hiddenTag: 'x-test' })).toBeTruthy()
  })
test('shouldRouteHide should return false for non hidden route', () => {
    expect(shouldRouteHide({}, {})).toBe(false)
  })
})

describe('definitions', () => {
const {
    prepareSharedSchemas,
    hoistDefinitions,
    rewriteAnchorRefs,
    rewriteHoistedRefs
  } = require('../lib/util/definitions')
test('prepareSharedSchemas absolutizes the local refs using the closest non-fragment $id', () => {
    const schema = {
      $id: 'http://example.com/root.json#',
      properties: {
        a: { $ref: '#/definitions/a' },
        b: { $id: '#anchor', properties: { c: { $ref: '#' } } },
        d: { $id: 'other.json', items: [{ $ref: '#/items/1' }, { type: 'string' }] },
        e: { $ref: 'external#' },
        f: { enum: [{ $ref: '#/not/a/schema' }], dependencies: { a: ['b'] } }
      }
    }
    prepareSharedSchemas([schema])

    expect(schema.properties.a.$ref).toBe('http://example.com/root.json#/definitions/a')
    expect(schema.properties.b.properties.c.$ref).toBe('http://example.com/root.json#')
    expect(schema.properties.d.items[0].$ref).toBe('other.json#/items/1')
    expect(schema.properties.e.$ref).toBe('external#')
    expect(schema.properties.f.enum[0].$ref).toBe('#/not/a/schema')
  })
test('prepareSharedSchemas ignores schemas without $id', () => {
    const schema = { $ref: '#/definitions/a' }
    expect(prepareSharedSchemas([schema, true])).toEqual(new Map())
    expect(schema).toEqual({ $ref: '#/definitions/a' })
  })
test('hoistDefinitions escapes the JSON pointer tokens', () => {
    const hoisted = new Map()
    const shared = { type: 'string' }
    const schema = {
      definitions: { shared, 'a/b~c': { type: 'integer' } },
      properties: { 'x/y': { definitions: { z: { type: 'boolean' } } } }
    }

    const result = hoistDefinitions('root', schema, { shared }, hoisted)

    expect(result).toEqual([
      ['root-a/b~c', { type: 'integer' }],
      ['root-z', { type: 'boolean' }]
    ])
    expect(Object.fromEntries(hoisted)).toEqual({
      'root/definitions/a~1b~0c': 'root-a/b~c',
      'root/properties/x~1y/definitions/z': 'root-z'
    })
    expect(schema).toEqual({ properties: { 'x/y': {} } })
  })
test('rewriteHoistedRefs rewrites only the hoisted references', () => {
    const hoisted = new Map([['a/definitions/b', 'a-b'], ['a/definitions/b/definitions/c', 'a-c']])
    const document = {
      list: [
        { $ref: '#/definitions/a/definitions/b/definitions/c/properties/d' },
        { $ref: '#/definitions/a/definitions/b' },
        { $ref: '#/definitions/a/properties/b' },
        { $ref: '#/parameters/a/definitions/b' },
        { $ref: 42 },
        null
      ]
    }

    rewriteHoistedRefs(document, '#/definitions/', hoisted)
    expect(document.list).toEqual([
      { $ref: '#/definitions/a-c/properties/d' },
      { $ref: '#/definitions/a-b' },
      { $ref: '#/definitions/a/properties/b' },
      { $ref: '#/parameters/a/definitions/b' },
      { $ref: 42 },
      null
    ])

    const untouched = { $ref: '#/definitions/a/definitions/b' }
    rewriteHoistedRefs(untouched, '#/definitions/', new Map())
    expect(untouched).toEqual({ $ref: '#/definitions/a/definitions/b' })
  })
test('prepareSharedSchemas maps the anchors to the JSON pointer of their schema resource', () => {
    const orphan = { definitions: { noBase: { $id: '#orphan' } } }
    const root = {
      $id: 'http://example.com/root.json',
      definitions: {
        'a/b': { $id: '#escaped' },
        first: { $id: '#twice' },
        second: { $id: '#twice' },
        empty: { $id: '#' },
        nested: {
          $id: 'http://example.com/nested.json',
          properties: { c: { $id: '#inner' } }
        }
      },
      enum: [{ $id: '#data' }]
    }
    const anchors = prepareSharedSchemas([root, orphan, true])

    expect(Object.fromEntries(anchors)).toEqual({
      'http://example.com/root.json#escaped': 'http://example.com/root.json#/definitions/a~1b',
      'http://example.com/root.json#twice': 'http://example.com/root.json#/definitions/first',
      'http://example.com/nested.json#inner': 'http://example.com/nested.json#/properties/c'
    })

    // the anchors are removed, data and schemas without a base URI are left untouched
    expect(root.definitions.first).toEqual({})
    expect(root.definitions.empty).toEqual({})
    expect(root.definitions.nested.$id).toBe('http://example.com/nested.json')
    expect(root.definitions.nested.properties.c).toEqual({})
    expect(root.enum).toEqual([{ $id: '#data' }])
    expect(orphan.definitions.noBase.$id).toBe('#orphan')
  })
test('prepareSharedSchemas rewrites the refs to an anchor declared later', () => {
    const schema = {
      $id: 'http://example.com/root.json',
      properties: {
        a: { $ref: '#address' },
        b: { $ref: 'http://example.com/root.json#address' },
        c: { $ref: '#missing' }
      },
      definitions: { address: { $id: '#address', type: 'object' } }
    }
    prepareSharedSchemas([schema])

    expect(schema.properties.a.$ref).toBe('http://example.com/root.json#/definitions/address')
    expect(schema.properties.b.$ref).toBe('http://example.com/root.json#/definitions/address')
    expect(schema.properties.c.$ref).toBe('http://example.com/root.json#missing')
    expect(schema.definitions.address).toEqual({ type: 'object' })
  })
test('rewriteAnchorRefs only touches the references to a known anchor', () => {
    const anchors = new Map([['common#address', 'common#/definitions/foo']])
    const responses = {
      200: { $ref: 'common#address' },
      404: { oneOf: [{ $ref: 'common#address' }, { $ref: 'common#unknown' }, { $ref: 42 }, null] }
    }

    expect(rewriteAnchorRefs(responses, anchors)).toBe(responses)
    expect(responses).toEqual({
      200: { $ref: 'common#/definitions/foo' },
      404: { oneOf: [{ $ref: 'common#/definitions/foo' }, { $ref: 'common#unknown' }, { $ref: 42 }, null] }
    })
    expect(rewriteAnchorRefs(true, anchors)).toBe(true)
  })
})
