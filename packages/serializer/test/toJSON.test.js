import build from '../index.js';

test('use toJSON method on object types', () => {
  expect.assertions(1)

  const stringify = build({
    title: 'simple object',
    type: 'object',
    properties: {
      productName: {
        type: 'string'
      }
    }
  })
  const object = {
    product: { name: 'cola' },
    toJSON: function () {
      return { productName: this.product.name }
    }
  }

  expect('{"productName":"cola"}').toBe(stringify(object))
})

test('use toJSON method on nested object types', () => {
  expect.assertions(1)

  const stringify = build({
    title: 'simple array',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        productName: {
          type: 'string'
        }
      }
    }
  })
  const array = [
    {
      product: { name: 'cola' },
      toJSON: function () {
        return { productName: this.product.name }
      }
    },
    {
      product: { name: 'sprite' },
      toJSON: function () {
        return { productName: this.product.name }
      }
    }
  ]

  expect('[{"productName":"cola"},{"productName":"sprite"}]').toBe(stringify(array))
})

test('not use toJSON if does not exist', () => {
  expect.assertions(1)

  const stringify = build({
    title: 'simple object',
    type: 'object',
    properties: {
      product: {
        type: 'object',
        properties: {
          name: {
            type: 'string'
          }
        }
      }
    }
  })
  const object = {
    product: { name: 'cola' }
  }

  expect('{"product":{"name":"cola"}}').toBe(stringify(object))
})

test('not fail on null object declared nullable', () => {
  expect.assertions(1)

  const stringify = build({
    title: 'simple object',
    type: 'object',
    nullable: true,
    properties: {
      product: {
        type: 'object',
        properties: {
          name: {
            type: 'string'
          }
        }
      }
    }
  })
  expect('null').toBe(stringify(null))
})

test('not fail on null sub-object declared nullable', () => {
  expect.assertions(1)

  const stringify = build({
    title: 'simple object',
    type: 'object',
    properties: {
      product: {
        nullable: true,
        type: 'object',
        properties: {
          name: {
            type: 'string'
          }
        }
      }
    }
  })
  const object = {
    product: null
  }
  expect('{"product":null}').toBe(stringify(object))
})

test('on non nullable null sub-object it should coerce to {}', () => {
  expect.assertions(1)

  const stringify = build({
    title: 'simple object',
    type: 'object',
    properties: {
      product: {
        nullable: false,
        type: 'object',
        properties: {
          name: {
            type: 'string'
          }
        }
      }
    }
  })
  const object = {
    product: null
  }

  const result = stringify(object)
  expect(result).toBe(JSON.stringify({ product: {} }))
})

test('on non nullable null object it should coerce to {}', () => {
  expect.assertions(1)

  const stringify = build({
    title: 'simple object',
    nullable: false,
    type: 'object',
    properties: {
      product: {
        nullable: false,
        type: 'object',
        properties: {
          name: {
            type: 'string'
          }
        }
      }
    }
  })

  const result = stringify(null)
  expect(result).toBe('{}')
})

test('on non-nullable null object it should skip rendering, skipping required fields checks', () => {
  expect.assertions(1)

  const stringify = build({
    title: 'simple object',
    nullable: false,
    type: 'object',
    properties: {
      product: {
        nullable: false,
        type: 'object',
        properties: {
          name: {
            type: 'string'
          }
        }
      }
    },
    required: ['product']
  })

  const result = stringify(null)
  expect(result).toBe('{}')
})
