// A migration of xufa, made by makeMigrations() on 2026-10-10T20:36:02.871Z. Its operations can be edited, and
// written by hand: renameColumn, renameTable, sql and run (data migrations, with a function of the database).
export const operations = [
  {
    op: 'createTable',
    spec: {
      table: 'xufa_rule_books',
      model: 'XufaRuleBook',
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
        tenant: {
          type: 'string',
          primaryKey: false,
          null: true,
          maxLength: 200,
        },
        version: {
          type: 'integer',
          primaryKey: false,
          null: false,
        },
        status: {
          type: 'string',
          primaryKey: false,
          null: false,
          maxLength: 20,
        },
        json: {
          type: 'json',
          primaryKey: false,
          null: false,
        },
        xlsx: {
          type: 'bytes',
          primaryKey: false,
          null: true,
        },
        fileName: {
          type: 'string',
          primaryKey: false,
          null: true,
          maxLength: 255,
        },
        errors: {
          type: 'json',
          primaryKey: false,
          null: true,
        },
        author: {
          type: 'string',
          primaryKey: false,
          null: true,
          maxLength: 200,
        },
        comment: {
          type: 'text',
          primaryKey: false,
          null: true,
        },
        createdAt: {
          type: 'datetime',
          primaryKey: false,
          null: false,
        },
      },
      indexes: [
        {
          name: 'xufa_rule_books_tenant_name_version_uniq',
          columns: ['tenant', 'name', 'version'],
          unique: true,
        },
        {
          name: 'xufa_rule_books_tenant_name_status_idx',
          columns: ['tenant', 'name', 'status'],
          unique: false,
        },
      ],
    },
  },
];
