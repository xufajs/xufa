// A migration of xufa, made by makeMigrations() on 2026-10-08T20:52:29.032Z. Its operations can be edited, and
// written by hand: renameColumn, renameTable, sql and run (data migrations, with a function of the database).
export const operations = [
  {
    op: 'createTable',
    spec: {
      table: 'tickets_ticket',
      model: 'Ticket',
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
        body: {
          type: 'text',
          primaryKey: false,
          null: false,
        },
        status: {
          type: 'string',
          primaryKey: false,
          null: false,
          maxLength: 10,
        },
        createdAt: {
          type: 'datetime',
          primaryKey: false,
          null: false,
        },
      },
      indexes: [],
    },
  },
];
