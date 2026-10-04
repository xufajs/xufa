'use strict'


const boot = require('..')
const { kPluginMeta } = require('..')

test('plugins get a name from the plugin metadata if it is set', async () => {
  expect.assertions(2)
  const app = boot()

  const func = (app, opts, next) => next()
  func[kPluginMeta] = { name: 'a-test-plugin' }
  app.use(func)
  await app.ready()

  const jsonToCompare = app.toJSON()

  expect(jsonToCompare.label).toBe('root')
  expect(jsonToCompare.nodes[0].label).toBe('a-test-plugin')
})

test('plugins get a name from the options if theres no metadata', async () => {
  expect.assertions(2)
  const app = boot()

  function testPlugin (app, opts, next) { next() }
  app.use(testPlugin, { name: 'test registration options name' })
  await app.ready()

  const jsonToCompare = app.toJSON()
  expect(jsonToCompare.label).toBe('root')
  expect(jsonToCompare.nodes[0].label).toBe('test registration options name')
})

test('plugins get a name from the function name if theres no name in the options and no metadata', async () => {
  expect.assertions(2)
  const app = boot()

  function testPlugin (app, opts, next) { next() }
  app.use(testPlugin)
  await app.ready()

  const jsonToCompare = app.toJSON()
  expect(jsonToCompare.label).toBe('root')
  expect(jsonToCompare.nodes[0].label).toBe('testPlugin')
})

test('plugins get a name from the function source if theres no other option', async () => {
  expect.assertions(2)
  const app = boot()

  app.use((app, opts, next) => next())
  await app.ready()

  const jsonToCompare = app.toJSON()
  expect(jsonToCompare.label).toBe('root')
  expect(jsonToCompare.nodes[0].label).toBe('(app, opts, next) => next()')
})
