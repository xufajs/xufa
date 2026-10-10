// The package xufa gives the framework of @xufa/http, in CommonJS and as an ES module.
import xufa from 'xufa';
import http from '@xufa/http';
import { createRequire } from 'node:module';
import * as ormModule from 'xufa/orm';
import * as ormModule_ from '@xufa/orm';
import * as authModule from 'xufa/auth';
import * as authModule_ from '@xufa/auth';
import * as expressionModule from 'xufa/expression';
import * as expressionModule_ from '@xufa/expression';
import * as templateModule from 'xufa/template';
import * as templateModule_ from '@xufa/template';
import * as mailModule from 'xufa/mail';
import * as mailModule_ from '@xufa/mail';
import * as i18nModule from 'xufa/i18n';
import * as i18nModule_ from '@xufa/i18n';
import * as openapiModule from 'xufa/openapi';
import * as uiModule from 'xufa/openapi/ui';
import * as clientModule from 'xufa/client';
import * as clientModule_ from '@xufa/client';
import * as configModule from 'xufa/config';
import * as configModule_ from '@xufa/config';
import * as schemaModule from 'xufa/schema';
import * as schemaModule_ from '@xufa/schema';
import * as schedulerModule from 'xufa/scheduler';
import * as schedulerModule_ from '@xufa/scheduler';
import * as adminModule from 'xufa/admin';
import * as adminModule_ from '@xufa/admin';
import * as sessionModule from 'xufa/session';
import * as sessionModule_ from '@xufa/session';
import * as queueModule from 'xufa/queue';
import * as queueModule_ from '@xufa/queue';
import * as faultsModule from 'xufa/faults';
import * as faultsModule_ from '@xufa/faults';

const require = createRequire(import.meta.url);

// A subpath of xufa re-exports its package (export *): a namespace of its own, with the same exports.
function expectSameExports(umbrella, own) {
  const names = (namespace) => Object.keys(namespace).filter((name) => name !== 'module.exports').sort();
  expect(names(umbrella)).toEqual(names(own));
  for (const name of names(own)) expect([name, umbrella[name]]).toEqual([name, own[name]]);
}

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
    expectSameExports(ormModule, ormModule_);
  });
});

describe('xufa/auth', () => {
  it('is @xufa/auth', () => {
    expectSameExports(authModule, authModule_);
  });
});

describe('xufa/expression and xufa/template', () => {
  it('are @xufa/expression and @xufa/template', () => {
    expectSameExports(expressionModule, expressionModule_);
    expectSameExports(templateModule, templateModule_);
  });

  it('xufa/mail is @xufa/mail, xufa/i18n is @xufa/i18n', () => {
    expectSameExports(mailModule, mailModule_);
    expectSameExports(i18nModule, i18nModule_);
  });
});

describe('xufa/openapi', () => {
  it('is @xufa/openapi, and xufa/openapi/ui its explorer', () => {
    // @xufa/openapi is CommonJS: its module.exports is the default export, and what require() gives, of both.
    expect(openapiModule.default).toBe(require('@xufa/openapi'));
    expect(require('xufa/openapi')).toBe(require('@xufa/openapi'));
    expect(uiModule.default).toBe(require('@xufa/openapi/ui'));
    expect(require('xufa/openapi/ui')).toBe(require('@xufa/openapi/ui'));
  });
});

describe('xufa/client', () => {
  it('is @xufa/client', () => {
    expectSameExports(clientModule, clientModule_);
  });
});

describe('xufa/config', () => {
  it('is @xufa/config', () => {
    expectSameExports(configModule, configModule_);
  });
});

describe('xufa/schema', () => {
  it('is @xufa/schema', () => {
    expectSameExports(schemaModule, schemaModule_);
  });
});

describe('xufa/scheduler', () => {
  it('is @xufa/scheduler', () => {
    expectSameExports(schedulerModule, schedulerModule_);
  });
});

describe('xufa/admin', () => {
  it('is @xufa/admin', () => {
    expectSameExports(adminModule, adminModule_);
  });
});

describe('xufa/session', () => {
  it('is @xufa/session', () => {
    expectSameExports(sessionModule, sessionModule_);
  });
});

describe('xufa/queue', () => {
  it('is @xufa/queue', () => {
    expectSameExports(queueModule, queueModule_);
  });
});

describe('xufa/faults', () => {
  it('is @xufa/faults; clearFaults() clears those of the ORM, its caches and the clients', async () => {
    expectSameExports(faultsModule, faultsModule_);
    const { clearFaults, activeFaults } = faultsModule;
    const { Database, MemoryCache } = ormModule;
    const { createClient } = clientModule;
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
