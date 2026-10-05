// Routes made from an OpenAPI 3 document (openapi.operations): parameters, bodies and responses validated and
// serialized from it, readOnly and writeOnly, optional bodies, 501 for operations without a handler, security as
// config.auth of @xufa/auth, and the document served by the plugin as it is.
const path = require('node:path');
const xufa = require('@xufa/http');
const auth = require('@xufa/auth');
const openapi = require('../..');
const ui = require('../../lib/ui');

const BOOKS = path.join(__dirname, 'fixtures/books.yaml');
const KEY = 'a secret of at least thirty-two bytes!';

const book = {
  id: 1,
  title: 'Dune',
  secret: 's3cr3t',
  extra: true,
  author: { name: 'Frank', mentor: { name: 'Mentor', age: 1 } },
};

async function booksApp(handlers = {}, options = {}) {
  const app = xufa();
  await app.register(auth.plugin, { keys: KEY });
  await app.register(openapi.operations, { path: BOOKS, security: { bearer: 'jwt' }, handlers, ...options });
  await app.ready();
  const token = await app.auth.sign({ sub: '1' });
  const as = { authorization: `Bearer ${token}` };
  return { app, as };
}

describe('operations of a document', () => {
  it('parameters of the query, the path and headers are validated', async () => {
    const seen = [];
    const { app } = await booksApp({
      listBooks: async (request) => {
        seen.push({ limit: request.query.limit, trace: request.headers['x-trace'] });
        return [];
      },
      getBook: async (request) => ({ id: request.params.id, title: 'X' }),
    });
    expect((await app.inject({ url: '/books?limit=5', headers: { 'x-trace': 't' } })).statusCode).toBe(200);
    expect(seen).toEqual([{ limit: 5, trace: 't' }]);
    const tooMany = await app.inject({ url: '/books?limit=500' });
    expect([tooMany.statusCode, tooMany.json().message]).toEqual([400, 'querystring/limit must be <= 100']);
    expect((await app.inject({ url: '/books/7' })).json()).toEqual({ id: 7, title: 'X' });
    expect((await app.inject({ url: '/books/seven' })).statusCode).toBe(400);
  });

  it('responses are serialized by their schemas: no unknown nor writeOnly properties, recursive references', async () => {
    const { app } = await booksApp({ listBooks: async () => [book] });
    const [answered] = (await app.inject({ url: '/books' })).json();
    expect(answered).toEqual({ id: 1, title: 'Dune', author: { name: 'Frank', mentor: { name: 'Mentor' } } });
  });

  it('bodies: readOnly properties not required, the others are', async () => {
    const { app, as } = await booksApp({
      createBook: async (request, reply) => reply.code(201).send({ ...request.body, id: 9 }),
    });
    const created = await app.inject({
      method: 'POST',
      url: '/books',
      headers: as,
      payload: { title: 'Dune', secret: 'x' },
    });
    expect([created.statusCode, created.json()]).toEqual([201, { id: 9, title: 'Dune' }]);
    const empty = await app.inject({ method: 'POST', url: '/books', headers: as, payload: { title: '' } });
    expect([empty.statusCode, empty.json().message]).toEqual([400, 'body/title must NOT have fewer than 1 characters']);
    const none = await app.inject({ method: 'POST', url: '/books', headers: as, payload: {} });
    expect(none.json().message).toBe("body must have required property 'title'");
  });

  it('an optional body may be left out: the handler gets null', async () => {
    const bodies = [];
    const { app, as } = await booksApp({
      updateBook: async (request) => {
        bodies.push(request.body);
        return { id: 1, title: 'T' };
      },
    });
    expect((await app.inject({ method: 'PATCH', url: '/books/1', headers: as })).statusCode).toBe(200);
    expect(
      (await app.inject({ method: 'PATCH', url: '/books/1', headers: as, payload: { title: 'N' } })).statusCode
    ).toBe(200);
    const wrong = await app.inject({
      method: 'PATCH',
      url: '/books/1',
      headers: as,
      payload: { title: { not: 'a string' } },
    });
    expect(wrong.statusCode).toBe(400);
    expect(bodies).toEqual([null, { title: 'N' }]);
  });

  it('operations without a handler answer 501', async () => {
    const { app } = await booksApp();
    const res = await app.inject({ url: '/books' });
    expect([res.statusCode, res.json().message]).toEqual([501, 'listBooks is not implemented']);
  });

  it('missing: throw, and handlers of no operation, fail', async () => {
    await expect(booksApp({ listBooks: async () => [] }, { missing: 'throw' })).rejects.toThrow(
      /Operations without a handler: createBook, getBook, updateBook/
    );
    await expect(booksApp({ listBook: async () => [] })).rejects.toThrow(
      /Handlers of no operation of the document: listBook/
    );
  });

  it('security: the strategies of its schemes, security: [] public, and @xufa/auth needed', async () => {
    const { app, as } = await booksApp({
      listBooks: async () => [],
      createBook: async (request, reply) => reply.code(201).send({ id: 1, title: 't' }),
    });
    expect((await app.inject({ url: '/books' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/books', payload: { title: 't' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/books', headers: as, payload: { title: 't' } })).statusCode).toBe(
      201
    );
    const open = xufa();
    await open.register(openapi.operations, { path: BOOKS });
    await expect(open.ready()).rejects.toThrow(/createBook, updateBook need security: register @xufa\/auth first/);
  });

  it('handlers with options of their route, and operations without operationId', async () => {
    const calls = [];
    const app = xufa();
    await app.register(openapi.operations, {
      document: {
        openapi: '3.1.0',
        info: { title: 'T', version: '1' },
        paths: {
          '/ping': {
            get: {
              responses: {
                '2XX': {
                  description: 'ok',
                  content: {
                    'application/vnd.api+json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } },
                  },
                },
              },
            },
          },
        },
      },
      handlers: {
        'GET /ping': {
          preHandler: async () => calls.push('pre'),
          handler: async () => ({ ok: true, hidden: 1 }),
        },
      },
      prefix: '/api',
    });
    const res = await app.inject({ url: '/api/ping' });
    expect(res.json()).toEqual({ ok: true });
    expect(calls).toEqual(['pre']);
  });

  it('wrong documents and references are refused', async () => {
    const make = async (document) => {
      const app = xufa();
      await app.register(openapi.operations, { document });
    };
    await expect(make({ openapi: '2.5', paths: {} })).rejects.toThrow(/OpenAPI 3 and Swagger 2.0 documents/);
    await expect(
      make({ openapi: '3.0.0', paths: { '/a': { get: { responses: { 200: { $ref: 'missing.yaml#/A' } } } } } })
    ).rejects.toThrow(/missing.yaml cannot be read/);
    await expect(
      make({
        openapi: '3.0.0',
        paths: { '/a': { get: { responses: { 200: { $ref: '#/components/responses/Missing' } } } } },
      })
    ).rejects.toThrow(/is not in the document/);
  });

  it('the same document served, with its explorer', async () => {
    const app = xufa();
    await app.register(openapi, { mode: 'static', specification: { path: BOOKS } });
    await app.register(ui);
    await app.register(auth.plugin, { keys: KEY });
    await app.register(openapi.operations, { path: BOOKS, security: { bearer: 'jwt' }, handlers: {} });
    await app.ready();
    const served = (await app.inject({ url: '/documentation/json' })).json();
    expect(served.info.title).toBe('Books');
    expect(Object.keys(served.paths)).toEqual(['/books', '/books/{id}']);
  });
});

