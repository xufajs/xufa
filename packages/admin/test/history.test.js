// The history of the admin (Django's LogEntry): its writes in the audit log of the database with who made them, the
// history of an object (newest first, fields by their labels), and the recent actions of the models one may view.
import xufa from '@xufa/http';
import { Database, Model, fields } from '@xufa/orm';
import { admin } from '../index.js';

const WRITE = { 'x-xufa-admin': '1' };

async function setUp({ audit = true } = {}) {
  class Shelf extends Model {
    static fields = { name: fields.string({ label: 'Shelf name' }), floor: fields.integer({ default: 0 }) };

    toString() {
      return this.name;
    }
  }
  class Secret extends Model {
    static fields = { code: fields.string() };
  }
  const db = new Database({ backend: 'memory', ...(audit ? { audit: true } : {}) }).register(Shelf, Secret);
  await db.sync();
  const app = xufa();
  app.decorateRequest('user', null);
  app.addHook('onRequest', async (request) => {
    const bob = request.headers['x-user'] === 'bob@example.com';
    request.user = bob ? { email: 'bob@example.com', roles: ['shelves'] } : { email: 'ada@example.com', isSuperuser: true };
  });
  app.register(admin, {
    prefix: '/admin',
    models: [Shelf, Secret],
    authorize: () => true,
    // Bob may only view and change the shelves.
    rbac: { roles: { shelves: ['Shelf.*'] } },
  });
  await app.ready();
  return { app, Shelf, Secret, db };
}

describe('the history of the admin', () => {
  it('writes of the admin with who made them; the history of an object, newest first, by labels', async () => {
    const { app, Shelf } = await setUp();
    const made = await app.inject({ method: 'POST', url: '/admin/api/Shelf', headers: WRITE, payload: { name: 'A' } });
    const pk = made.json().pk;
    await app.inject({ method: 'PATCH', url: `/admin/api/Shelf/${pk}`, headers: WRITE, payload: { name: 'A1', floor: 2 } });
    // A change outside the admin: no actor of the admin.
    const shelf = await Shelf.objects.get({ pk });
    shelf.floor = 3;
    await shelf.save();
    const history = (await app.inject(`/admin/api/Shelf/${pk}/history`)).json().results;
    expect(history.map((entry) => [entry.action, entry.actor, entry.via])).toEqual([
      ['update', null, null],
      ['update', 'ada@example.com', 'admin'],
      ['create', 'ada@example.com', 'admin'],
    ]);
    expect(history[1].changes).toEqual([
      { field: 'name', label: 'Shelf name', path: null, from: 'A', to: 'A1', redacted: false },
      { field: 'floor', label: null, path: null, from: 0, to: 2, redacted: false },
    ]);
    const models = (await app.inject('/admin/api/models')).json().models;
    expect(models.map((model) => [model.name, model.history])).toEqual([
      ['Shelf', true],
      ['Secret', true],
    ]);
  });

  it('the recent actions: newest first, of the models one may view, with the labels of the objects still there', async () => {
    const { app } = await setUp();
    const one = (await app.inject({ method: 'POST', url: '/admin/api/Shelf', headers: WRITE, payload: { name: 'A' } })).json();
    await app.inject({ method: 'POST', url: '/admin/api/Secret', headers: WRITE, payload: { code: 'x' } });
    const two = (await app.inject({ method: 'POST', url: '/admin/api/Shelf', headers: WRITE, payload: { name: 'B' } })).json();
    await app.inject({ method: 'DELETE', url: `/admin/api/Shelf/${two.pk}`, headers: WRITE });
    const recent = (await app.inject('/admin/api/_activity')).json().results;
    expect(recent.map((entry) => [entry.action, entry.model, entry.label])).toEqual([
      ['delete', 'Shelf', null],
      ['create', 'Shelf', null],
      ['create', 'Secret', 'x'], // (its first text field: it has no toString())
      ['create', 'Shelf', 'A'],
    ]);
    const asBob = await app.inject({ url: '/admin/api/_activity', headers: { 'x-user': 'bob@example.com' } });
    expect([asBob.statusCode, asBob.body]).toEqual([200, expect.any(String)]);
    const bobs = asBob.json();
    expect(bobs.results.map((entry) => entry.model)).toEqual(['Shelf', 'Shelf', 'Shelf']);
    expect(String(one.pk)).toBeDefined();
  });

  it('without an audit log: no history, and no recent actions', async () => {
    const { app } = await setUp({ audit: false });
    const made = (await app.inject({ method: 'POST', url: '/admin/api/Shelf', headers: WRITE, payload: { name: 'A' } })).json();
    const res = await app.inject(`/admin/api/Shelf/${made.pk}/history`);
    expect([res.statusCode, res.json().error]).toEqual([404, 'Shelf has no history (its database has no audit log)']);
    expect((await app.inject('/admin/api/_activity')).json()).toEqual({ results: [] });
  });
});
