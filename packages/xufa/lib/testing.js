// The tests of a project (Django's TestCase): useTestApp() builds the app of xufa.yaml once for a file of tests (SQLite
// in memory, migrated, and one for each tenant; light scrypt; the emails kept), rolls back each test (in the databases
// of the tenants too), loads fixtures before each, and closes it after them. It gives the app, ready once the tests run, with what the tests use:
//
//   import { test } from 'node:test';
//   import { useTestApp } from 'xufa/testing';
//   const app = useTestApp({ fixtures: ['library'] });
//
//   test('the list of books', async () => {
//     const client = app.client();                          // a TestClient (Django's self.client)
//     await app.createUser('ada', 'a-password');          // a user (create_user), by the field of the login
//     await client.login({ username: 'ada', password: 'a-password' });
//     assert.equal((await client.get(app.reverse('books'))).statusCode, 200);
//     assert.equal(app.mails.length, 0);                  // the emails sent (Django's mail.outbox)
//   });
//
// The hooks are those of the runner: globals (vyntra, jest, vitest) or those of node:test.
import fs from 'node:fs';
import path from 'node:path';
import { loadProject, projectFile } from './project.js';
import { loadFixtureFile, FIXTURE_EXTENSIONS } from './fixtures.js';
import { createRequire } from 'node:module';
import httpModule from '@xufa/http';
import * as ormModule from '@xufa/orm';

const require = createRequire(import.meta.url);

// Light scrypt: the hashes of tests need not be slow.
const PASSWORD_OPTIONS = Object.freeze({ ln: 4 });

function hooksOf(given) {
  if (given) return given;
  const g = globalThis;
  if (typeof g.beforeAll === 'function' && typeof g.beforeEach === 'function') {
    return { before: g.beforeAll, after: g.afterAll, beforeEach: g.beforeEach, afterEach: g.afterEach };
  }
  const nodeTest = require('node:test'); // eslint-disable-line global-require
  return {
    before: nodeTest.before,
    after: nodeTest.after,
    beforeEach: nodeTest.beforeEach,
    afterEach: nodeTest.afterEach,
  };
}

// The folder of the project: root, else the first folder from the working one up with a xufa.yaml.
function rootOf(given) {
  if (given) return path.resolve(given);
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    if (projectFile(dir)) return dir;
    if (path.dirname(dir) === dir) throw new Error('useTestApp(): no xufa.yaml from here up (give root)');
  }
}

// The file of a fixture by name: fixtures/<name>, then seeds/<name>, with its extension or one of them.
function fixtureFile(root, name) {
  for (const folder of ['fixtures', 'seeds']) {
    const base = path.join(root, folder, name);
    for (const candidate of [base, ...FIXTURE_EXTENSIONS.map((ext) => `${base}${ext}`)]) {
      if (FIXTURE_EXTENSIONS.includes(path.extname(candidate)) && fs.existsSync(candidate)) return candidate;
    }
  }
  throw new Error(`useTestApp(): no fixture ${name} in fixtures/ or seeds/`);
}

// options: root (the folder of the project), fixtures (names loaded before each test), databaseUrl
// ('sqlite::memory:'), tenantsUrl (the database of each tenant: 'sqlite::memory:', unless the overrides give
// tenants.database), passwordOptions, rollback (true), hooks ({ before, after, beforeEach, afterEach }), overrides (of
// the configuration), build (more options of project.build()).
function useTestApp(options = {}) {
  const {
    root,
    fixtures = [],
    databaseUrl = 'sqlite::memory:',
    tenantsUrl: givenTenantsUrl,
    passwordOptions = PASSWORD_OPTIONS,
    rollback = true,
    hooks,
    overrides,
    build = {},
  } = options;
  const { before, after, beforeEach, afterEach } = hooksOf(hooks);
  const tenantsUrl =
    givenTenantsUrl !== undefined || (overrides && overrides.tenants && overrides.tenants.database)
      ? givenTenantsUrl
      : 'sqlite::memory:';
  const dir = rootOf(root);
  const files = [].concat(fixtures).map((name) => fixtureFile(dir, name));
  const mails = [];
  let project = null;
  let app = null;

  const extras = {
    mails,
    get project() {
      return project;
    },
    // A TestClient of the app (options: headers, enforceCsrfChecks).
    client(clientOptions) {
      const { TestClient } = httpModule;
      return new TestClient(handle, clientOptions);
    },
    // A user of the model of users (auth.user), its login field (auth.loginBy, else email) and password.
    async createUser(login, password, values = {}) {
      const ref = project.config.auth && project.config.auth.user;
      if (!ref) throw new Error('createUser(): the project has no auth.user');
      const User = project.model(ref);
      const field = (project.config.auth && project.config.auth.loginBy) || 'email';
      const user = new User({ [field]: login, ...values });
      await user.setPassword(password, passwordOptions);
      return user.save();
    },
  };

  // The app, ready once the tests run: its own properties and methods, and the extras above.
  const handle = new Proxy(extras, {
    get(target, name) {
      if (Object.hasOwn(target, name)) return target[name];
      if (!app) throw new Error(`useTestApp(): the app is made before the tests (app.${String(name)} read too soon)`);
      const value = Reflect.get(app, name);
      return typeof value === 'function' ? value.bind(app) : value;
    },
    has(target, name) {
      return Object.hasOwn(target, name) || (app !== null && name in app);
    },
  });

  before(async () => {
    project = await loadProject(dir, overrides ? { overrides } : {});
    app = await project.build({
      databaseUrl,
      tenantsUrl,
      logger: false,
      migrate: true,
      passwordOptions,
      mailLog: (text) => mails.push(text),
      // No workers of the queue: a test runs its jobs (app.queue.runDue()), in its transaction.
      work: false,
      ...build,
    });
    await app.ready();
    // The tables of models without migrations (Django's run_syncdb in tests).
    await app.db.sync();
  });
  after(async () => {
    if (app) await app.close();
  });
  if (rollback) {
    const { rollbackEach } = ormModule;
    rollbackEach(() => [app.db, project.tenants()], { beforeEach, afterEach });
  }
  beforeEach(async () => {
    mails.length = 0;
    const modelOf = (name) => project.model(name);
    for (const file of files) await loadFixtureFile(file, { modelOf, passwordOptions });
  });
  return handle;
}

export { useTestApp, PASSWORD_OPTIONS };
