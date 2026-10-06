// What @xufa/openapi adds to the documents of @fastify/swagger: the resources of @xufa/orm documented by their route
// config (and still checked only by the resource), and the security of the strategies of @xufa/auth. Every document
// is checked by swagger-parser.
const Swagger = require('@apidevtools/swagger-parser');
const xufa = require('@xufa/http');
const { Model, fields, Database, resource } = require('@xufa/orm');
const auth = require('@xufa/auth');
const openapi = require('../..');

const OPTIONS = { openapi: { info: { title: 'Books', version: '1.0.0' } } };
const KEY = 'a secret of at least thirty-two bytes!';

class Author extends Model {
  static fields = { name: fields.string({ maxLength: 100 }) };
}

class Book extends Model {
  static fields = {
    title: fields.string({ maxLength: 200 }),
    pages: fields.integer({ default: 0 }),
    author: fields.foreignKey(Author, { onDelete: 'cascade', null: true }),
    createdAt: fields.datetime({ autoNowAdd: true }),
  };
}

let db;
beforeAll(async () => {
  db = new Database({ backend: 'memory' });
  db.register(Author, Book);
  await db.connect();
  await db.sync();
});
afterAll(() => db.close());

async function documented(register, options = OPTIONS) {
  const app = xufa();
  await app.register(openapi, options);
  await register(app);
  await app.ready();
  const document = app.swagger();
  await Swagger.validate(structuredClone(document));
  return { app, document };
}

describe('resources of @xufa/orm', () => {
  it('every action, with its parameters, body and responses', async () => {
    const { document } = await documented((app) =>
      app.register(
        resource(Book, { filters: { pages: ['gte'], title: ['icontains'] }, ordering: ['pages'], search: ['title'] }),
        {
          prefix: '/books',
        }
      )
    );
    const list = document.paths['/books/'].get;
    expect(list).toMatchObject({ tags: ['Book'], operationId: 'listBook', summary: 'List Book objects' });
    const query = Object.fromEntries(list.parameters.map((p) => [p.name, p]));
    expect(Object.keys(query).sort()).toEqual([
      'limit',
      'offset',
      'ordering',
      'pages__gte',
      'search',
      'title__icontains',
    ]);
    expect(query.pages__gte.schema.type).toBe('integer');
    expect(query.ordering.schema.enum).toEqual(['pages', '-pages']);
    const page = list.responses['200'].content['application/json'].schema;
    expect(Object.keys(page.properties)).toEqual(['count', 'limit', 'offset', 'results']);
    expect(Object.keys(page.properties.results.items.properties)).toEqual([
      'id',
      'title',
      'pages',
      'authorId',
      'createdAt',
    ]);

    const create = document.paths['/books/'].post;
    expect(create.operationId).toBe('createBook');
    const body = create.requestBody.content['application/json'].schema;
    // The writable fields: not the id, nor createdAt (autoNowAdd); title is required, pages has a default.
    expect(Object.keys(body.properties)).toEqual(['title', 'pages', 'authorId']);
    expect(body.required).toEqual(['title']);
    expect(Object.keys(create.responses)).toEqual(['201', '400', '409']);

    const one = document.paths['/books/{id}'];
    expect(one.get.operationId).toBe('getBook');
    expect(one.get.parameters).toEqual([expect.objectContaining({ in: 'path', name: 'id', required: true })]);
    expect(one.put.operationId).toBe('updateBook');
    expect(one.patch.operationId).toBe('partialUpdateBook');
    expect(one.patch.requestBody.content['application/json'].schema.required).toBe(undefined);
    expect(Object.keys(one.delete.responses)).toEqual(['204', '404', '409']);
  });

  it('null as each version says: nullable in OpenAPI 3.0, a type in 3.1 (the schemas are those of Model.schema())', async () => {
    class Note extends Model {
      static fields = {
        title: fields.string(),
        pages: fields.integer({ null: true }),
        status: fields.string({ null: true, choices: ['draft', 'done'] }),
      };
    }
    db.register(Note);
    const bodyOf = async (version) => {
      const { document } = await documented((app) => app.register(resource(Note), { prefix: '/notes' }), {
        openapi: { openapi: version, info: { title: 'Notes', version: '1.0.0' } },
      });
      return document.paths['/notes/'].post.requestBody.content['application/json'].schema.properties;
    };
    const v30 = await bodyOf('3.0.3');
    expect(v30.pages).toEqual({ type: 'integer', nullable: true });
    expect(v30.status).toEqual({ type: 'string', enum: ['draft', 'done', null], nullable: true });
    const v31 = await bodyOf('3.1.0');
    expect(v31.pages).toEqual({ type: ['integer', 'null'] });
    expect(v31.status).toEqual({ type: ['string', 'null'], enum: ['draft', 'done', null] });
  });

  it('documented only: what the resource accepts and answers does not change', async () => {
    const { app } = await documented((instance) =>
      instance.register(resource(Book, { exclude: ['createdAt'] }), { prefix: '/books' })
    );
    // An unknown field is refused by the resource (with its message), not by a schema of the route.
    const unknown = await app.inject({ method: 'POST', url: '/books', payload: { title: 'Dune', color: 'red' } });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().message).toBe('Book has no field color');
    // The answer is the resource's: no response schema drops or converts anything.
    const created = await app.inject({ method: 'POST', url: '/books', payload: { title: 'Dune', pages: '412' } });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toEqual({ id: expect.any(Number), title: 'Dune', pages: 412, authorId: null });
  });

  it('fields, a tag of its own, and openapi: false', async () => {
    const { document } = await documented(async (app) => {
      await app.register(resource(Book, { fields: ['title'], openapi: { tag: 'Library' }, actions: ['get'] }), {
        prefix: '/books',
      });
      await app.register(resource(Author, { openapi: false }), { prefix: '/authors' });
    });
    const get = document.paths['/books/{id}'].get;
    expect(get.tags).toEqual(['Library']);
    expect(Object.keys(get.responses['200'].content['application/json'].schema.properties)).toEqual(['title']);
    // Not documented: listed, without anything of the resource.
    expect(document.paths['/authors/'].get.operationId).toBe(undefined);
  });

  it('a route documented by its config openapi, under its own schema', async () => {
    const { document } = await documented((app) => {
      app.get(
        '/health',
        {
          schema: { summary: 'Mine' },
          config: {
            openapi: {
              summary: 'Theirs',
              tags: ['ops'],
              response: { 200: { type: 'object', properties: { ok: { type: 'boolean' } } } },
            },
          },
        },
        () => ({ ok: true })
      );
    });
    const health = document.paths['/health'].get;
    expect(health.summary).toBe('Mine');
    expect(health.tags).toEqual(['ops']);
    expect(health.responses['200'].content['application/json'].schema.properties.ok.type).toBe('boolean');
  });
});

