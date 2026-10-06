// The keywords of OpenAPI in route schemas (style, explode, example, x- extensions...): fastify's ajv ignores unknown
// keywords, and schemas written for @fastify/swagger (@xufa/openapi) have them. The validator compiler declares them
// to @xufa/schema as annotations, so a schema with them compiles and validates, and other unknown keywords still throw.
const xufa = require('../..');

describe('keywords of OpenAPI in route schemas', () => {
  it('compile, and are only annotations', async () => {
    const app = xufa();
    app.get(
      '/items',
      {
        schema: {
          querystring: {
            type: 'object',
            style: 'form',
            explode: true,
            properties: {
              filter: {
                type: 'object',
                'x-consume': 'application/json',
                example: { a: 1 },
                properties: { a: { type: 'integer' } },
              },
              q: { type: 'string', allowReserved: true, 'x-internal': true, externalDocs: { url: 'https://x' } },
            },
          },
        },
      },
      (request) => request.query
    );
    const res = await app.inject({ url: '/items?q=books' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ q: 'books' });
    // They check nothing: a value that would not match them is accepted.
    const other = await app.inject({ url: '/items?q=' });
    expect(other.statusCode).toBe(200);
  });

  it('x- extensions of external schemas too', async () => {
    const app = xufa();
    app.addSchema({ $id: 'Book', type: 'object', 'x-tags': ['books'], properties: { title: { type: 'string' } } });
    app.post('/books', { schema: { body: { $ref: 'Book#' } } }, (request) => request.body);
    const res = await app.inject({ method: 'POST', url: '/books', payload: { title: 'Dune' } });
    expect(res.json()).toEqual({ title: 'Dune' });
  });

  it('a typo still throws', async () => {
    const app = xufa();
    app.get(
      '/',
      { schema: { querystring: { type: 'object', properties: { n: { type: 'integer', minimun: 1 } } } } },
      () => ({})
    );
    await expect(app.ready()).rejects.toThrow(/minimun/);
  });
});

// The formats of OpenAPI that fastify knows from ajv-formats.
describe('formats of OpenAPI', () => {
  async function post(format, value) {
    const app = xufa();
    app.post('/', { schema: { body: { type: 'object', properties: { v: { type: 'string', format } } } } }, () => ({}));
    return (await app.inject({ method: 'POST', url: '/', payload: { v: value } })).statusCode;
  }

  it('are known: int32, int64, float, double, binary and password are not checked', async () => {
    for (const format of ['int32', 'int64', 'float', 'double', 'binary', 'password']) {
      expect(await post(format, 'anything')).toBe(200);
    }
  });

  it('byte is base64', async () => {
    expect(await post('byte', 'aGVsbG8=')).toBe(200);
    expect(await post('byte', 'not base64!')).toBe(400);
  });

  it('the built-in ones are still checked, and an unknown one still throws', async () => {
    expect(await post('uuid', 'nope')).toBe(400);
    const app = xufa();
    app.post(
      '/',
      { schema: { body: { type: 'object', properties: { v: { type: 'string', format: 'emial' } } } } },
      () => ({})
    );
    await expect(app.ready()).rejects.toThrow(/emial/);
  });
});
