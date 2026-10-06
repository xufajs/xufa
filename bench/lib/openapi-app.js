// The app of the scenarios openapi-*: routes made from an OpenAPI 3 document by openapi.operations of @xufa/openapi,
// on the framework of the run (@xufa/http or fastify): the same layer on each. Books: a list of 20, one by id (its
// limit a query parameter), a create; ids that are not numbers of 1 or more are refused (400). validateResponses: the
// replies checked against the document too.
const { operations } = require('@xufa/openapi');

const book = {
  type: 'object',
  required: ['id', 'title'],
  properties: {
    id: { type: 'integer' },
    title: { type: 'string', minLength: 1 },
    pages: { type: 'integer', minimum: 1 },
  },
};

const document = {
  openapi: '3.0.3',
  info: { title: 'Books', version: '1.0.0' },
  paths: {
    '/books': {
      get: {
        operationId: 'listBooks',
        responses: {
          200: {
            description: 'ok',
            content: {
              'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Book' } } },
            },
          },
        },
      },
      post: {
        operationId: 'createBook',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'pages'],
                properties: { title: { type: 'string', minLength: 1 }, pages: { type: 'integer', minimum: 1 } },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Book' } } },
          },
        },
      },
    },
    '/books/{id}': {
      get: {
        operationId: 'getBook',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[1-9][0-9]*$' } },
          { name: 'limit', in: 'query', schema: { type: 'string', pattern: '^[1-9][0-9]?$' } },
        ],
        responses: {
          200: {
            description: 'ok',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Book' } } },
          },
        },
      },
    },
  },
  components: { schemas: { Book: book } },
};

// What the handlers answer: books with fields the schemas leave out (the serializers drop them).
const books = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1,
  title: `Book ${i + 1}`,
  pages: 100 + i,
  author: 'Ada',
  secret: 'x',
}));

function build(Framework, { validateResponses = false } = {}) {
  const app = Framework({ logger: false });
  app.register(operations, {
    document,
    validateResponses,
    handlers: {
      listBooks: async () => books,
      getBook: async (request) => ({
        id: Number(request.params.id),
        title: `Book ${request.params.id}`,
        pages: Number(request.query.limit || 10),
        secret: 'x',
      }),
      createBook: async (request, reply) => {
        reply.code(201);
        return { id: 21, ...request.body, author: 'Ada' };
      },
    },
  });
  return app;
}

const LIST = JSON.stringify(books.map(({ id, title, pages }) => ({ id, title, pages })));

module.exports = { build, LIST };