describe('operations options', () => {
  it('validateResponses: a response out of its contract is a 500, with what is wrong', async () => {
    const { app } = await booksApp(
      {
        listBooks: async (request) => (request.query.limit === 1 ? [{ id: 1 }] : [{ id: 1, title: 'Dune' }]),
        getBook: async () => ({ id: 'one', title: 'X' }),
      },
      { validateResponses: true }
    );
    expect((await app.inject({ url: '/books' })).statusCode).toBe(200);
    // What is sent is checked: a required property missing is the 500 of the serializer (it cannot write it)...
    const missing = await app.inject({ url: '/books?limit=1' });
    expect(missing.statusCode).toBe(500);
    // ... and what it writes but breaks the contract (minLength, pattern, format, enum, ranges) is ours.
    const wrongType = await app.inject({ url: '/books/1' });
    expect(wrongType.statusCode).toBe(500);
  });

  it('validateResponse of a handler wins, and statuses without a schema are not checked', async () => {
    const { app } = await booksApp(
      {
        listBooks: { validateResponse: false, handler: async () => [{ id: 1, title: '' }] },
        getBook: async (request, reply) => reply.code(418).send({ anything: true }),
      },
      { validateResponses: true }
    );
    expect((await app.inject({ url: '/books' })).statusCode).toBe(200);
    expect((await app.inject({ url: '/books/1' })).statusCode).toBe(418);
    const { app: one } = await booksApp({
      listBooks: { validateResponse: true, handler: async () => [{ id: 1, title: '' }] },
    });
    expect((await one.inject({ url: '/books' })).statusCode).toBe(500);
  });

  it('request.operation: its id, and validating by hand (with attachValidation)', async () => {
    const seen = [];
    const { app } = await booksApp({
      listBooks: {
        attachValidation: true,
        handler: async (request) => {
          seen.push(request.operation.id);
          try {
            request.operation.validateRequest();
          } catch (err) {
            seen.push(err.message);
          }
          try {
            request.operation.validateResponse([{ id: 1 }], 200);
          } catch (err) {
            seen.push(err.code);
          }
          request.operation.validateResponse([{ id: 1, title: 'ok' }]);
          return [];
        },
      },
    });
    const res = await app.inject({ url: '/books?limit=500' });
    expect(res.statusCode).toBe(200);
    expect(seen).toEqual(['listBooks', 'querystring/limit must be <= 100', 'XUFA_OPENAPI_INVALID_RESPONSE']);
  });

  it('missingStatus: 404; requestIdHeader echoes the id of each request', async () => {
    const { app } = await booksApp({}, { missingStatus: 404, requestIdHeader: 'x-request-id' });
    const res = await app.inject({ url: '/books' });
    expect([res.statusCode, res.json().error]).toEqual([404, 'Not Found']);
    expect(res.headers['x-request-id']).toMatch(/^req-/);
    await expect(booksApp({}, { missingStatus: 500 })).rejects.toThrow(/missingStatus is 501 or 404/);
  });
});

