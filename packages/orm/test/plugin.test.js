import xufa from '@xufa/http';
import { Database, Model, fields, plugin, NotFoundError } from '../index.js';

function makeApp() {
  class Author extends Model {
    static fields = {
      name: fields.string({ maxLength: 20 }),
      age: fields.integer({ null: true, min: 0 }),
    };
  }
  const db = new Database({ backend: 'memory' }).register(Author);
  const app = xufa();
  app.register(plugin, { database: db, sync: true });
  app.register(async (routes) => {
    routes.post('/authors', async (request, reply) => {
      const author = await Author.objects.create(request.body);
      reply.code(201);
      return author;
    });
    routes.get('/authors/:id', async (request) => Author.objects.get({ pk: request.params.id }));
    routes.post('/checked', { schema: { body: Author.jsonSchema({ exclude: ['id'] }) } }, async (request) => ({
      ok: request.body.name,
    }));
  });
  return { app, db, Author };
}

describe('plugin', () => {
  it('gives the database to the app and answers the errors of the models', async () => {
    const { app, db } = makeApp();
    await app.ready();
    expect(app.db).toBe(db);
    const created = await app.inject({ method: 'POST', url: '/authors', payload: { name: 'Ada', age: 36 } });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toEqual({ id: 1, name: 'Ada', age: 36 });
    expect((await app.inject('/authors/1')).json()).toEqual({ id: 1, name: 'Ada', age: 36 });
    const invalid = await app.inject({ method: 'POST', url: '/authors', payload: { name: 'x'.repeat(30), age: -1 } });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().code).toBe('XUFA_ORM_ERR_VALIDATION');
    expect(Object.keys(invalid.json().errors).sort()).toEqual(['age', 'name']);
    const missing = await app.inject('/authors/99');
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe('XUFA_ORM_ERR_NOT_FOUND');
    // The JSON Schema of a model validates the bodies of routes.
    expect((await app.inject({ method: 'POST', url: '/checked', payload: { age: 3 } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/checked', payload: { name: 'Ada' } })).json()).toEqual({
      ok: 'Ada',
    });
    await app.close();
    expect(NotFoundError).toBeDefined();
  });

  it('closes the database with the app', async () => {
    const { app, db } = makeApp();
    let closed = false;
    const { close } = db;
    db.close = async () => {
      closed = true;
      return close.call(db);
    };
    await app.ready();
    await app.close();
    expect(closed).toBe(true);
  });

  it('needs a database', async () => {
    const app = xufa();
    app.register(plugin, {});
    await expect(app.ready()).rejects.toThrow('needs a database');
  });

  it('deletes the objects of TTL indexes that expired while the app runs', async () => {
    class Ping extends Model {
      static fields = { at: fields.datetime() };

      static options = { indexes: [{ fields: ['at'], expireAfter: 60 }] };
    }
    const db = new Database({ backend: 'memory' }).register(Ping);
    const app = xufa();
    app.register(plugin, { database: db, sync: true, expire: { interval: 0.02 } });
    await app.ready();
    expect(db.expiryTimer).not.toBe(null);
    await Ping.objects.create({ at: new Date(Date.now() - 120 * 1000) });
    await Ping.objects.create({ at: new Date() });
    for (let i = 0; i < 50 && (await Ping.objects.count()) > 1; i += 1) {
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    }
    expect(await Ping.objects.count()).toBe(1);
    await app.close();
    expect(db.expiryTimer).toBe(null);
  });
});
