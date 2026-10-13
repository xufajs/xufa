import { kind } from './lib/uses-dep.mjs';

test('the file after it imports the real module', () => {
  expect(kind()).toBe('real');
});