describe('security of @xufa/auth', () => {
  const key = auth.generateApiKey();
  const strategies = () => [
    'jwt',
    auth.apiKey({ find: () => null }),
    auth.basic({ findUser: () => null, lockout: false }),
    auth.passport(
      {
        name: 'github',
        _oauth2: {
          _authorizeUrl: 'https://github.com/login/oauth/authorize',
          _accessTokenUrl: 'https://github.com/login/oauth/access_token',
        },
        authenticate() {},
      },
      { name: 'github' }
    ),
  ];

  it('the schemes of the strategies, and the security of the routes that need a user', async () => {
    const { document } = await documented(async (app) => {
      await app.register(auth.plugin, { keys: KEY, strategies: strategies() });
      app.get('/public', () => ({}));
      app.get('/me', { config: { auth: true } }, () => ({}));
      app.get('/keys', { config: { auth: { strategy: 'apiKey' } } }, () => ({}));
      app.get('/own', { config: { auth: () => true }, schema: { security: [] } }, () => ({}));
    });
    expect(document.components.securitySchemes).toEqual({
      jwt: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' },
      basic: { type: 'http', scheme: 'basic' },
      github: {
        type: 'oauth2',
        flows: {
          authorizationCode: {
            authorizationUrl: 'https://github.com/login/oauth/authorize',
            tokenUrl: 'https://github.com/login/oauth/access_token',
            scopes: {},
          },
        },
      },
    });
    expect(document.paths['/public'].get.security).toBe(undefined);
    expect(document.paths['/me'].get.security).toEqual([{ jwt: [] }, { apiKey: [] }, { basic: [] }, { github: [] }]);
    expect(document.paths['/keys'].get.security).toEqual([{ apiKey: [] }]);
    // A security of the route's own schema wins.
    expect(document.paths['/own'].get.security).toEqual([]);
    void key;
  });

  it('the security of the actions of a resource with auth', async () => {
    const { document } = await documented(async (app) => {
      await app.register(auth.plugin, { keys: KEY });
      await app.register(resource(Book, { auth: { create: 'admin', delete: 'admin' } }), { prefix: '/books' });
    });
    expect(document.paths['/books/'].get.security).toBe(undefined);
    expect(document.paths['/books/'].post.security).toEqual([{ jwt: [] }]);
    expect(document.paths['/books/{id}'].delete.security).toEqual([{ jwt: [] }]);
  });

  it('schemes of your own are kept, and xufa: false leaves it all out', async () => {
    const own = { components: { securitySchemes: { jwt: { type: 'http', scheme: 'bearer' } } } };
    const { document } = await documented(
      async (app) => {
        await app.register(auth.plugin, { keys: KEY });
        app.get('/me', { config: { auth: true } }, () => ({}));
      },
      { openapi: { ...OPTIONS.openapi, ...own } }
    );
    expect(document.components.securitySchemes.jwt).toEqual({ type: 'http', scheme: 'bearer' });
    const plain = await documented(
      async (app) => {
        await app.register(auth.plugin, { keys: KEY });
        app.get('/me', { config: { auth: true, openapi: { summary: 'x' } } }, () => ({}));
      },
      { ...OPTIONS, xufa: false }
    );
    expect(plain.document.components.securitySchemes).toBe(undefined);
    expect(plain.document.paths['/me'].get.summary).toBe(undefined);
  });

  it('your transform and transformObject still run, after', async () => {
    const seen = [];
    const { document } = await documented(
      async (app) => {
        await app.register(auth.plugin, { keys: KEY });
        app.get('/me', { config: { auth: true } }, () => ({}));
      },
      {
        ...OPTIONS,
        transform: ({ schema, url }) => {
          seen.push(schema && schema.security);
          return { schema: { ...schema, summary: 'by transform' }, url };
        },
        transformObject: ({ openapiObject }) => ({
          ...openapiObject,
          info: { ...openapiObject.info, title: 'Changed' },
        }),
      }
    );
    expect(seen).toEqual([[{ jwt: [] }]]);
    expect(document.paths['/me'].get.summary).toBe('by transform');
    expect(document.info.title).toBe('Changed');
    expect(document.components.securitySchemes.jwt.scheme).toBe('bearer');
  });
});
