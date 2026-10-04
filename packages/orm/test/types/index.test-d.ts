import { expectType, expectError } from 'tsd';
import {
  Database,
  Model,
  fields,
  Fields,
  QuerySet,
  RelatedSet,
  Q,
  or,
  F,
  Count,
  Sum,
  plugin,
  ValidationError,
} from '../..';

const tagFields = { name: fields.string({ unique: true }) };
class Tag extends Model {
  static fields = tagFields;
}
interface Tag extends Fields<typeof tagFields> {}

const authorFields = {
  name: fields.string({ maxLength: 100 }),
  email: fields.string({ null: true }),
  age: fields.integer({ null: true }),
  active: fields.boolean({ default: true }),
  createdAt: fields.datetime({ autoNowAdd: true }),
};
class Author extends Model {
  static fields = authorFields;
}
interface Author extends Fields<typeof authorFields> {}

const bookFields = {
  title: fields.string(),
  data: fields.json<{ pages: number }>(),
  author: fields.foreignKey(() => Author, { relatedName: 'books' }),
  editor: fields.foreignKey(() => Author, { null: true }),
  tags: fields.manyToMany(() => Tag, { relatedName: 'books' }),
};
class Book extends Model {
  static fields = bookFields;

  static options = { fillfactor: 80 };
}
interface Book extends Fields<typeof bookFields> {}

async function main() {
  const db = new Database({ backend: 'sqlite', filename: ':memory:' }).register(Author, Book, Tag);
  expectType<Database>(await db.connect());

  const authors = await Author.query().filter({ age__gte: 18 }).orderBy('-name').limit(10);
  expectType<Author[]>(authors);
  expectType<string>(authors[0].name);
  expectType<string | null>(authors[0].email);
  expectType<number | null>(authors[0].age);
  expectType<boolean>(authors[0].active);
  expectType<Date>(authors[0].createdAt);

  const book = await Book.query().selectRelated('author').get({ pk: 1 });
  expectType<Book>(book);
  expectType<string>(book.title);
  expectType<{ pages: number }>(book.data);
  expectType<number | string>(book.authorId);
  expectType<Author | undefined>(book.author);
  expectType<number | string | null>(book.editorId);
  expectType<Author | null | undefined>(book.editor);
  expectType<RelatedSet<Tag>>(book.tags);
  expectType<void>(await book.tags.add(1, 2));
  expectType<Tag[]>(await book.tags);

  expectType<QuerySet<Author>>(Author.query().filter(or({ name: 'a' }, new Q({ age: 1 }).not())));
  expectType<number>(
    await Book.query()
      .filter({ author__name: 'Ada' })
      .update({ title: F('title') })
  );
  expectType<{ n: number; total: number | null }>(await Book.query().aggregate({ n: Count(), total: Sum('pages') }));
  expectType<[Author, boolean]>(await Author.query().getOrCreate({ name: 'Ada' }));
  for await (const item of Author.query()) expectType<Author>(item);
  expectType<Author>(await Author.create({ name: 'Ada' }));
  expectType<Promise<string[]>>(db.migrate({ dir: 'migrations' }));
  expectType<number>(await db.transaction(async () => 1));
  expectError(Author.query().limit('ten'));
  expectType<Record<string, string[]>>(new ValidationError('x', {}).errors);
  expectType<Promise<void>>(plugin({}, { database: db }));
}

void main;

// A model without a primary key.
class Keyless extends Model {
  static fields = { level: fields.string() };

  static options = { primaryKey: false as const };
}
expectType<typeof Keyless>(Keyless);
