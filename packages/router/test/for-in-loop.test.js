import { createRequire } from 'node:module';
import indexModule from '../index.js';

const require = createRequire(import.meta.url);

/* eslint no-extend-native: off */

// Something could extend the Array prototype
Array.prototype.test = null
test('for-in-loop', () => {
  expect(() => {
    require('../index.js')
  }).not.toThrow()
})

test('ignore inherited constraint keys', () => {
  const findMyWay = indexModule()
  const constraints = Object.create({ tap: true })

  expect(() => {
    findMyWay.on('GET', '/test', { constraints }, () => {})
  }).not.toThrow()
})
