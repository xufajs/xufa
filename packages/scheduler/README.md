# @xufa/scheduler

Jobs that run every so often, on cron expressions, or once, with no dependencies. Each job has a timer of its own, so
a slow job delays no other one and a failure stops none; a run does not overlap the one before it; a timeout aborts
the signal of a run, and a run that fails is tried again with backoff; a history records every run (and runs the
times missed when a process starts again); and, with a lock in a database, each time of a job runs in one process
among those of several machines.

```js
const { Scheduler, ormLock } = require('@xufa/scheduler'); // or require('xufa/scheduler')

const scheduler = new Scheduler({ logger, timezone: 'Europe/Madrid' });

scheduler.add({ name: 'purge sessions', every: '10m', run: () => Session.objects.filter({ expired: true }).delete() });
scheduler.add({
  name: 'daily report',
  cron: '0 8 * * mon-fri',
  timeout: '5m',
  run: async ({ signal, scheduledAt }) => sendReport({ day: scheduledAt, signal }),
});
scheduler.add({ name: 'warm cache', in: '30s', run: warmCache });

scheduler.start();
// ...
await scheduler.stop(); // waits for the runs going on (10 s), then aborts their signals
```

## Jobs

`scheduler.add(job)`: a `name`, a `run(context)` function, and one of:

| Schedule            | When it runs                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| `every: '10m'`      | At the multiples of the interval since 1970: `:00`, `:10`, `:20`... (`align: false`: from the start) |
| `cron: '0 8 * * *'` | A cron expression (below), in `timezone` (of the job, of the scheduler, or the local one)            |
| `at: date`          | Once, at a `Date` (or what `new Date()` takes); a time past runs at the start                        |
| `in: '30s'`         | Once, that long after the start                                                                      |

Durations are milliseconds or texts: `'500ms'`, `'30s'`, `'10m'`, `'2h'`, `'1d'`, `'1w'`, `'1h30m'`.

| Option       | Default                      | What it does                                                                                                     |
| ------------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `overlap`    | `'skip'`                     | A time while a run goes on: `'skip'` leaves it out, `'wait'` runs once when it ends, `'allow'` runs both at once |
| `timeout`    |                              | Aborts the signal of a run that goes over it (a `TimeoutError`); the run is a failure, the job free              |
| `immediate`  | `false`                      | Runs once when the scheduler starts too                                                                          |
| `data`       |                              | Given to each run                                                                                                |
| `lock`       | `true`                       | `false`: this job runs in every process, though the scheduler has a lock                                         |
| `lockTtl`    | the `timeout`, or 10 minutes | How long a claim lasts when its process dies (renewed while the run goes on)                                     |
| `retries`    | `0`                          | How many times more a run that fails (or times out) is tried                                                     |
| `retryDelay` | `'1s'`                       | The wait before the second attempt, multiplied by `retryFactor` (`2`) each time, up to `maxRetryDelay`           |
| `catchUp`    | `false`                      | When the scheduler starts, the last time missed runs once (`every` aligned, and `cron`; with a `history`)        |

`run` gets `{ name, scheduledAt, attempt, signal, data, scheduler }`; what it returns (or the promise of it) ends the
attempt. An attempt that does not stop when its signal is aborted goes on by itself, but its job goes on.

The attempts of a run that is tried again are one run: the job is running between them (its times are skipped, or
wait), it keeps its claim of the lock, and each attempt has the `timeout`. `stop()` ends the waits between them.

Times missed (the process was stopped, or busy) are not run later, but with `catchUp`: then, when the scheduler
starts, the last time due that the history has no run of runs once (not every time missed). A job that the history has
no run of (a new one) does not catch up.

## Cron expressions

`minute hour day-of-month month day-of-week`, or six fields with seconds first. Each field is `*`, a value, a range
(`1-5`), a list (`1,15,30`) or steps (`*/15`, `0-30/10`, `5/20`); months and days of the week by name too (`jan`,
`mon-fri`; `0` and `7` are Sunday). The macros `@yearly`, `@monthly`, `@weekly`, `@daily` and `@hourly`. As in Vixie
cron, when both the day of the month and of the week are given, a day matching either runs (`0 0 13 * fri`: the 13th,
and Fridays). An expression that can never run (`0 0 30 2 *`) is an error.

