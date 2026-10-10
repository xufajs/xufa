// A migration of xufa, made by makeMigrations() on 2026-10-08T13:48:02.619Z. Its operations can be edited, and
// written by hand: renameColumn, renameTable, sql and run (data migrations, with a function of the database).
export const operations = [
  {
    op: 'createTable',
    spec: {
      table: 'group',
      model: 'Group',
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
          maxLength: 150,
        },
        permissions: {
          type: 'json',
          primaryKey: false,
          null: false,
        },
        inherits: {
          type: 'json',
          primaryKey: false,
          null: false,
        },
      },
      indexes: [
        {
          name: 'group_name_uniq',
          columns: ['name'],
          unique: true,
        },
      ],
    },
  },
  {
    op: 'createTable',
    spec: {
      table: 'accounts_user_groups',
      model: 'UserGroups',
      fillfactor: null,
      columns: {
        id: {
          type: 'id',
          primaryKey: true,
          null: false,
        },
        userId: {
          type: 'id',
          primaryKey: false,
          null: false,
          references: {
            table: 'accounts_user',
            column: 'id',
          },
        },
        groupId: {
          type: 'id',
          primaryKey: false,
          null: false,
          references: {
            table: 'group',
            column: 'id',
          },
        },
      },
      indexes: [
        {
          name: 'accounts_user_groups_userId_idx',
          columns: ['userId'],
          unique: false,
        },
        {
          name: 'accounts_user_groups_groupId_idx',
          columns: ['groupId'],
          unique: false,
        },
        {
          name: 'accounts_user_groups_userId_groupId_uniq',
          columns: ['userId', 'groupId'],
          unique: true,
        },
      ],
    },
  },
];
