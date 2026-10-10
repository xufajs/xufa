// A migration of xufa, made by makeMigrations() on 2026-10-08T13:35:38.311Z. Its operations can be edited, and
// written by hand: renameColumn, renameTable, sql and run (data migrations, with a function of the database).
export const operations = [
  {
    op: 'createTable',
    spec: {
      table: 'xufa_sessions',
      model: 'XufaSession',
      fillfactor: null,
      columns: {
        id: {
          type: 'string',
          primaryKey: true,
          null: false,
          maxLength: 64,
        },
        data: {
          type: 'json',
          primaryKey: false,
          null: false,
        },
        expiresAt: {
          type: 'datetime',
          primaryKey: false,
          null: false,
        },
      },
      indexes: [
        {
          name: 'xufa_sessions_expiresAt_idx',
          columns: ['expiresAt'],
          unique: false,
          expireAfter: 0,
        },
      ],
    },
  },
];
