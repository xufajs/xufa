// A migration of xufa, made by makeMigrations() on 2026-10-08T20:11:15.879Z. Its operations can be edited, and
// written by hand: renameColumn, renameTable, sql and run (data migrations, with a function of the database).
export const operations = [
  {
    op: 'createTable',
    spec: {
      table: 'xufa_jobs',
      model: 'XufaJob',
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
        queue: {
          type: 'string',
          primaryKey: false,
          null: false,
          maxLength: 100,
        },
        payload: {
          type: 'json',
          primaryKey: false,
          null: true,
        },
        status: {
          type: 'string',
          primaryKey: false,
          null: false,
          maxLength: 20,
        },
        priority: {
          type: 'integer',
          primaryKey: false,
          null: false,
        },
        runAt: {
          type: 'datetime',
          primaryKey: false,
          null: false,
        },
        attempts: {
          type: 'integer',
          primaryKey: false,
          null: false,
        },
        maxAttempts: {
          type: 'integer',
          primaryKey: false,
          null: false,
        },
        key: {
          type: 'string',
          primaryKey: false,
          null: true,
          maxLength: 200,
        },
        lockedBy: {
          type: 'string',
          primaryKey: false,
          null: true,
          maxLength: 200,
        },
        lockedUntil: {
          type: 'datetime',
          primaryKey: false,
          null: true,
        },
        lastError: {
          type: 'text',
          primaryKey: false,
          null: true,
        },
        result: {
          type: 'json',
          primaryKey: false,
          null: true,
        },
        createdAt: {
          type: 'datetime',
          primaryKey: false,
          null: false,
        },
        finishedAt: {
          type: 'datetime',
          primaryKey: false,
          null: true,
        },
      },
      indexes: [
        {
          name: 'xufa_jobs_key_idx',
          columns: ['key'],
          unique: false,
        },
        {
          name: 'xufa_jobs_status_queue_runAt_idx',
          columns: ['status', 'queue', 'runAt'],
          unique: false,
        },
      ],
    },
  },
];
