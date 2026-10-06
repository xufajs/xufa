// The package xufa gives the framework of @xufa/http, in CommonJS and as an ES module.
require('xufa/faults/register'); // every fault cleared after each test (xufa/faults below)
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

  // xufa/faults/register (required at the top of this file, as a setup file would): cleared after each test.
  it('a test that leaves a fault...', () => {
    const { Database } = require('xufa/orm');
    new Database({ backend: 'memory' }).faults.down();
    expect(require('xufa/faults').activeFaults()).toHaveLength(1);
  });

  it('...leaves none to the next one', () => {
    expect(require('xufa/faults').activeFaults()).toEqual([]);
  });

  it('xufa/faults/register-strict is there (a test that leaves faults fails)', () => {
    expect(require.resolve('xufa/faults/register-strict')).toBe(require.resolve('../faults-register-strict.js'));
  });
});
