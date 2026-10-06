// The schemas made (plain JSON Schemas, as written by hand), objects made from objects, the errors of what is not a
// schema, and the schemas in the routes of @xufa/http and fastify (ajv): requests validated, replies
// serialized, shared schemas by $ref.
const xufa = require('@xufa/http');
const fastify = require('fastify');
const { s, isOptional } = require('..');

describe('the schemas made', () => {
  it('scalars, formats, literals and enums', () => {
    expect(s.string({ minLength: 1 })).toEqual({ type: 'string', minLength: 1 });
    expect(s.integer({ minimum: 0, description: 'n' })).toEqual({ type: 'integer', minimum: 0, description: 'n' });
    expect([s.number(), s.boolean(), s.null()]).toEqual([{ type: 'number' }, { type: 'boolean' }, { type: 'null' }]);
    expect(s.dateTime()).toEqual({ type: 'string', format: 'date-time' });
    expect([s.date().format, s.email().format, s.uuid().format, s.uri().format]).toEqual(['date', 'email', 'uuid', 'uri']);
    expect(s.literal('book')).toEqual({ type: 'string', const: 'book' });
    expect(s.literal(3)).toEqual({ type: 'integer', const: 3 });
    expect(s.literal(null)).toEqual({ type: 'null', const: null });
    expect(s.enum(['draft', 'published'])).toEqual({ type: 'string', enum: ['draft', 'published'] });
    expect(s.enum([1, 2.5])).toEqual({ type: 'number', enum: [1, 2.5] });
    expect(s.enum(['a', 1])).toEqual({ type: ['string', 'integer'], enum: ['a', 1] });
  });

  it('objects: required unless optional; options; the mark of optional is not in the JSON', () => {
    const book = s.object(
      { id: s.integer(), title: s.string(), pages: s.optional(s.integer()) },
      { additionalProperties: false, $id: 'Book' }
    );
    expect(JSON.parse(JSON.stringify(book))).toEqual({
      type: 'object',
      properties: { id: { type: 'integer' }, title: { type: 'string' }, pages: { type: 'integer' } },
      required: ['id', 'title'],
      additionalProperties: false,
      $id: 'Book',
    });
    expect(isOptional(book.properties.pages)).toBe(false); // in the object, it is a property not required
    expect(isOptional(s.optional(s.string()))).toBe(true);
    expect(s.object({ a: s.optional(s.string()) }).required).toBe(undefined);
  });

  it('nullable: a type with null, an enum with null, anyOf; optional kept', () => {
    expect(s.nullable(s.string())).toEqual({ type: ['string', 'null'] });
    expect(s.nullable(s.enum(['a']))).toEqual({ type: ['string', 'null'], enum: ['a', null] });
    expect(s.nullable(s.ref('Book#'))).toEqual({ anyOf: [{ $ref: 'Book#' }, { type: 'null' }] });
    expect(s.nullable(s.nullable(s.integer()))).toEqual({ type: ['integer', 'null'] });
    expect(isOptional(s.nullable(s.optional(s.string())))).toBe(true);
    const o = s.object({ a: s.nullable(s.optional(s.string())), b: s.optional(s.nullable(s.string())) });
    expect(o.required).toBe(undefined);
  });

  it('arrays, tuples, records, unions, intersections, refs, any and never', () => {
    expect(s.array(s.string(), { uniqueItems: true })).toEqual({ type: 'array', items: { type: 'string' }, uniqueItems: true });
    expect(s.tuple([s.number(), s.number()])).toEqual({
      type: 'array',
      items: [{ type: 'number' }, { type: 'number' }],
      minItems: 2,
      maxItems: 2,
      additionalItems: false,
    });
    expect(s.record(s.integer())).toEqual({ type: 'object', additionalProperties: { type: 'integer' } });
    expect(s.union([s.string(), s.integer()])).toEqual({ anyOf: [{ type: 'string' }, { type: 'integer' }] });
    expect(s.intersect([s.object({ a: s.string() }), s.object({ b: s.string() })]).allOf).toHaveLength(2);
    expect(s.ref('Book#')).toEqual({ $ref: 'Book#' });
    expect([s.any(), s.unknown(), s.never()]).toEqual([{}, {}, { not: {} }]);
  });

  it('objects from objects: pick, omit, partial, required, extend (their options kept)', () => {
    const book = s.object(
      { id: s.integer(), title: s.string(), pages: s.optional(s.integer()), status: s.enum(['draft', 'published']) },
      { additionalProperties: false }
    );
    const create = s.omit(book, ['id']);
    expect([Object.keys(create.properties), create.required, create.additionalProperties]).toEqual([
      ['title', 'pages', 'status'],
      ['title', 'status'],
      false,
    ]);
    expect(s.pick(book, ['id', 'pages']).required).toEqual(['id']);
    expect(s.partial(create).required).toBe(undefined);
    expect(s.required(book).required).toEqual(['id', 'title', 'pages', 'status']);
    const extended = s.extend(book, { title: s.optional(s.string()), isbn: s.string() }, { description: 'more' });
    expect([extended.required, extended.description, extended.additionalProperties]).toEqual([
      ['id', 'status', 'isbn'],
      'more',
      false,
    ]);
    // The schema given is not changed.
    expect(book.required).toEqual(['id', 'title', 'status']);
  });

  it('errors: what is not a schema, keys that are not properties', () => {
    expect(() => s.object({ a: 'string' })).toThrow('The property a is a schema (an object)');
    expect(() => s.array()).toThrow('s.array(items) is a schema');
    expect(() => s.enum([])).toThrow(/a list of values/);
    expect(() => s.enum([{}])).toThrow(/strings, numbers, booleans or null/);
    expect(() => s.literal({})).toThrow(/a string, a number, a boolean or null/);
    expect(() => s.pick(s.string(), ['a'])).toThrow(/is a schema of s\.object\(\)/);
    expect(() => s.omit(s.object({ a: s.string() }), ['b'])).toThrow('s.omit(): the schema has no property b');
    expect(() => s.union([])).toThrow(/a list of schemas/);
  });
});

