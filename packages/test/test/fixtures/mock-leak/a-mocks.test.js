// A CommonJS test file mocks a module of the ES modules it imports (its first file on the thread: the mocking hook is
// registered before the one of the ES modules, which then resolves through it). The file after it must not get the
// mock: where Node resolved the import of ./dep.mjs while it was mocked is not kept for later files.
test('a CommonJS test mocks a module of the ES modules it imports', async () => {
  vi.resetModules();
  vi.doMock('./lib/dep.mjs', () => ({ name: () => 'mocked' }));
  const { kind } = await import('./lib/uses-dep.mjs');
  expect(kind()).toBe('mocked');
  vi.doUnmock('./lib/dep.mjs');
  // Slower than the next file, so that it runs first again once the durations of the files are known.
  await new Promise((resolve) => setTimeout(resolve, 100));
});
