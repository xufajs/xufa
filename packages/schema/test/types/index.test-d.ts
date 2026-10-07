import { expectType, expectError, expectAssignable } from 'tsd';
import xufa from '@xufa/http';
import fastify from 'fastify';
import { s, Infer, TSchema, TObject, SchemaTypeProvider, compileJsonSchema, ErrorsFunction } from '../..';

// Scalars, formats, literals and enums.
expectType<string>({} as Infer<ReturnType<typeof s.string>>);
expectType<number>({} as Infer<ReturnType<typeof s.integer>>);
const status = s.enum(['draft', 'published']);
expectType<'draft' | 'published'>({} as Infer<typeof status>);
const one = s.literal('book');
expectType<'book'>({} as Infer<typeof one>);
const mixed = s.enum([1, 'a', true]);
expectType<1 | 'a' | true>({} as Infer<typeof mixed>);

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
expectType<{
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
}>({} as Book);
expectAssignable<Book>({
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
expectError<Book>({ id: 1, title: 't', status: 'lost', tags: [], editor: null, author: { name: 'a' }, position: [1, 'x'], counts: {}, owner: { id: 'u' } });
expectAssignable<TObject>(Book);
expectAssignable<TSchema>(Book.properties.title);

// Objects from objects.
const NewBook = s.omit(Book, ['id', 'owner']);
type NewBook = Infer<typeof NewBook>;
expectType<string>({} as NewBook['title']);
expectError(({} as NewBook).id);
const Patch = s.partial(NewBook);
expectAssignable<Infer<typeof Patch>>({});
expectAssignable<Infer<typeof Patch>>({ title: 'x' });
const Card = s.pick(Book, ['id', 'title']);
expectType<{ id: number; title: string }>({} as Infer<typeof Card>);
const Full = s.required(s.partial(Card));
expectType<{ id: number; title: string }>({} as Infer<typeof Full>);
const WithIsbn = s.extend(Card, { isbn: s.string(), title: s.optional(s.string()) });
expectType<{ id: number; isbn: string; title?: string | undefined }>({} as Infer<typeof WithIsbn>);
expectError(s.pick(Book, ['nope']));

// Unions and intersections.
const either = s.union([s.string(), s.integer()]);
expectType<string | number>({} as Infer<typeof either>);
const both = s.intersect([s.object({ a: s.string() }), s.object({ b: s.integer() })]);
expectType<{ a: string; b: number }>({} as Infer<typeof both>);

// Routes typed by their schemas: @xufa/http.
const app = xufa().withTypeProvider<SchemaTypeProvider>();
app.post('/books', { schema: { body: NewBook, params: s.object({ shelf: s.integer() }), querystring: s.object({ draft: s.optional(s.boolean()) }) } }, async (request) => {
  expectType<string>(request.body.title);
  expectType<number | undefined>(request.body.pages);
  expectType<number>(request.params.shelf);
  expectType<boolean | undefined>(request.query.draft);
  return { ok: true };
});
app.get('/books/:id', { schema: { response: { 200: Card } } }, async () => ({ id: 1, title: 't' }));

// fastify, the same.
const other = fastify().withTypeProvider<SchemaTypeProvider>();
other.post('/books', { schema: { body: NewBook } }, async (request) => {
  expectType<'draft' | 'published'>(request.body.status);
  return null;
});

// Replies typed by response: a reply of another shape is an error.
expectError(app.get('/cards/:id', { schema: { response: { 200: Card } } }, async () => ({ id: 'one', title: 't' })));

// One Infer for every kind of schema of the package: s, the builder of types, a plain object of types.
import { Schema, String as StringType, Integer, Infer as InferAny } from '../..';
const built = s.object({ a: s.string(), b: s.optional(s.integer()) });
expectType<{ a: string; b?: number }>({} as InferAny<typeof built>);
const typed = new Schema({ a: StringType(), b: Integer({ isMandatory: false }) });
expectType<{ a: string; b?: number }>({} as InferAny<typeof typed>);
const plain = { a: StringType() };
expectType<{ a: string }>({} as InferAny<typeof plain>);

// foldMessages: a compile option.
expectType<ErrorsFunction>(compileJsonSchema({ type: 'string' }, { foldMessages: true }));
expectError(compileJsonSchema({ type: 'string' }, { foldMessages: 'yes' }));
