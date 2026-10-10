// A migration of xufa, made by makeMigrations() on 2026-10-08T20:52:10.357Z. Its operations can be edited, and
// written by hand: renameColumn, renameTable, sql and run (data migrations, with a function of the database).
export const operations = [
  {
    op: 'createTable',
    spec: {
      table: 'accounts_organization',
      model: 'Organization',
      fillfactor: null,
      columns: {
        id: {
          type: 'id',
          primaryKey: true,
          null: false,
        },
        slug: {
          type: 'string',
          primaryKey: false,
          null: false,
          maxLength: 40,
        },
        name: {
          type: 'string',
          primaryKey: false,
          null: false,
          maxLength: 100,
        },
      },
      indexes: [
        {
          name: 'accounts_organization_slug_uniq',
          columns: ['slug'],
          unique: true,
        },
      ],
    },
  },
  {
    op: 'createTable',
    spec: {
      table: 'accounts_user',
      model: 'User',
      fillfactor: null,
      columns: {
        id: {
          type: 'id',
          primaryKey: true,
          null: false,
        },
        username: {
          type: 'string',
          primaryKey: false,
          null: false,
          maxLength: 150,
        },
        email: {
          type: 'string',
          primaryKey: false,
          null: true,
          maxLength: 254,
        },
        password: {
          type: 'string',
          primaryKey: false,
          null: false,
          maxLength: 255,
        },
        firstName: {
          type: 'string',
          primaryKey: false,
          null: false,
          maxLength: 150,
        },
        lastName: {
          type: 'string',
          primaryKey: false,
          null: false,
          maxLength: 150,
        },
        isStaff: {
          type: 'boolean',
          primaryKey: false,
          null: false,
        },
        isSuperuser: {
          type: 'boolean',
          primaryKey: false,
          null: false,
        },
        isActive: {
          type: 'boolean',
          primaryKey: false,
          null: false,
        },
        dateJoined: {
          type: 'datetime',
          primaryKey: false,
          null: false,
        },
        lastLogin: {
          type: 'datetime',
          primaryKey: false,
          null: true,
        },
        role: {
          type: 'string',
          primaryKey: false,
          null: true,
          maxLength: 100,
        },
        permissions: {
          type: 'json',
          primaryKey: false,
          null: false,
        },
      },
      indexes: [
        {
          name: 'accounts_user_username_uniq',
          columns: ['username'],
          unique: true,
        },
      ],
    },
  },
];
