// The models of the catalog (catalog/models.py): genres and languages, books and their authors, and the copies of the
// books (book instances) that users borrow. Their labels and help texts (verbose_name, help_text) are those of Django,
// shown by the forms and the admin; display is their __str__.
import { randomUUID } from 'node:crypto';
import { Model, fields } from 'xufa/orm';
import { today } from 'xufa/forms';
import { User } from '../accounts/models.js';

class Genre extends Model {
  static fields = {
    name: fields.string({
      maxLength: 200,
      unique: 'ci', // UniqueConstraint(Lower('name'))
      help: 'Enter a book genre (e.g. Science Fiction, French Poetry etc.)',
      messages: { unique: 'Genre already exists (case insensitive match)' },
    }),
  };

  static options = { display: '{name}' };
}

class Language extends Model {
  static fields = {
    name: fields.string({
      maxLength: 200,
      unique: 'ci',
      help: "Enter the book's natural language (e.g. English, French, Japanese etc.)",
      messages: { unique: 'Language already exists (case insensitive match)' },
    }),
  };

  static options = { display: '{name}' };
}

class Author extends Model {
  static fields = {
    firstName: fields.string({ maxLength: 100 }),
    lastName: fields.string({ maxLength: 100 }),
    dateOfBirth: fields.date({ null: true }),
    dateOfDeath: fields.date({ null: true, label: 'died' }),
  };

  // cache: its queries may be kept (cached()), until a write to it or 10 s: the counts of the home page.
  static options = { ordering: ['lastName', 'firstName'], display: '{lastName}, {firstName}', cache: { ttl: 10000 } };
}

class Book extends Model {
  static fields = {
    title: fields.string({ maxLength: 200 }),
    // RESTRICT: an author with books is not deleted (protect).
    author: fields.foreignKey(() => Author, { null: true, onDelete: 'protect' }),
    summary: fields.text({ maxLength: 1000, help: 'Enter a brief description of the book' }),
    isbn: fields.string({
      maxLength: 13,
      unique: true,
      label: 'ISBN',
      help: '13 Character <a href="https://www.isbn-international.org/content/what-isbn">ISBN number</a>',
    }),
    genre: fields.manyToMany(() => Genre, { help: 'Select a genre for this book' }),
    language: fields.foreignKey(() => Language, { null: true, onDelete: 'setNull' }),
  };

  // The list is ordered by title: an index of that order, so a page reads its rows from it, not a sort of every book.
  static options = {
    ordering: ['title', 'author'],
    display: '{title}',
    // (with the key: a page far into the list skips the books before it in the index alone)
    indexes: [{ fields: ['title', 'author'], include: ['pk'] }],
    cache: { ttl: 10000 },
  };

  // display_genre: its first three genres, for the column Genre of the admin.
  async displayGenre() {
    return (await this.genre.all())
      .slice(0, 3)
      .map((genre) => genre.name)
      .join(', ');
  }
}
Book.prototype.displayGenre.label = 'Genre';

class BookInstance extends Model {
  static fields = {
    id: fields.uuid({
      primaryKey: true,
      default: () => randomUUID(),
      help: 'Unique ID for this particular book across whole library',
    }),
    // RESTRICT: a book with copies is not deleted (protect).
    book: fields.foreignKey(() => Book, { null: true, onDelete: 'protect' }),
    imprint: fields.string({ maxLength: 200 }),
    dueBack: fields.date({ null: true }),
    borrower: fields.foreignKey(() => User, { null: true, onDelete: 'setNull' }),
    // LOAN_STATUS: the values and their labels; copy.display('status') is get_status_display().
    status: fields.string({
      maxLength: 1,
      choices: [
        ['d', 'Maintenance'],
        ['o', 'On loan'],
        ['a', 'Available'],
        ['r', 'Reserved'],
      ],
      default: 'd',
      help: 'Book availability',
    }),
  };

  static options = {
    ordering: ['dueBack'],
    display: '{id} ({book.title})',
    permissions: { markReturned: 'Set book as returned' }, // can_mark_returned
    cache: { ttl: 10000 },
  };

  get isOverdue() {
    return Boolean(this.dueBack && today() > this.dueBack);
  }
}

export { Genre, Language, Author, Book, BookInstance };
