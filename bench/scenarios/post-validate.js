// A JSON body validated by a schema (@xufa/schema in xufa, ajv in fastify) and a response schema.
const body = JSON.stringify({
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  age: 36,
  roles: ['admin', 'author'],
  address: { street: '12 St James Square', city: 'London', zip: 'SW1Y 4JH' },
});

const schema = {
  body: {
    type: 'object',
    required: ['name', 'email', 'age'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 100 },
      email: { type: 'string', minLength: 3 },
      age: { type: 'integer', minimum: 0, maximum: 150 },
      roles: { type: 'array', items: { type: 'string' }, maxItems: 10 },
      address: {
        type: 'object',
        required: ['city'],
        properties: { street: { type: 'string' }, city: { type: 'string' }, zip: { type: 'string' } },
      },
    },
  },
  response: {
    201: {
      type: 'object',
      properties: { id: { type: 'integer' }, name: { type: 'string' }, email: { type: 'string' } },
    },
  },
};

module.exports = {
  description: 'POST a JSON body validated by a schema, with a response schema',
  request: { method: 'POST', path: '/users', headers: { 'content-type': 'application/json' }, body },
  expect: { status: 201, body: '{"id":1,"name":"Ada Lovelace","email":"ada@example.com"}' },
  build(Framework) {
    const app = Framework({ logger: false });
    app.post('/users', { schema }, (request, reply) => {
      reply.code(201).send({ id: 1, ...request.body });
    });
    return app;
  },
};