In a time zone that changes its clock, a time that does not exist (02:30 when 02:00 is 03:00) is skipped, and an hour
that repeats (02:30 when 03:00 is 02:00 again) runs once. `nextRuns(expression, count, { timezone, from })` gives the
next times of an expression, to check it.

## State and events

`scheduler.jobs()` and `scheduler.job(name)`: `{ name, schedule, next, running, runs, failures, skipped, retries,
lastRun, lastDuration, lastError }`. `remove(name)`, `has(name)`, and `runNow(name)`: a run now, out of the schedule (its
result; what it throws is thrown).

Events: `'run'`, `'retry'` (with `attempt`, `error` and `delay`), `'done'` (with `duration`, `attempts` and `result`),
`'failure'` (with `error`), `'skip'` (with `why`: `'running'` or `'locked'`) and `'catchUp'`. `onError(error, job)` is called for every failure, and the logger (as `@xufa/logger` or
pino) logs them.

## History

With a `history`, the scheduler records every run: `{ name, scheduledAt, startedAt, duration, status, attempts, error,
host }`, its status `'done'`, `'failed'` or `'timeout'`. `scheduler.history(name, { limit })` gives the runs of a job,
the last first.

```js
const scheduler = new Scheduler({ history: ormHistory(db), lock: ormLock(db) }); // their tables: db.sync()
await scheduler.history('daily report', { limit: 10 });
```

- `memoryHistory({ keep })`: the last `keep` runs of each job (100), in the process.
- `ormHistory(db, { maxAge })`: in a table of a database of [@xufa/orm](../orm) (`xufa_scheduler_runs`), shared by the
  schedulers of every machine; runs older than `maxAge` (30 days; `null` keeps them) are deleted, at most once an hour.
  `history.prune(before)` deletes them when you want.

A history of your own is `{ record(entry), last(name), list(name, { limit }) }`. A history that fails is logged, and
stops no job.

## In a cluster, and on several machines

A scheduler runs its jobs in its process. In a cluster of [@xufa/cluster](../cluster), make it in the `primary` (or in
one worker), not in every worker:

```js
const config = require('./config'); // loadConfig() of @xufa/config: jobs: { purgeEvery: { type: 'duration', default: '1h' } }

start({
  primary: async ({ onShutdown }) => {
    const scheduler = new Scheduler({ logger, timezone: config.timezone }).start();
    scheduler.add({ name: 'purge', every: config.jobs.purgeEvery, run: purge }); // milliseconds, from '10m' or 600000
    onShutdown(() => scheduler.stop());
  },
  worker: async () => {
    /* the app */
  },
});
```

On several machines, give the schedulers a lock in a database of [@xufa/orm](../orm), and each time of a job runs in
one of them (the first to claim it in the table; any backend):

```js
const db = new Database({ ...config.database });
const scheduler = new Scheduler({ lock: ormLock(db) }); // its table, xufa_scheduler_locks, is made by db.sync()
```

The times of a job agree between machines (`every` is aligned to the clock), and a claim is taken by one atomic
conditional update. With an `ormHistory` too, a time missed is caught up by one machine, and not again by those that
start later. While a run goes on, its claim is renewed, and no other machine starts that job; when the process
of a run dies, its claim expires after `lockTtl`. Expiry uses the clock of each machine: keep them in time (NTP), with
`lockTtl` well above their difference. A lock of your own is `{ claim({ name, slot, ttl }), renew({ name, token,
ttl }), release({ name, token }) }`; `memoryLock()` is one in the process.

## The plugin

For [@xufa/http](../http) and fastify: `app.scheduler`, started when the app is ready (`start: false` leaves that to
you), and stopped when it closes, its runs waited for (`stopTimeout`). Its options are those of a `Scheduler` (the
logger of the app by default), and `jobs`, or `scheduler`: one made before.

```js
app.register(schedulerPlugin, {
  jobs: [{ name: 'purge', every: '10m', run: () => Session.purge() }],
});
```

## License

MIT.
