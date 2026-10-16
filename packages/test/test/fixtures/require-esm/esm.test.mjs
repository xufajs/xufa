import { createRequire } from 'node:module';
import mark from './lib/state.mjs';

const require = createRequire(import.meta.url);

test('esm: a copy of its own, the same by import and require', () => {
  expect(require('./lib/state.mjs').default).toBe(mark);
  expect(mark('esm')).toEqual(['esm']);
});