describe('responses validated by the compiler of the app', () => {
  const document = {
    openapi: '3.0.3',
    info: { title: 'T', version: '1' },
    paths: {
      '/thing': {
        get: {
          operationId: 'thing',
          responses: {
            200: {
              description: 'a thing',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['id', 'at'],
                    properties: { id: { type: 'integer' }, at: { type: 'string', format: 'date-time' } },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  it('on fastify: its ajv checks responses, and the object answered is not changed', async () => {
    const fastify = require('fastify')({ logger: false });
    const answered = { id: 1, at: new Date(0) };
    let current = answered;
    await fastify.register(openapi.operations, {
      document,
      validateResponses: true,
      handlers: { thing: async () => current },
    });
    await fastify.ready();
    const ok = await fastify.inject({ url: '/thing' });
    expect([ok.statusCode, ok.json()]).toEqual([200, { id: 1, at: '1970-01-01T00:00:00.000Z' }]);
    // Checked as sent (a copy): the object of the handler is as it was.
    expect(answered.at).toBeInstanceOf(Date);
    // A text that is not a date-time: written as it is, and out of the contract.
    current = { id: 1, at: 'yesterday' };
    const wrong = await fastify.inject({ url: '/thing' });
    expect([wrong.statusCode, wrong.json().code]).toEqual([500, 'XUFA_OPENAPI_INVALID_RESPONSE']);
    expect(wrong.json().message).toBe(
      'The response 200 of thing does not match its schema: /at must match format "date-time"'
    );
    await fastify.close();
  });

  it('on @xufa/http: what is sent is checked (a number as text is sent as a number), and dates as text', async () => {
    let current = { id: 1, at: new Date(0) };
    const app = xufa();
    await app.register(openapi.operations, {
      document,
      validateResponses: true,
      handlers: { thing: async () => current },
    });
    await app.ready();
    expect((await app.inject({ url: '/thing' })).statusCode).toBe(200);
    current = { id: '1', at: new Date(0) };
    const sent = await app.inject({ url: '/thing' });
    expect([sent.statusCode, sent.json()]).toEqual([200, { id: 1, at: '1970-01-01T00:00:00.000Z' }]);
    current = { id: 1, at: 'yesterday' };
    const res = await app.inject({ url: '/thing' });
    expect([res.statusCode, res.json().message]).toEqual([
      500,
      'The response 200 of thing does not match its schema: /at must match format "date-time"',
    ]);
  });

  it('a validator compiler of the app of your own is the one used, with httpPart response', async () => {
    const fastify = require('fastify')({ logger: false });
    const parts = [];
    // A compiler of its own rules: responses must have the id 1.
    fastify.setValidatorCompiler(({ httpPart }) => {
      parts.push(httpPart);
      return (data) => httpPart !== 'response' || data.id === 1;
    });
    let current = { id: 1, at: new Date(0) };
    await fastify.register(openapi.operations, {
      document,
      validateResponses: true,
      handlers: { thing: async () => current },
    });
    await fastify.ready();
    expect(parts).toContain('response');
    expect((await fastify.inject({ url: '/thing' })).statusCode).toBe(200);
    current = { id: 2, at: new Date(0) };
    expect((await fastify.inject({ url: '/thing' })).statusCode).toBe(500);
    await fastify.close();
  });

  it('a response schema that does not compile stops the app from starting', async () => {
    const broken = structuredClone(document);
    broken.paths['/thing'].get.responses['200'].content['application/json'].schema.properties.id = {
      type: 'integer',
      minimun: 1,
    };
    const app = xufa();
    await app.register(openapi.operations, {
      document: broken,
      validateResponses: true,
      handlers: { thing: async () => ({}) },
    });
    await expect(app.ready()).rejects.toThrow(/minimun/);
  });
});

describe('the 500 of a response out of its contract', () => {
  it('is not checked again, though a default schema would refuse it', async () => {
    const document = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: {
        '/thing': {
          get: {
            operationId: 'thing',
            responses: {
              200: {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: { type: 'object', properties: { n: { type: 'integer', maximum: 5 } } },
                  },
                },
              },
              // The error body is written (only its message: the serializer keeps what the schema lists), and is out of this contract.
              default: {
                description: 'an error',
                content: {
                  'application/json': {
                    schema: { type: 'object', properties: { message: { type: 'string', pattern: '^DETAIL' } } },
                  },
                },
              },
            },
          },
        },
      },
    };
    const app = xufa();
    await app.register(openapi.operations, {
      document,
      validateResponses: true,
      handlers: { thing: async () => ({ n: 9 }) },
    });
    const res = await app.inject({ url: '/thing' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ message: 'The response 200 of thing does not match its schema: /n must be <= 5' });
  });
});
