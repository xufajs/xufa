// The organizations are tenants: each with its tickets in a database of its own (in memory in the tests, rolled back
// after each one as that of the project), the site in the one of its subdomain, and the admin with the tenant to choose.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useTestApp } from 'xufa/testing';
import { Organization } from '../accounts/models.js';
import { Ticket } from '../tickets/models.js';

const app = useTestApp();

beforeEach(async () => {
  await Organization.objects.create({ slug: 'acme', name: 'Acme Corporation' });
  await Organization.objects.create({ slug: 'globex', name: 'Globex' });
});

const page = async (host) => (await app.client().get('/', null, { headers: { host } })).textContent;

test('the site: the tickets of the organization of the subdomain, in its own database', async () => {
  const tenants = app.project.tenants();
  await tenants.run('acme', () => Ticket.objects.create({ title: 'The anvils arrive dented' }));
  await tenants.run('globex', () => Ticket.objects.create({ title: 'VPN drops every hour' }));
  const acme = await page('acme.localhost:8001');
  assert.match(acme, /Acme Corporation/);
  assert.match(acme, /The anvils arrive dented/);
  assert.doesNotMatch(acme, /VPN/);
  assert.match(await page('globex.localhost:8001'), /VPN drops every hour/);
  // Without a subdomain: the organizations; one that is not there: 404.
  assert.match(await page('localhost:8001'), /acme\.localhost:8001/);
  const missing = await app.client().get('/', null, { headers: { host: 'initech.localhost:8001' } });
  assert.equal(missing.statusCode, 404);
});

test('a new organization is a new tenant', async () => {
  await Organization.objects.create({ slug: 'initech', name: 'Initech' });
  assert.deepEqual(await app.project.tenants().list(), ['acme', 'globex', 'initech']);
  assert.equal(await app.project.tenants().label('initech'), 'Initech');
  assert.match(await page('initech.localhost:8001'), /0 open of 0 tickets/);
});

test('each test starts with the tickets of no tenant (an earlier test wrote some in globex)', async () => {
  assert.equal(await app.project.tenants().run('globex', () => Ticket.objects.count()), 0);
});

test('the admin: the organizations to choose, and the tickets of the one chosen', async () => {
  await app.createUser('admin', 'a long password', { isStaff: true, isSuperuser: true });
  await app.project.tenants().run('globex', () => Ticket.objects.create({ title: 'A new laptop for Hank' }));
  const client = app.client();
  await client.get('/admin/login');
  const login = await client.post(
    '/admin/login',
    { username: 'admin', password: 'a long password' },
    { headers: { 'x-xufa-admin': '1' } }
  );
  assert.equal(login.statusCode, 200);
  const admin = { headers: { 'x-xufa-admin': '1' } };
  const meta = (await client.get('/admin/api/models', null, admin)).json();
  assert.deepEqual(meta.tenants, [
    { id: 'acme', label: 'Acme Corporation' },
    { id: 'globex', label: 'Globex' },
  ]);
  const globex = await client.get('/admin/api/Ticket', null, {
    headers: { ...admin.headers, 'x-xufa-tenant': 'globex' },
  });
  assert.deepEqual(
    globex.json().results.map((ticket) => ticket.values.title),
    ['A new laptop for Hank']
  );
  const acme = await client.get('/admin/api/Ticket', null, { headers: { ...admin.headers, 'x-xufa-tenant': 'acme' } });
  assert.equal(acme.json().count, 0);
});
