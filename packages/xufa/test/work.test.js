// The queue, pipelines and tenants of a project of xufa.yaml: the jobs of <app>/jobs.js, the blocks of
// <app>/blocks.js and the pipelines of <app>/pipelines.yaml in the queue of its database, its tenants (a database
// for each, with the models of their apps), and all of them in the admin.
import fs from 'node:fs';
import path from 'node:path';
import { loadProject } from '../project.js';
import { TestClient } from '@xufa/http';

const root = path.join(import.meta.dirname, `.tmp-work-${process.pid}`);
const write = (name, content) => {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

beforeAll(() => {
  write(
    'xufa.yaml',
    [
      'name: Shop',
      'apps: [people, shop]',
      "database: { url: 'memory:' }",
      'auth: { user: people.Member, loginBy: username }',
      'admin: true',
      'queue: { work: false, keepDone: true }',
      'pipelines: true',
      'tenants:',
      '  apps: [shop]',
      "  database: { url: 'memory:' }",
      '  list: [acme, globex]',
      '  labels: { acme: ACME Inc }',
      '  resolve: subdomain',
      '',
    ].join('\n')
  );
  write(
    'people/models.js',
    [
      "import { Model, fields } from '@xufa/orm';",
      "import { AbstractUser } from '@xufa/auth';",
      'export class Member extends AbstractUser(Model, fields) {}',
      '',
    ].join('\n')
  );
  write(
    'shop/models.js',
    [
      "import { Model, fields } from '@xufa/orm';",
      'export class Order extends Model {',
      '  static fields = { item: fields.string({ maxLength: 50 }) };',
      '}',
      '',
    ].join('\n')
  );
  write(
    'shop/jobs.js',
    [
      'export async function hello({ name }) {',
      '  return `Hello, ${name}!`;',
      '}',
      'export const receipt = { attempts: 1, run: async ({ order }) => ({ sent: order }) };',
      '',
    ].join('\n')
  );
  write('shop/blocks.js', 'export const double = (input) => input * 2;\n');
  write('shop/admin.yaml', 'Order:\n');
  write(
    'shop/views.js',
    [
      "import { Order } from './models.js';",
      'export default async function views(app) {',
      "  app.get('/orders', async () => [...(await Order.objects.valuesList('item', { flat: true }))]);",
      '}',
      '',
    ].join('\n')
  );
  write(
    'shop/pipelines.yaml',
    [
      '- name: quadruple',
      '  steps:',
      '    - { id: first, block: double }',
      '    - { id: second, block: double, after: first }',
      '',
    ].join('\n')
  );
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('the queue, pipelines and tenants of a project', () => {
  let project;
  let app;

  beforeAll(async () => {
    project = await loadProject(root);
    app = await project.build({ logger: false, passwordOptions: { ln: 4 } });
    await app.ready();
    await app.db.sync();
  });
  afterAll(() => app.close());

  it('jobs of jobs.js, and pipelines of blocks.js and pipelines.yaml, in the queue of the database', async () => {
    const { queue, pipelines } = app.db;
    expect(app.queue).toBe(queue);
    expect(app.pipelines).toBe(pipelines);
    const job = await queue.enqueue('hello', { name: 'Ada' });
    await queue.enqueue('receipt', { order: 7 });
    const run = await pipelines.start('quadruple', 3);
    for (let i = 0; i < 4; i += 1) await queue.runDue();
    expect((await queue.jobs.filter({ pk: job.pk }).first()).result).toBe('Hello, Ada!');
    expect(await queue.counts()).toMatchObject({ failed: 0 });
    const { run: done } = await pipelines.get(run.pk);
    expect([done.status, done.result]).toEqual(['done', 12]);
  });

  it('a database for each tenant, with the models of its apps; the others in that of the project', async () => {
    const tenants = project.tenants();
    const Order = project.model('Order');
    const Member = project.model('Member');
    await tenants.run('acme', () => Order.objects.create({ item: 'anvil' }));
    await tenants.run('globex', () => Order.objects.create({ item: 'rocket' }));
    expect(await tenants.run('acme', async () => [...(await Order.objects.valuesList('item', { flat: true }))])).toEqual(['anvil']);
    expect(await tenants.run('globex', async () => [...(await Order.objects.valuesList('item', { flat: true }))])).toEqual(['rocket']);
    expect(await tenants.list()).toEqual(['acme', 'globex']);
    expect([await tenants.label('acme'), await tenants.label('globex')]).toEqual(['ACME Inc', 'globex']);
    // A tenant not in the list has no database.
    await expect(tenants.run('initech', () => Order.objects.count())).rejects.toThrow();
    // The users are the project's, whatever the tenant.
    await Member.createSuperuser({ username: 'root', email: 'root@example.com', password: 'a long password' });
    expect(await tenants.run('acme', () => Member.objects.count())).toBe(1);
  });

  it('the tenant of a request: its subdomain (resolve); without one, the models of tenants answer nothing', async () => {
    const orders = async (host) => (await app.inject({ url: '/orders', headers: { host } })).json();
    expect(await orders('acme.shop.example')).toEqual(['anvil']);
    expect(await orders('globex.localhost:8000')).toEqual(['rocket']);
    // (Their tables are in each tenant's database only: no other tenant's orders, an error.)
    expect((await app.inject({ url: '/orders', headers: { host: 'shop.example' } })).statusCode).toBe(500);
    expect(app.db.models.has('Order')).toBe(false);
    expect((await app.inject({ url: '/orders', headers: { host: 'initech.shop.example' } })).statusCode).toBe(404);
  });

  it('the admin: jobs, pipeline runs and the tenants to choose', async () => {
    const client = new TestClient(app);
    await client.get('/admin/login');
    const login = await client.post(
      '/admin/login',
      { username: 'root', password: 'a long password' },
      { headers: { 'x-xufa-admin': '1' } }
    );
    expect(login.statusCode).toBe(200);
    const meta = (await client.get('/admin/api/models', null, { headers: { 'x-xufa-admin': '1' } })).json();
    expect([Boolean(meta.jobs), Boolean(meta.runs)]).toEqual([true, true]);
    expect(meta.tenants).toEqual([
      { id: 'acme', label: 'ACME Inc' },
      { id: 'globex', label: 'globex' },
    ]);
    const orders = (
      await client.get('/admin/api/Order', null, { headers: { 'x-xufa-admin': '1', 'x-xufa-tenant': 'globex' } })
    ).json();
    expect(orders.results.map((item) => item.values.item)).toEqual(['rocket']);
    const jobs = (await client.get('/admin/api/_jobs', null, { headers: { 'x-xufa-admin': '1' } })).json();
    expect(jobs.results.map((item) => item.name)).toEqual(expect.arrayContaining(['hello', 'receipt']));
  });
});
