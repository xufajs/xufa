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

describe('xufa/expression and xufa/template', () => {
  it('are @xufa/expression and @xufa/template', () => {
    expect(require('xufa/expression')).toBe(require('@xufa/expression'));
    expect(require('xufa/template')).toBe(require('@xufa/template'));
  });
});

describe('xufa/openapi', () => {
  it('is @xufa/openapi, and xufa/openapi/ui its explorer', () => {
    expect(require('xufa/openapi')).toBe(require('@xufa/openapi'));
    expect(require('xufa/openapi/ui')).toBe(require('@xufa/openapi/ui'));
  });
});

describe('xufa/client', () => {
  it('is @xufa/client', () => {
    expect(require('xufa/client')).toBe(require('@xufa/client'));
  });
});

describe('xufa/config', () => {
  it('is @xufa/config', () => {
    expect(require('xufa/config')).toBe(require('@xufa/config'));
  });
});

describe('xufa/schema', () => {
  it('is @xufa/schema', () => {
    expect(require('xufa/schema')).toBe(require('@xufa/schema'));
  });
});

describe('xufa/scheduler', () => {
  it('is @xufa/scheduler', () => {
    expect(require('xufa/scheduler')).toBe(require('@xufa/scheduler'));
  });
});

describe('xufa/admin', () => {
  it('is @xufa/admin', () => {
    expect(require('xufa/admin')).toBe(require('@xufa/admin'));
  });
});

describe('xufa/session', () => {
  it('is @xufa/session', () => {
    expect(require('xufa/session')).toBe(require('@xufa/session'));
  });
});

describe('xufa/queue', () => {
  it('is @xufa/queue', () => {
    expect(require('xufa/queue')).toBe(require('@xufa/queue'));
  });
});

describe('xufa/faults', () => {
  it('is @xufa/faults; clearFaults() clears those of the ORM, its caches and the clients', async () => {
    expect(require('xufa/faults')).toBe(require('@xufa/faults'));
    const { clearFaults, activeFaults } = require('xufa/faults');
    const { Database, MemoryCache } = require('xufa/orm');
    const { createClient } = require('xufa/client');
    const db = new Database({ backend: 'memory' });
    const cache = new MemoryCache();
    const client = createClient({ baseUrl: 'http://127.0.0.1:1' });
    db.faults.down();
    cache.faults.fail({ operations: 'read' });
    client.faults.respond({ status: 503 });
    expect(activeFaults()).toHaveLength(3);
    expect(clearFaults()).toBe(3);
    expect([db.faults.rules, cache.faults.rules, client.faults.rules]).toEqual([[], [], []]);
  });

  // This package's tests run with xufa/faults/register-strict (package.json, "vyntra"): a test that ended with faults
  // set would fail, so every test here clears its own.
  it('xufa/faults/register and register-strict are there', () => {
    expect(require.resolve('xufa/faults/register')).toBe(require.resolve('../faults-register.js'));
    expect(require.resolve('xufa/faults/register-strict')).toBe(require.resolve('../faults-register-strict.js'));
  });
});
