// Documents split in files (bundle()) and Swagger 2.0 documents (fromSwagger2()), as openapi.operations reads them:
// schemas of other files taken into the schemas of the document (recursive ones, and whole files), the rest written
// where it was referred to, data left alone, URLs only when asked; Swagger 2.0 as a valid OpenAPI 3.0 document.
const http = require('node:http');
const path = require('node:path');
const Swagger = require('@apidevtools/swagger-parser');
const xufa = require('@xufa/http');
const auth = require('@xufa/auth');
const openapi = require('../..');

const SPLIT = path.join(__dirname, 'fixtures/split/openapi.yaml');
const PETSTORE = path.join(__dirname, 'fixtures/petstore-swagger2.json');

describe('bundle()', () => {
  it('schemas of other files are schemas of the document; the rest is written in', async () => {
    const document = await openapi.bundle(SPLIT);
    expect(Object.keys(document.components.schemas).sort()).toEqual(['Book', 'Error', 'author', 'id']);
    // A path item of another file, written in; its $refs to schemas point to the schemas of the document.
    const list = document.paths['/books'].get;
    expect(list.responses['200'].content['application/json'].schema.items).toEqual({
      $ref: '#/components/schemas/Book',
    });
    // A $ref of another file to the document itself.
    expect(list.responses.default.content['application/json'].schema).toEqual({ $ref: '#/components/schemas/Error' });
    // A parameter of another file, written in, with a schema of a file of its own.
    expect(document.paths['/books/{id}'].get.parameters[0]).toEqual({
      name: 'id',
      in: 'path',
      required: true,
      schema: { $ref: '#/components/schemas/id' },
    });
    // A whole file as a schema, and its $ref to itself.
    expect(document.components.schemas.author.properties.mentor).toEqual({ $ref: '#/components/schemas/author' });
    expect(document.components.schemas.Book.properties.author).toEqual({ $ref: '#/components/schemas/author' });
    // Data is not read.
    expect(document.components.schemas.Book.properties.example.example).toEqual({
      $ref: 'this is data, not a reference',
    });
    // swagger-parser reads $refs in data too: the example is left out to check the rest.
    const checked = structuredClone(document);
    delete checked.components.schemas.Book.properties.example;
    await Swagger.validate(checked);
  });

  it('a document split in files makes its routes', async () => {
    const app = xufa();
    await app.register(openapi.operations, {
      path: SPLIT,
      handlers: {
        listBooks: async () => [{ title: 'Dune', author: { name: 'Frank', mentor: { name: 'M', extra: 1 } } }],
        getBook: async (request) => ({ title: `#${request.params.id}` }),
      },
    });
    const list = await app.inject({ url: '/books' });
    expect(list.json()).toEqual([{ title: 'Dune', author: { name: 'Frank', mentor: { name: 'M' } } }]);
    expect((await app.inject({ url: '/books/0' })).statusCode).toBe(400);
    expect((await app.inject({ url: '/books/7' })).json()).toEqual({ title: '#7' });
  });

  it('a document given: its relative $refs are of baseDir', async () => {
    const document = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: {
        '/b': {
          get: {
            responses: {
              200: {
                description: 'b',
                content: { 'application/json': { schema: { $ref: './schemas/book.yaml#/Book' } } },
              },
            },
          },
        },
      },
    };
    const bundled = await openapi.bundle(document, { baseDir: path.dirname(SPLIT) });
    expect(Object.keys(bundled.components.schemas).sort()).toEqual(['Book', 'author']);
    // The document given is not changed.
    expect(document.components).toBe(undefined);
  });

  it('examples of parameters and contents are data; examples maps keep their $refs', async () => {
    const document = await openapi.bundle({
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: {
        '/b': {
          get: {
            parameters: [{ name: 'q', in: 'query', schema: { type: 'object' }, example: { $ref: 'not/a/file.yaml' } }],
            responses: {
              200: {
                description: 'b',
                content: {
                  'application/json': {
                    schema: { type: 'object' },
                    examples: { one: { $ref: '#/components/examples/One' } },
                  },
                },
              },
            },
          },
        },
      },
      components: { examples: { One: { value: { $ref: 'still data' } } } },
    });
    expect(document.paths['/b'].get.parameters[0].example).toEqual({ $ref: 'not/a/file.yaml' });
    expect(document.paths['/b'].get.responses['200'].content['application/json'].examples.one).toEqual({
      $ref: '#/components/examples/One',
    });
  });

  it('URLs only with remote: true', async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/yaml' });
      res.end('Book:\n  type: object\n  properties:\n    title: { type: string }\n');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const url = `http://127.0.0.1:${server.address().port}/schemas.yaml#/Book`;
      const document = {
        openapi: '3.0.3',
        info: { title: 'T', version: '1' },
        paths: {
          '/b': {
            get: {
              responses: { 200: { description: 'b', content: { 'application/json': { schema: { $ref: url } } } } },
            },
          },
        },
      };
      await expect(openapi.bundle(document)).rejects.toThrow(/need remote: true/);
      const bundled = await openapi.bundle(document, { remote: true });
      expect(bundled.components.schemas.Book.properties.title).toEqual({ type: 'string' });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe('Swagger 2.0', () => {
  it('is read as a valid OpenAPI 3.0 document', async () => {
    const document = openapi.fromSwagger2(require(PETSTORE));
    await Swagger.validate(structuredClone(document));
    expect(document.openapi).toBe('3.0.3');
    expect(document.servers).toEqual([{ url: 'https://pets.example.com/v1' }]);
    expect(document.components.securitySchemes).toEqual({ key: { type: 'apiKey', in: 'header', name: 'x-api-key' } });
    expect(document.components.schemas.Pet.properties.tag).toEqual({ type: 'string', nullable: true });
    const list = document.paths['/pets'].get;
    expect(list.parameters).toEqual([
      { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 50 } },
      { name: 'tags', in: 'query', schema: { type: 'array', items: { type: 'string' } }, style: 'form', explode: true },
    ]);
    expect(list.responses['200'].content['application/json'].schema.items).toEqual({
      $ref: '#/components/schemas/Pet',
    });
    expect(document.paths['/pets'].post.requestBody).toEqual({
      required: true,
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
    });
    const upload = document.paths['/pets/{petId}/photo'].post.requestBody.content['multipart/form-data'].schema;
    expect(upload).toEqual({
      type: 'object',
      properties: { caption: { type: 'string' }, file: { type: 'string', format: 'binary' } },
      required: ['caption'],
    });
    expect(document.paths['/pets/{petId}'].get.responses['404']).toEqual({ $ref: '#/components/responses/NotFound' });
  });

  it('makes its routes, with its security', async () => {
    const app = xufa();
    const key = auth.generateApiKey();
    await app.register(auth.plugin, {
      strategies: [
        auth.apiKey({ name: 'key', find: (id) => (id === key.id ? { hash: key.hash, user: { id: 1 } } : null) }),
      ],
    });
    await app.register(openapi.operations, {
      path: PETSTORE,
      handlers: {
        listPets: async (request) => [{ id: 1, name: `limit ${request.query.limit}`, tag: null }],
        createPet: async (request, reply) => reply.code(201).send({ id: 2, ...request.body }),
        getPet: async (request) => ({ id: request.params.petId, name: 'Rex' }),
      },
    });
    expect((await app.inject({ url: '/pets?limit=5' })).json()).toEqual([{ id: 1, name: 'limit 5', tag: null }]);
    expect((await app.inject({ url: '/pets?limit=99' })).statusCode).toBe(400);
    expect((await app.inject({ url: '/pets/3' })).json()).toEqual({ id: 3, name: 'Rex' });
    expect((await app.inject({ method: 'POST', url: '/pets', payload: { name: 'Rex' } })).statusCode).toBe(401);
    const created = await app.inject({
      method: 'POST',
      url: '/pets',
      payload: { name: 'Rex' },
      headers: { 'x-api-key': key.key },
    });
    expect([created.statusCode, created.json()]).toEqual([201, { id: 2, name: 'Rex' }]);
    expect((await app.inject({ method: 'POST', url: '/pets/1/photo' })).statusCode).toBe(501);
  });
});
