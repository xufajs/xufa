test('cjs two: a copy of its own, the same by require and import', async () => {
  const { default: mark } = require('./lib/state.mjs');
  expect((await import('./lib/state.mjs')).default).toBe(mark);
  expect(mark('two')).toEqual(['two']);
});
