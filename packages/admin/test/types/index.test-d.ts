import { expectType, expectError } from 'tsd';
import { Model, Tenants, fields } from '@xufa/orm';
import { Rbac } from '@xufa/auth';
import xufa from '@xufa/http';
import { Queue, Pipelines } from '@xufa/queue';
import { admin, describeModel, AdminModel, AdminModelOptions } from '../..';
import { Scheduler } from '@xufa/scheduler';

class Book extends Model {
  static fields = { title: fields.string() };
}
const app = xufa();
app.register(admin, {
  prefix: '/admin',
  models: [Book, [Book, { list: ['title'], readOnlyModel: true }]],
  authorize: (request) => true,
});
app.register(admin, { models: [Book], authorize: 'development' });
expectError(admin(app, { models: [Book] }));
expectType<AdminModel>(describeModel(Book, { search: ['title'] }));

declare const queue: Queue;
xufa().register(admin, { authorize: 'development', models: [], pipelines: new Pipelines(queue), health: false });

xufa().register(admin, {
  models: [],
  login: {
    findUser: async (email: string) => ({ email, password: 'x', role: 'staff' }),
    allow: (user) => user.role === 'staff',
    lockout: { maxAttempts: 3 },
    reload: async (id) => (id ? { email: 'ada@example.com', password: 'x', role: 'staff' } : null),
    setPassword: async (user, hash) => { user.password = hash; },
    minPasswordLength: 12,
    setTotp: (user, secret) => (secret === null ? 'removed' : secret.length),
    recoveryCodes: (user) => (user.role ? [] : null),
    setRecoveryCodes: async (user, hashes: string[]) => hashes.length,
  },
});

// @ts-expect-error a secret is a string
xufa().register(admin, { models: [], login: { findUser: () => null, setTotp: (user: unknown, secret: number) => secret } });
xufa().register(admin, { authorize: 'development', models: [], queue });
xufa().register(admin, { authorize: 'development', models: [], scheduler: new Scheduler() });
// @ts-expect-error a scheduler has jobs() and runNow()
xufa().register(admin, { authorize: 'development', models: [], scheduler: {} });

// Roles and permissions by tenant.
{
  const tenants = new Tenants({ models: [], config: () => ({ backend: 'memory' }) });
  xufa().register(admin, {
    models: [],
    authorize: () => true,
    rbac: new Rbac({ roles: { viewer: ['*.view'] } }),
    tenants: { tenants, list: () => ['acme', 'globex'], label: (id) => id.toUpperCase() },
  });
  xufa().register(admin, {
    models: [],
    login: { findUser: async () => null },
    rbac: { roles: { editor: { inherits: 'viewer', permissions: ['Book.change'] }, viewer: ['*.view'] } },
  });
  expectError(xufa().register(admin, { models: [], authorize: () => true, tenants: { tenants } }));
}

// Columns of methods and paths, fields on one line, fieldsets (Django's ModelAdmin).
{
  const options: AdminModelOptions = {
    list: ['title', 'author__name', 'displayGenre', { name: 'size', label: 'Size', value: (book) => book.title.length }],
    fields: ['title', ['isbn', 'pages']],
    inlines: ['reviewSet', { relation: 'bookInstanceSet', fields: ['imprint', 'status'], extra: 2 }],
    fieldsets: [
      [null, { fields: ['book', 'imprint'] }],
      ['Availability', { fields: ['status', ['dueBack', 'borrower']], collapse: true }],
    ],
  };
  expectType<AdminModelOptions>(options);
  expectError<AdminModelOptions>({ fieldsets: [['x', { fields: 7 }]] });
}
