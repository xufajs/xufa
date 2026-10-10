// A migration of xufa, made by makeMigrations() on 2026-10-09T18:58:44.648Z. Its operations can be edited, and
// written by hand: renameColumn, renameTable, sql and run (data migrations, with a function of the database).
export const operations = [
  {
    op: 'dropIndex',
    table: 'catalog_book',
    name: 'catalog_book_title_authorId_idx',
  },
  {
    op: 'createIndex',
    table: 'catalog_book',
    index: {
      name: 'catalog_book_title_authorId_idx',
      columns: ['title', 'authorId'],
      unique: false,
      include: ['id'],
    },
  },
];
