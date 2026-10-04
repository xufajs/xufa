const { sep } = require('node:path')

const Fastify = require('@xufa/http')
const { kSchemaController } = require('../../lib/symbols')

test('SchemaController are NOT loaded when the controllers are custom', async () => {
  const app = Fastify({
    schemaController: {
      compilersFactory: {
        buildValidator: () => () => { },
        buildSerializer: () => () => { }
      }
    }
  })

  await app.ready()

  const loaded = Object.keys(require.cache)
  const ajvModule = loaded.find((path) => path.includes(`lib${sep}validator-compiler`))
  const stringifyModule = loaded.find((path) => path.includes(`lib${sep}serializer-compiler`))

  expect(ajvModule).toBe(undefined)
  expect(stringifyModule).toBe(undefined)
})

test('isCustomSerializerCompiler flag is set correctly when only buildSerializer is provided', async () => {
  const app = Fastify({
    schemaController: {
      compilersFactory: {
        buildSerializer: () => () => { }
      }
    }
  })

  await app.ready()

  const schemaController = app[kSchemaController]
  expect(schemaController.isCustomValidatorCompiler).toBe(false)
  expect(schemaController.isCustomSerializerCompiler).toBe(true)
})

test('isCustomValidatorCompiler flag is set correctly when only buildValidator is provided', async () => {
  const app = Fastify({
    schemaController: {
      compilersFactory: {
        buildValidator: () => () => { }
      }
    }
  })

  await app.ready()

  const schemaController = app[kSchemaController]
  expect(schemaController.isCustomValidatorCompiler).toBe(true)
  expect(schemaController.isCustomSerializerCompiler).toBe(false)
})

test('SchemaController are loaded when the controllers are not custom', async () => {
  const app = Fastify()
  await app.ready()

  const loaded = Object.keys(require.cache)
  const ajvModule = loaded.find((path) => path.includes(`lib${sep}validator-compiler`))
  const stringifyModule = loaded.find((path) => path.includes(`lib${sep}serializer-compiler`))

  onTestFinished(() => {
    delete require.cache[ajvModule]
    delete require.cache[stringifyModule]
  })

  expect(ajvModule).toBeTruthy()
  expect(stringifyModule).toBeTruthy()
})
