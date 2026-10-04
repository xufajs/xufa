// The package xufa gives the framework of @xufa/http, in CommonJS and as an ES module.
const xufa = require('xufa');
const http = require('@xufa/http');

describe('xufa', () => {
  it('is @xufa/http', () => {
    expect(xufa).toBe(http);
    expect(xufa.plugin).toBe(http.plugin);
  });

  it('has the exports of @xufa/http as an ES module', async () => {
    const esm = await import('xufa');
    const httpEsm = await import('@xufa/http');
    expect(esm.default).toBe(httpEsm.default);
    expect(esm.xufa).toBe(httpEsm.xufa);
    expect(esm.plugin).toBe(httpEsm.plugin);
    expect(esm.errorCodes).toBe(httpEsm.errorCodes);
  });

  it('serves requests', async () => {
    const app = xufa();
    app.get('/', async () => ({ hello: 'world' }));
    expect((await app.inject('/')).json()).toEqual({ hello: 'world' });
  });
});

describe('xufa/orm', () => {
  it('is @xufa/orm', () => {
    expect(require('xufa/orm')).toBe(require('@xufa/orm'));
  });
});

describe('xufa/auth', () => {
  it('is @xufa/auth', () => {
    expect(require('xufa/auth')).toBe(require('@xufa/auth'));
  });
});
