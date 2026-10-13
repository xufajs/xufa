import { assertType, expectTypeOf } from '@xufa/test';
import xufa from '@xufa/http';
import fastify from 'fastify';
import { s, Infer, TSchema, TObject, SchemaTypeProvider, compileJsonSchema, ErrorsFunction } from '../..';

// Scalars, formats, literals and enums.
expectTypeOf({} as Infer<ReturnType<typeof s.string>>).toEqualTypeOf<string>();
expectTypeOf({} as Infer<ReturnType<typeof s.integer>>).toEqualTypeOf<number>();
const status = s.enum(['draft', 'published']);
expectTypeOf({} as Infer<typeof status>).toEqualTypeOf<'draft' | 'published'>();
const one = s.literal('book');
expectTypeOf({} as Infer<typeof one>).toEqualTypeOf<'book'>();
const mixed = s.enum([1, 'a', true]);
expectTypeOf({} as Infer<typeof mixed>).toEqualTypeOf<1 | 'a' | true>();

// Objects: optional properties are optional, nullable ones may be null.
const Author = s.object({ name: s.string() });
const Book = s.object({
  id: s.integer(),
  title: s.string(),
  pages: s.optional(s.integer()),
  status,
  tags: s.array(s.string()),
  editor: s.nullable(s.email()),
  note: s.optional(s.nullable(s.string())),
  author: Author,
  position: s.tuple([s.number(), s.string()]),
  counts: s.record(s.integer()),
  owner: s.ref<{ id: string }>('User#'),
});
type Book = Infer<typeof Book>;
expectTypeOf({} as Book).toEqualTypeOf<{
  id: number;
  title: string;
  status: 'draft' | 'published';
  tags: string[];
  editor: string | null;
  author: { name: string };
  position: [number, string];
  counts: Record<string, number>;
  owner: { id: string };
  pages?: number | undefined;
  note?: string | null | undefined;
}>();
assertType<Book>({
  id: 1,
  title: 't',
  status: 'draft',
  tags: [],
  editor: null,
  author: { name: 'a' },
  position: [1, 'x'],
  counts: {},
  owner: { id: 'u' },
});
// @ts-expect-error
assertType<Book>({ id: 1, title: 't', status: 'lost', tags: [], editor: null, author: { name: 'a' }, position: [1, 'x'], counts: {}, owner: { id: 'u' } });
assertType<TObject>(Book);
assertType<TSchema>(Book.properties.title);

// Objects from objects.
const NewBook = s.omit(Book, ['id', 'owner']);
type NewBook = Infer<typeof NewBook>;
expectTypeOf({} as NewBook['title']).toEqualTypeOf<string>();
// @ts-expect-error
({} as NewBook).id;
const Patch = s.partial(NewBook);
assertType<Infer<typeof Patch>>({});
assertType<Infer<typeof Patch>>({ title: 'x' });
const Card = s.pick(Book, ['id', 'title']);
expectTypeOf({} as Infer<typeof Card>).toEqualTypeOf<{ id: number; title: string }>();
const Full = s.required(s.partial(Card));
expectTypeOf({} as Infer<typeof Full>).toEqualTypeOf<{ id: number; title: string }>();
const WithIsbn = s.extend(Card, { isbn: s.string(), title: s.optional(s.string()) });
expectTypeOf({} as Infer<typeof WithIsbn>).toEqualTypeOf<{ id: number; isbn: string; title?: string | undefined }>();
// @ts-expect-error
s.pick(Book, ['nope']);

// Unions and intersections.
const either = s.union([s.string(), s.integer()]);
expectTypeOf({} as Infer<typeof either>).toEqualTypeOf<string | number>();
const both = s.intersect([s.object({ a: s.string() }), s.object({ b: s.integer() })]);
expectTypeOf({} as Infer<typeof both>).toEqualTypeOf<{ a: string; b: number }>();

// Routes typed by their schemas: @xufa/http.
const app = xufa().withTypeProvider<SchemaTypeProvider>();
app.post('/books', { schema: { body: NewBook, params: s.object({ shelf: s.integer() }), querystring: s.object({ draft: s.optional(s.boolean()) }) } }, async (request) => {
  expectTypeOf(request.body.title).toEqualTypeOf<string>();
  expectTypeOf(request.body.pages).toEqualTypeOf<number | undefined>();
  expectTypeOf(request.params.shelf).toEqualTypeOf<number>();
  expectTypeOf(request.query.draft).toEqualTypeOf<boolean | undefined>();
  return { ok: true };
});
app.get('/books/:id', { schema: { response: { 200: Card } } }, async () => ({ id: 1, title: 't' }));

// fastify, the same.
const other = fastify().withTypeProvider<SchemaTypeProvider>();
other.post('/books', { schema: { body: NewBook } }, async (request) => {
  expectTypeOf(request.body.status).toEqualTypeOf<'draft' | 'published'>();
  return null;
});

// Replies typed by response: a reply of another shape is an error.
// @ts-expect-error
app.get('/cards/:id', { schema: { response: { 200: Card } } }, async () => ({ id: 'one', title: 't' }));

// One Infer for every kind of schema of the package: s, the builder of types, a plain object of types.
import { Schema, String as StringType, Integer, Infer as InferAny } from '../..';
const built = s.object({ a: s.string(), b: s.optional(s.integer()) });
expectTypeOf({} as InferAny<typeof built>).toEqualTypeOf<{ a: string; b?: number }>();
const typed = new Schema({ a: StringType(), b: Integer({ isMandatory: false }) });
expectTypeOf({} as InferAny<typeof typed>).toEqualTypeOf<{ a: string; b?: number }>();
const plain = { a: StringType() };
expectTypeOf({} as InferAny<typeof plain>).toEqualTypeOf<{ a: string }>();

// foldMessages: a compile option.
expectTypeOf(compileJsonSchema({ type: 'string' }, { foldMessages: true })).toEqualTypeOf<ErrorsFunction>();
// @ts-expect-error
compileJsonSchema({ type: 'string' }, { foldMessages: 'yes' });
