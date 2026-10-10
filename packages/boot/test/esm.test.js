test('support esm import', async () => {
  await import('./esm.mjs')
  expect('esm is supported').toBeTruthy()
})
