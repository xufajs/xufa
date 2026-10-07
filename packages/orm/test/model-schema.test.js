// Model.schema(): the schema of the objects of a model as @xufa/schema makes them (null as a type, choices as enums,
// foreign keys by their keys, computed fields read-only), `input: true` without what is never given, taken by s.omit()
// and s.partial(), and used by routes of @xufa/http to validate bodies and write replies.
const xufa = require('@xufa/http');
const { s } = require('@xufa/schema');
const { Database, Model, fields, modelOptions } = require('..');

function makeModels() {
  class Writer extends Model {
    static fields = { name: fields.string() };
  }
  class Book extends Model {
    static fields = {
      title: fields.string({ minLength: 1, maxLength: 200 }),
      pages: fields.integer({ null: true, min: 1 }),
      status: fields.string({ choices: ['draft', 'published'], default: 'draft' }),
      writer: fields.foreignKey(Writer),
      publishedAt: fields.datetime({ null: true }),
      createdAt: fields.datetime({ autoNowAdd: true }),
      double: fields.integer({ computed: 'pages * 2' }),
      readers: fields.manyToMany(Writer),
    };
  }
  new Database({ backend: 'memory' }).register(Writer).register(Book);
  return { Writer, Book };
}

describe('Model.schema()', () => {
  it('the objects: JSON types, null as a type, enums, keys of foreign keys, what is required', () => {
    const { Book } = makeModels();
    expect(Book.schema()).toEqual({
      type: 'object',
      properties: {
        id: { type: ['integer', 'string'] },
        title: { type: 'string', minLength: 1, maxLength: 200 },
        pages: { type: ['integer', 'null'], minimum: 1 },
        status: { type: 'string', enum: ['draft', 'published'] },
        writerId: { type: ['integer', 'string'] },
        publishedAt: { type: ['string', 'null'], format: 'date-time' },
        createdAt: { type: 'string', format: 'date-time' },
        double: { type: 'integer', readOnly: true },
      },
      required: ['title', 'writerId'],
    });
  });

  it('input: true leaves computed fields out; options of s.object(); s.omit() and s.partial() take it', () => {
    const { Book } = makeModels();
    const input = Book.schema({ input: true, additionalProperties: false, $id: 'NewBook' });
    expect(Object.keys(input.properties)).toEqual(['id', 'title', 'pages', 'status', 'writerId', 'publishedAt', 'createdAt']);
    expect([input.additionalProperties, input.$id]).toEqual([false, 'NewBook']);
    const patch = s.partial(s.omit(input, ['id', 'createdAt']));
    expect([patch.required, patch.additionalProperties]).toEqual([undefined, false]);
    expect(Object.keys(patch.properties)).toEqual(['title', 'pages', 'status', 'writerId', 'publishedAt']);
  });

  it('validates bodies and writes replies in routes of @xufa/http', async () => {
    const { Book } = makeModels();
    const app = xufa();
    const NewBook = Book.schema({ input: true, additionalProperties: false });
    app.post('/books', { schema: { body: NewBook, response: { 201: Book.schema() } } }, async (request, reply) => {
      reply.code(201);
      return { ...request.body, id: 7, createdAt: new Date('2026-10-06T10:00:00Z'), double: 2 * (request.body.pages || 0) };
    });
    const ok = await app.inject({ method: 'POST', url: '/books', payload: { title: 'Dune', writerId: 1, pages: null } });
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toEqual({ id: 7, title: 'Dune', pages: null, writerId: 1, createdAt: '2026-10-06T10:00:00.000Z', double: 0 });
    const missing = await app.inject({ method: 'POST', url: '/books', payload: { writerId: 1 } });
    expect(missing.statusCode).toBe(400);
    const wrong = await app.inject({ method: 'POST', url: '/books', payload: { title: 'Dune', writerId: 1, status: 'lost' } });
    expect(wrong.statusCode).toBe(400);
    await app.close();
  });

  it('no automatic id without a primary key (primaryKey: false) or with a composite one; not inherited', () => {
    class LogLine extends Model {
      static options = { primaryKey: false };
      static fields = { line: fields.string() };
    }
    class Pair extends Model {
      static options = { primaryKey: ['a', 'b'] };
      static fields = { a: fields.integer(), b: fields.integer() };
    }
    // primaryKey (and abstract) are the model's own: a child of a model without one gets its id.
    class Keyless extends Model {
      static options = { abstract: true, primaryKey: false };
      static fields = { at: fields.datetime() };
    }
    class Child extends Keyless {
      static fields = { name: fields.string() };
    }
    new Database({ backend: 'memory' }).register(LogLine, Pair, Child);
    expect(Object.keys(LogLine.schema().properties)).toEqual(['line']);
    expect(Pair.schema()).toEqual({
      type: 'object',
      properties: { a: { type: 'integer' }, b: { type: 'integer' } },
      required: ['a', 'b'],
    });
    expect(Object.keys(Child.schema().properties)).toEqual(['id', 'at', 'name']);
  });

  it('modelOptions(): the options as they are (for TypeScript, which keeps their values)', () => {
    const options = { primaryKey: ['a', 'b'], table: 'pairs' };
    expect(modelOptions(options)).toBe(options);
    class Pair extends Model {
      static options = modelOptions({ primaryKey: ['a', 'b'], table: 'pairs' });
      static fields = { a: fields.integer(), b: fields.integer() };
    }
    new Database({ backend: 'memory' }).register(Pair);
    expect([Pair.meta.table, Object.keys(Pair.schema().properties)]).toEqual(['pairs', ['a', 'b']]);
    for (const wrong of [null, 'pairs', ['a']]) {
      expect(() => modelOptions(wrong)).toThrow('The options of a model are an object');
    }
    // In JavaScript too, a name that is no option is refused (with the option of the same letters, when there is one).
    expect(() => modelOptions({ primarykey: false })).toThrow(
      'An option a model does not have: primarykey (did you mean primaryKey?) (it has table, schema, primaryKey,'
    );
    expect(() => modelOptions({ table: 'books', ordring: ['title'], verbose: true })).toThrow(
      'Options a model does not have: ordring, verbose ('
    );
    const every = { table: 't', schema: 's', primaryKey: false, ordering: [], rules: [], indexes: [], abstract: false };
    const more = { fillfactor: 90, strict: true, cache: true, database: 'main', audit: false };
    expect(modelOptions({ ...every, ...more })).toEqual({ ...every, ...more });
  });

  it('modelOptions() knows the options of ModelOptions in index.d.ts, no more and no fewer', () => {
    const { MODEL_OPTIONS } = require('../lib/model'); // eslint-disable-line global-require
    const declarations = require('node:fs').readFileSync(require.resolve('../index.d.ts'), 'utf8'); // eslint-disable-line global-require
    const block = /export interface ModelOptions \{([\s\S]*?)\n\}/.exec(declarations)[1];
    const declared = [...block.matchAll(/^ {2}(\w+)\?:/gm)].map((match) => match[1]);
    expect([...MODEL_OPTIONS].sort()).toEqual(declared.sort());
  });

  it('models of their own primary key, and blobs (no body in JSON)', () => {
    class Isbn extends Model {
      static fields = { isbn: fields.string({ primaryKey: true }), key: fields.uuid() };
    }
    class Keyed extends Model {
      static fields = { key: fields.uuid({ primaryKey: true }) };
    }
    class File extends Model {
      static fields = {
        key: fields.string({ primaryKey: true }),
        body: fields.blob(),
        size: fields.blobInfo('size'),
        contentType: fields.blobInfo('contentType'),
      };
    }
    new Database({ backend: 'memory' }).register(Isbn).register(Keyed);
    new Database({ backend: 'memory-blob' }).register(File);
    expect(Isbn.schema().required).toEqual(['isbn', 'key']);
    expect(Keyed.schema()).toEqual({ type: 'object', properties: { key: { type: 'string', format: 'uuid' } } });
    expect(File.schema().properties).toEqual({
      key: { type: 'string' },
      size: { type: ['integer', 'null'], readOnly: true },
      contentType: { type: ['string', 'null'] },
    });
    expect(Object.keys(File.schema({ input: true }).properties)).toEqual(['key', 'contentType']);
  });
});
