// The package from ESM: its default export (the plugin), its named ones, and @xufa/openapi/ui.
const xufa = require('@xufa/http');

describe('ESM', () => {
  it('imports the plugin and the explorer', async () => {
    const { openapi, fastifySwagger, formatParamUrl, ui } = await import('./esm.mjs');
    expect(openapi).toBe(fastifySwagger);
    expect(formatParamUrl('/books/:id')).toBe('/books/{id}');
    const app = xufa();
    await app.register(openapi, { openapi: { info: { title: 'ESM', version: '1' } } });
    await app.register(ui);
    await app.ready();
    expect((await app.inject({ url: '/documentation/json' })).json().info.title).toBe('ESM');
  });
});
