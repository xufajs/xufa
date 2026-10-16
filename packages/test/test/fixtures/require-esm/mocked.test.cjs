test('cjs mocked: require() gives the mock', () => {
  vi.doMock('./lib/state.mjs', () => ({ default: () => ['mocked'], seen: [] }));
  expect(require('./lib/state.mjs').default('x')).toEqual(['mocked']);
});
