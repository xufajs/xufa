// Tests of xufa (not ported from fastify): responses whose serializer writes bytes are sent as a Buffer.
import xufa from '../../index.js';

const listSchema = {
  response: {
    200: {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } } },
    },
  },
};
const items = [
  { id: 1, name: 'café €', secret: 'dropped' },
  { id: 2, name: 'quote " 😀' },
];
const expected = JSON.stringify(items.map(({ id, name }) => ({ id, name })));

describe('responses written as bytes', () => {
  test('are sent with their content type and length', async () => {
    const app = xufa();
    app.get('/', { schema: listSchema }, async () => items);
    const res = await app.inject('/');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(res.headers['content-length']).toBe(String(Buffer.byteLength(expected)));
    expect(res.payload).toBe(expected);
  });

  test('are given to onSend hooks as a string', async () => {
    const app = xufa();
    let seen;
    app.addHook('onSend', async (request, reply, payload) => {
      seen = payload;
    });
    app.get('/', { schema: listSchema }, async () => items);
    const res = await app.inject('/');
    expect(typeof seen).toBe('string');
    expect(seen).toBe(expected);
    expect(res.payload).toBe(expected);
  });

  test('are made again for every reply', async () => {
    const app = xufa();
    app.get('/:n', { schema: listSchema }, async (request) =>
      Array.from({ length: Number(request.params.n) }, (_, id) => ({ id, name: `n${id}` }))
    );
    const [a, b] = await Promise.all([app.inject('/3'), app.inject('/1')]);
    expect(JSON.parse(a.payload)).toHaveLength(3);
    expect(b.payload).toBe('[{"id":0,"name":"n0"}]');
  });

  test('that fail are errors of the reply', async () => {
    const app = xufa();
    app.get('/', { schema: listSchema }, async () => [{ id: 'not a number' }]);
    app.get('/ok', { schema: listSchema }, async () => items);
    const res = await app.inject('/');
    expect(res.statusCode).toBe(500);
    // The next reply is whole.
    expect((await app.inject('/ok')).payload).toBe(expected);
  });
});
