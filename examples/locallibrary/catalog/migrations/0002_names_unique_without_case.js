// A migration of xufa, made by makeMigrations() on 2026-10-08T16:15:36.251Z. Its operations can be edited, and
// written by hand: renameColumn, renameTable, sql and run (data migrations, with a function of the database).
export const operations = [
  {
    op: 'dropIndex',
    table: 'catalog_genre',
    name: 'catalog_genre_name_uniq',
  },
  {
    op: 'dropIndex',
    table: 'catalog_language',
    name: 'catalog_language_name_uniq',
  },
];
