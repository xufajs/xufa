'use strict'


const noopSet = require('../lib/noop-set')

test('does a lot of nothing', async () => {
  const aSet = noopSet()
  expect(aSet).toBeTruthy()

  const item = {}
  aSet.add(item)
  aSet.add({ another: 'item' })
  aSet.delete(item)
  expect(aSet.has(item)).toBe(true)

  for (const i of aSet) {
    expect.fail('should not have any items: ' + i)
  }
})
