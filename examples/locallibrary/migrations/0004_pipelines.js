// A migration of xufa, made by makeMigrations() on 2026-10-08T20:50:32.125Z. Its operations can be edited, and
// written by hand: renameColumn, renameTable, sql and run (data migrations, with a function of the database).
export const operations = [
  {
    op: 'createTable',
    spec: {
      table: 'xufa_pipeline_runs',
      model: 'XufaPipelineRun',
      fillfactor: null,
      columns: {
        id: {
          type: 'id',
          primaryKey: true,
          null: false,
        },
        pipeline: {
          type: 'string',
          primaryKey: false,
          null: false,
          maxLength: 200,
        },
        status: {
          type: 'string',
          primaryKey: false,
          null: false,
          maxLength: 20,
        },
        input: {
          type: 'json',
          primaryKey: false,
          null: true,
        },
        result: {
          type: 'json',
          primaryKey: false,
          null: true,
        },
        error: {
          type: 'text',
          primaryKey: false,
          null: true,
        },
        definition: {
          type: 'json',
          primaryKey: false,
          null: false,
        },
        trigger: {
          type: 'string',
          primaryKey: false,
          null: true,
          maxLength: 200,
        },
        key: {
          type: 'string',
          primaryKey: false,
          null: true,
          maxLength: 200,
        },
        inFlight: {
          type: 'integer',
          primaryKey: false,
          null: false,
        },
        priority: {
          type: 'integer',
          primaryKey: false,
          null: false,
        },
        queue: {
          type: 'string',
          primaryKey: false,
          null: true,
          maxLength: 200,
        },
        runAt: {
          type: 'datetime',
          primaryKey: false,
          null: true,
        },
        parent: {
          type: 'string',
          primaryKey: false,
          null: true,
          maxLength: 64,
        },
        parentStep: {
          type: 'string',
          primaryKey: false,
          null: true,
          maxLength: 200,
        },
        depth: {
          type: 'integer',
          primaryKey: false,
          null: false,
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
          name: 'xufa_pipeline_runs_key_idx',
          columns: ['key'],
          unique: false,
        },
        {
          name: 'xufa_pipeline_runs_parent_idx',
          columns: ['parent'],
          unique: false,
        },
        {
          name: 'xufa_pipeline_runs_pipeline_status_idx',
          columns: ['pipeline', 'status'],
          unique: false,
        },
      ],
    },
  },
  {
    op: 'createTable',
    spec: {
      table: 'xufa_pipeline_steps',
      model: 'XufaPipelineStep',
      fillfactor: null,
      columns: {
        id: {
          type: 'id',
          primaryKey: true,
          null: false,
        },
        run: {
          type: 'string',
          primaryKey: false,
          null: false,
          maxLength: 64,
        },
        step: {
          type: 'string',
          primaryKey: false,
          null: false,
          maxLength: 200,
        },
        block: {
          type: 'string',
          primaryKey: false,
          null: false,
          maxLength: 200,
        },
        status: {
          type: 'string',
          primaryKey: false,
          null: false,
          maxLength: 20,
        },
        output: {
          type: 'json',
          primaryKey: false,
          null: true,
        },
        error: {
          type: 'text',
          primaryKey: false,
          null: true,
        },
        attempts: {
          type: 'integer',
          primaryKey: false,
          null: false,
        },
        pausedUntil: {
          type: 'datetime',
          primaryKey: false,
          null: true,
        },
        child: {
          type: 'string',
          primaryKey: false,
          null: true,
          maxLength: 64,
        },
        startedAt: {
          type: 'datetime',
          primaryKey: false,
          null: true,
        },
        finishedAt: {
          type: 'datetime',
          primaryKey: false,
          null: true,
        },
      },
      indexes: [
        {
          name: 'xufa_pipeline_steps_run_step_uniq',
          columns: ['run', 'step'],
          unique: true,
        },
      ],
    },
  },
];
