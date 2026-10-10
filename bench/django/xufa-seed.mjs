// Puts the data of the benchmark (data.mjs, as JSON) in the database of xufa, its migrations applied first: the same
// rows as Django's, on an empty database. The librarian has the role librarian (xufa.yaml: Author.* among others).
//
//   node xufa-seed.mjs <database url> data.json
import fs from 'node:fs';
import { buildApp } from './xufa-app.mjs';

const [databaseUrl, file] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const { app, project } = await buildApp({ databaseUrl, migrate: true });
await app.ready();
const [Genre, Language, Author, Book, BookInstance, User] = [
  'Genre',
  'Language',
  'Author',
  'Book',
  'BookInstance',
  'User',
].map((name) => project.model(name));

try {
  await app.db.transaction(async () => {
    const genres = await Genre.objects.bulkCreate(data.genres);
    const languages = await Language.objects.bulkCreate(data.languages);
    const authors = await Author.objects.bulkCreate(data.authors);
    const books = await Book.objects.bulkCreate(
      data.books.map(({ genres: _, author, language, ...book }) => ({
        ...book,
        author: authors[author],
        language: languages[language],
      }))
    );
    const { field, from, to } = Book.meta.manyToManyRelation('genre');
    await field.through.objects.bulkCreate(
      data.books.flatMap((book, i) =>
        book.genres.map((g) => ({ [from.attname]: books[i].pk, [to.attname]: genres[g].pk }))
      )
    );
    const users = {};
    for (const user of data.users) {
      users[user.username] = await User.createUser({
        username: user.username,
        email: user.email,
        password: data.password,
        ...(user.role === 'librarian' ? { isStaff: true, role: 'librarian' } : {}),
      });
    }
    await BookInstance.objects.bulkCreate(
      data.copies.map((copy) => ({
        ...copy,
        book: books[copy.book],
        borrower: copy.borrower ? users[copy.borrower] : null,
      }))
    );
    console.log(`xufa: seeded ${authors.length} authors, ${books.length} books, ${data.copies.length} copies`);
    console.log(JSON.stringify({ firstAuthor: authors[0].pk, firstBook: books[0].pk }));
  });
} finally {
  await app.close();
}