// The same routes on @xufa/http and fastify (ajv).
const Author = s.object({ name: s.string({ minLength: 1 }) }, { $id: 'Author' });
const Book = s.object(
  {
    id: s.integer({ minimum: 1 }),
    title: s.string({ minLength: 1, maxLength: 50 }),
    pages: s.optional(s.integer({ minimum: 1 })),
    status: s.enum(['draft', 'published']),
    tags: s.array(s.string(), { uniqueItems: true }),
    editor: s.nullable(s.email()),
    author: s.ref('Author#'),
    position: s.optional(s.tuple([s.number(), s.number()])),
  },
  { additionalProperties: false }
);
const NewBook = s.omit(Book, ['id']);
const BookPatch = s.partial(NewBook);

for (const [name, make] of [
  // removeAdditional: false on both: properties not in the schema refused (by default they are removed, as fastify does).
  ['@xufa/http', () => xufa({ ajv: { customOptions: { removeAdditional: false } } })],
  ['fastify (ajv)', () => fastify({ ajv: { customOptions: { removeAdditional: false } } })],
]) {
  describe(`in the routes of ${name}`, () => {
    let app;
    const valid = {
      title: 'Dune',
      status: 'published',
      tags: ['sf'],
      editor: null,
      author: { name: 'Frank Herbert' },
    };

    beforeAll(async () => {
      app = make();
      app.addSchema(Author);
      app.post('/books', { schema: { body: NewBook, response: { 201: Book } } }, async (request, reply) => {
        reply.code(201);
        return { id: 1, ...request.body, secret: 'not in the reply' };
      });
      app.patch('/books/:id', { schema: { params: s.object({ id: s.integer() }), body: BookPatch } }, async (request) => ({
        id: request.params.id,
        changed: Object.keys(request.body),
      }));
      await app.ready();
    });
    afterAll(() => app.close());

    const post = (payload) => app.inject({ method: 'POST', url: '/books', payload });

    it('valid bodies, and the reply serialized by its schema', async () => {
      const res = await post(valid);
      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ id: 1, ...valid });
      expect((await post({ ...valid, pages: 412, editor: 'ed@example.com', position: [1.5, 2] })).statusCode).toBe(201);
      const patch = await app.inject({ method: 'PATCH', url: '/books/7', payload: { status: 'draft' } });
      expect(patch.json()).toEqual({ id: 7, changed: ['status'] });
    });

    it('invalid bodies: 400', async () => {
      for (const body of [
        { ...valid, title: '' }, // minLength
        { ...valid, status: 'lost' }, // enum
        { ...valid, extra: 1 }, // additionalProperties: false
        { ...valid, editor: 'not an email' }, // format
        { ...valid, tags: ['a', 'a'] }, // uniqueItems
        { ...valid, author: {} }, // the $ref: name required
        { ...valid, position: [1] }, // the tuple
        (({ status, ...rest }) => rest)(valid), // status required
      ]) {
        const res = await post(body);
        expect([JSON.stringify(body), res.statusCode]).toEqual([JSON.stringify(body), 400]);
      }
      expect((await app.inject({ method: 'PATCH', url: '/books/7', payload: { pages: 0 } })).statusCode).toBe(400);
    });
  });
}
