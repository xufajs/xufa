// A larger payload (100 records) written by a compiled serializer.
const items = [];
for (let i = 0; i < 100; i += 1) {
  items.push({
    id: i,
    name: `Item number ${i}`,
    price: Math.round(i * 137.17) / 100,
    available: i % 3 !== 0,
    tags: ['alpha', 'beta', `tag-${i % 7}`],
    owner: { id: i % 10, name: `Owner "${i % 10}"` },
  });
}

const schema = {
  response: {
    200: {
      type: 'object',
      properties: {
        total: { type: 'integer' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              name: { type: 'string' },
              price: { type: 'number' },
              available: { type: 'boolean' },
              tags: { type: 'array', items: { type: 'string' } },
              owner: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } } },
            },
          },
        },
      },
    },
  },
};

module.exports = {
  description: 'GET 100 records (about 12 KB) with a response schema',
  request: { method: 'GET', path: '/items' },
  expect: { status: 200, body: JSON.stringify({ total: items.length, items }) },
  build(Framework) {
    const app = Framework({ logger: false });
    app.get('/items', { schema }, (request, reply) => {
      reply.send({ total: items.length, items });
    });
    return app;
  },
  node(http) {
    return http.createServer((req, res) => {
      const body = JSON.stringify({ total: items.length, items });
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
      });
      res.end(body);
    });
  },
};
