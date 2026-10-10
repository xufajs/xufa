// A migration of xufa, made by makeMigrations() on 2026-10-09T16:09:05.787Z. Its operations can be edited, and
// written by hand: renameColumn, renameTable, sql and run (data migrations, with a function of the database).
export const operations = [
  {
    op: 'addColumn',
    table: 'accounts_user',
    column: 'sessionGeneration',
    spec: {
      type: 'integer',
      primaryKey: false,
      null: false,
    },
    default: 0,
  },
];
