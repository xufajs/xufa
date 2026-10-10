// A migration of xufa, made by makeMigrations() on 2026-10-08T13:35:38.314Z. Its operations can be edited, and
// written by hand: renameColumn, renameTable, sql and run (data migrations, with a function of the database).
export const operations = [
  {
    op: 'createTable',
    spec: {
      table: 'catalog_genre',
      model: 'Genre',
      fillfactor: null,
      columns: {
        id: {
          type: 'id',
          primaryKey: true,
          null: false,
        },
        name: {
          type: 'string',
          primaryKey: false,
          null: false,
          maxLength: 200,
        },
      },
      indexes: [
        {
          name: 'catalog_genre_name_uniq',
          columns: ['name'],
          unique: true,
        },
        {
          name: 'genre_name_case_insensitive_unique',
          columns: ['name'],
          unique: true,
          lower: ['name'],
        },
      ],
    },
  },
  {
    op: 'createTable',
    spec: {
      table: 'catalog_language',
      model: 'Language',
      fillfactor: null,
      columns: {
        id: {
          type: 'id',
          primaryKey: true,
          null: false,
        },
        name: {
          type: 'string',
          primaryKey: false,
          null: false,
          maxLength: 200,
        },
      },
      indexes: [
        {
          name: 'catalog_language_name_uniq',
          columns: ['name'],
          unique: true,
        },
        {
          name: 'language_name_case_insensitive_unique',
          columns: ['name'],
          unique: true,
          lower: ['name'],
        },
      ],
    },
  },
  {
    op: 'createTable',
    spec: {
      table: 'catalog_author',
      model: 'Author',
      fillfactor: null,
      columns: {
        id: {
          type: 'id',
          primaryKey: true,
          null: false,
        },
        firstName: {
          type: 'string',
          primaryKey: false,
          null: false,
          maxLength: 100,
        },
        lastName: {
          type: 'string',
          primaryKey: false,
          null: false,
          maxLength: 100,
        },
        dateOfBirth: {
          type: 'date',
          primaryKey: false,
          null: true,
        },
        dateOfDeath: {
          type: 'date',
          primaryKey: false,
          null: true,
        },
      },
      indexes: [],
    },
  },
  {
    op: 'createTable',
    spec: {
      table: 'catalog_book',
      model: 'Book',
      fillfactor: null,
      columns: {
        id: {
          type: 'id',
          primaryKey: true,
          null: false,
        },
        title: {
          type: 'string',
          primaryKey: false,
          null: false,
          maxLength: 200,
        },
        authorId: {
          type: 'id',
          primaryKey: false,
          null: true,
          references: {
            table: 'catalog_author',
            column: 'id',
          },
        },
        summary: {
          type: 'text',
          primaryKey: false,
          null: false,
        },
        isbn: {
          type: 'string',
          primaryKey: false,
          null: false,
          maxLength: 13,
        },
        languageId: {
          type: 'id',
          primaryKey: false,
          null: true,
          references: {
            table: 'catalog_language',
            column: 'id',
          },
        },
      },
      indexes: [
        {
          name: 'catalog_book_authorId_idx',
          columns: ['authorId'],
          unique: false,
        },
        {
          name: 'catalog_book_isbn_uniq',
          columns: ['isbn'],
          unique: true,
        },
        {
          name: 'catalog_book_languageId_idx',
          columns: ['languageId'],
          unique: false,
        },
      ],
    },
  },
  {
    op: 'createTable',
    spec: {
      table: 'catalog_bookinstance',
      model: 'BookInstance',
      fillfactor: null,
      columns: {
        id: {
          type: 'uuid',
          primaryKey: true,
          null: false,
        },
        bookId: {
          type: 'id',
          primaryKey: false,
          null: true,
          references: {
            table: 'catalog_book',
            column: 'id',
          },
        },
        imprint: {
          type: 'string',
          primaryKey: false,
          null: false,
          maxLength: 200,
        },
        dueBack: {
          type: 'date',
          primaryKey: false,
          null: true,
        },
        borrowerId: {
          type: 'id',
          primaryKey: false,
          null: true,
          references: {
            table: 'accounts_user',
            column: 'id',
          },
        },
        status: {
          type: 'string',
          primaryKey: false,
          null: false,
          maxLength: 1,
        },
      },
      indexes: [
        {
          name: 'catalog_bookinstance_bookId_idx',
          columns: ['bookId'],
          unique: false,
        },
        {
          name: 'catalog_bookinstance_borrowerId_idx',
          columns: ['borrowerId'],
          unique: false,
        },
      ],
    },
  },
  {
    op: 'createTable',
    spec: {
      table: 'catalog_book_genre',
      model: 'BookGenre',
      fillfactor: null,
      columns: {
        id: {
          type: 'id',
          primaryKey: true,
          null: false,
        },
        bookId: {
          type: 'id',
          primaryKey: false,
          null: false,
          references: {
            table: 'catalog_book',
            column: 'id',
          },
        },
        genreId: {
          type: 'id',
          primaryKey: false,
          null: false,
          references: {
            table: 'catalog_genre',
            column: 'id',
          },
        },
      },
      indexes: [
        {
          name: 'catalog_book_genre_bookId_idx',
          columns: ['bookId'],
          unique: false,
        },
        {
          name: 'catalog_book_genre_genreId_idx',
          columns: ['genreId'],
          unique: false,
        },
        {
          name: 'catalog_book_genre_bookId_genreId_uniq',
          columns: ['bookId', 'genreId'],
          unique: true,
        },
      ],
    },
  },
];
