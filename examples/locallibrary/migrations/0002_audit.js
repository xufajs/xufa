// A migration of xufa, made by makeMigrations() on 2026-10-08T13:59:09.316Z. Its operations can be edited, and
// written by hand: renameColumn, renameTable, sql and run (data migrations, with a function of the database).
export const operations = [
  {
    op: 'createTable',
    spec: {
      table: 'xufa_audit',
      model: 'AuditEntry',
      fillfactor: null,
      columns: {
        id: {
          type: 'id',
          primaryKey: true,
          null: false,
        },
        at: {
          type: 'datetime',
          primaryKey: false,
          null: false,
        },
        action: {
          type: 'string',
          primaryKey: false,
          null: false,
          maxLength: 100,
        },
        model: {
          type: 'string',
          primaryKey: false,
          null: true,
          maxLength: 200,
        },
        key: {
          type: 'string',
          primaryKey: false,
          null: true,
          maxLength: 500,
        },
        changes: {
          type: 'json',
          primaryKey: false,
          null: true,
        },
        data: {
          type: 'json',
          primaryKey: false,
          null: true,
        },
        actor: {
          type: 'string',
          primaryKey: false,
          null: true,
          maxLength: 200,
        },
        context: {
          type: 'json',
          primaryKey: false,
          null: true,
        },
      },
      indexes: [
        {
          name: 'xufa_audit_at_idx',
          columns: ['at'],
          unique: false,
        },
        {
          name: 'xufa_audit_model_idx',
          columns: ['model'],
          unique: false,
        },
      ],
    },
  },
];
