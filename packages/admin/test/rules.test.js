// Rules of objects in the admin (the where of the roles of its rbac, as Django's get_queryset and
// has_change_permission(obj)): an editor sees every book and changes its own; an author sees only its own; counts,
// lists, objects, changes, deletes and actions follow them, and the page knows what it may do with each object.
import xufa from '@xufa/http';
import { Database, Model, fields } from '@xufa/orm';
import { admin } from '../index.js';

const WRITE = { 'x-xufa-admin': '1' };

async function setUp() {
  class Story extends Model {
    static fields = {
      title: fields.string(),
      ownerId: fields.integer(),
      published: fields.boolean({ default: false }),
    };

    toString() {
      return this.title;
    }
  }
  const db = new Database({ backend: 'memory' }).register(Story);
  await db.sync();
  const mine = await Story.objects.create({ title: 'Mine', ownerId: 1 });
  const theirs = await Story.objects.create({ title: 'Theirs', ownerId: 2 });
  const app = xufa();
  app.decorateRequest('user', null);
  app.addHook('onRequest', async (request) => {
    const [id, role] = String(request.headers['x-user'] || '1:editor').split(':');
    request.user = { id: Number(id), roles: [role] };
  });
  app.register(admin, {
    prefix: '/admin',
    authorize: () => true,
    models: [
      [
        Story,
        { actions: { publish: { run: (stories) => stories.update({ published: true }), permission: 'Story.change' } } },
      ],
    ],
    rbac: {
      roles: {
        editor: {
          permissions: ['Story.view', 'Story.add', 'Story.change', 'Story.delete'],
          where: {
            'Story.add': (user) => ({ ownerId: user.id }),
            'Story.change': (user) => ({ ownerId: user.id }),
            'Story.delete': (user) => ({ ownerId: user.id }),
          },
        },
        author: { permissions: ['Story.view'], where: { 'Story.view': (user) => ({ ownerId: user.id }) } },
      },
    },
  });
  await app.ready();
  return { app, Story, mine, theirs };
}

describe('rules of objects in the admin', () => {
  it('views: an author sees its own (count, list, object); the editor every one', async () => {
    const { app, theirs } = await setUp();
    const as = (user) => ({ 'x-user': user });
    const count = async (user) =>
      (await app.inject({ url: '/admin/api/models', headers: as(user) })).json().models[0].count;
    expect([await count('1:editor'), await count('1:author')]).toEqual([2, 1]);
    const list = (await app.inject({ url: '/admin/api/Story', headers: as('1:author') })).json();
    expect(list.results.map((row) => row.label)).toEqual(['Mine']);
    expect((await app.inject({ url: `/admin/api/Story/${theirs.pk}`, headers: as('1:author') })).statusCode).toBe(404);
  });

  it('changes, deletes and actions: only the objects of the rules; the page knows which', async () => {
    const { app, Story, mine, theirs } = await setUp();
    const own = (await app.inject(`/admin/api/Story/${mine.pk}`)).json();
    const other = (await app.inject(`/admin/api/Story/${theirs.pk}`)).json();
    expect([own.can, other.can]).toEqual([
      { change: true, delete: true },
      { change: false, delete: false },
    ]);
    const patch = (pk) =>
      app.inject({ method: 'PATCH', url: `/admin/api/Story/${pk}`, headers: WRITE, payload: { title: 'Changed' } });
    expect([(await patch(mine.pk)).statusCode, (await patch(theirs.pk)).statusCode]).toEqual([200, 404]);
    expect((await app.inject({ method: 'DELETE', url: `/admin/api/Story/${theirs.pk}`, headers: WRITE })).statusCode).toBe(
      404
    );
    // An action runs on the objects selected it may change.
    const done = await app.inject({
      method: 'POST',
      url: '/admin/api/Story/actions/publish',
      headers: WRITE,
      payload: { pks: [mine.pk, theirs.pk] },
    });
    expect(done.json().count).toBe(1);
    expect((await Story.objects.orderBy('pk')).map((story) => [story.title, story.published])).toEqual([
      ['Changed', true],
      ['Theirs', false],
    ]);
  });

  it('adds: the new object meets the rules, or nothing is kept; choices are those one may view', async () => {
    const { app, Story } = await setUp();
    const add = (ownerId) =>
      app.inject({ method: 'POST', url: '/admin/api/Story', headers: WRITE, payload: { title: 'New', ownerId } });
    expect((await add(1)).statusCode).toBe(201);
    const refused = await add(2);
    expect([refused.statusCode, refused.json().error]).toEqual([403, 'You cannot do this (Story.add)']);
    expect(await Story.objects.filter({ title: 'New' }).count()).toBe(1);
    const choices = await app.inject({ url: '/admin/api/Story/choices', headers: { 'x-user': '1:author' } });
    expect(choices.json().map((choice) => choice.label).sort()).toEqual(['Mine', 'New']);
  });
});
