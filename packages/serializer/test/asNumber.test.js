import { createRequire } from 'node:module';
import * as runtimeModule from '../lib/runtime.js';

const require = createRequire(import.meta.url);

test('asNumber should convert BigInt', () => {
  expect.assertions(1)
  const serializer = runtimeModule

  const number = serializer.asNumber(11753021440n)

  expect(number).toBe('11753021440')
})
