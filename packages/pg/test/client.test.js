const { Client, Pool, DatabaseError } = require('..');
const { url, available } = require('./server');

describe.skipIf(!available)('Client', () => {
  let client;

  beforeAll(async () => {
    client = new Client(url);
    await client.connect();
    await client.query('DROP TABLE IF EXISTS pg_test');
    await client.query(`CREATE TABLE pg_test (
      id SERIAL PRIMARY KEY, name TEXT, n INTEGER, big BIGINT, score DOUBLE PRECISION, ok BOOLEAN,
      at TIMESTAMPTZ, day DATE, data JSONB, tags TEXT[], bytes BYTEA, amount NUMERIC(10, 2), uid UUID)`);
  });

  afterAll(async () => {
    if (client) {
      await client.query('DROP TABLE IF EXISTS pg_test');
      await client.end();
    }
  });

  beforeEach(async () => {
    await client.query('TRUNCATE pg_test RESTART IDENTITY');
  });

  it('runs queries with and without parameters', async () => {
    const simple = await client.query('SELECT 1 AS one, $$a$$::text AS a');
    expect(simple.rows).toEqual([{ one: 1, a: 'a' }]);
    expect(simple.command).toBe('SELECT');
    expect(simple.rowCount).toBe(1);
    expect(simple.fields.map((field) => field.name)).toEqual(['one', 'a']);
    const withParams = await client.query('SELECT $1::int + $2::int AS sum, $3::text AS text', [40, 2, 'héllo']);
    expect(withParams.rows).toEqual([{ sum: 42, text: 'héllo' }]);
    const asArrays = await client.query({
      text: 'SELECT $1::int AS a, $2::text AS b',
      values: [1, 'x'],
      rowMode: 'array',
    });
    expect(asArrays.rows).toEqual([[1, 'x']]);
  });

  it('round-trips the types', async () => {
    const at = new Date('2024-05-06T07:08:09.123Z');
    const row = {
      name: 'Ada',
      n: -5,
      big: 2n ** 62n,
      score: 1.25,
      ok: true,
      at,
      day: '2024-02-29',
      data: { a: [1, 'b'], c: null },
      tags: ['x', 'y "z"', null],
      bytes: Buffer.from([0, 1, 255]),
      amount: '12.50',
      uid: '6f1c7d3a-0000-4000-8000-000000000001',
    };
    const insert = await client.query(
      `INSERT INTO pg_test (name, n, big, score, ok, at, day, data, tags, bytes, amount, uid)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      Object.values(row)
    );
    expect(insert.command).toBe('INSERT');
    expect(insert.rowCount).toBe(1);
    const { rows } = await client.query('SELECT * FROM pg_test WHERE id = $1', [insert.rows[0].id]);
    const [found] = rows;
    expect(found.id).toBe(1);
    expect(found.name).toBe('Ada');
    expect(found.n).toBe(-5);
    expect(found.big).toBe(2n ** 62n);
    expect(found.score).toBe(1.25);
    expect(found.ok).toBe(true);
    expect(found.at.getTime()).toBe(at.getTime());
    expect(found.day.getTime()).toBe(new Date(2024, 1, 29).getTime());
    expect(found.data).toEqual(row.data);
    expect(found.tags).toEqual(['x', 'y "z"', null]);
    expect([...found.bytes]).toEqual([0, 1, 255]);
    expect(found.amount).toBe('12.50');
    expect(found.uid).toBe(row.uid);
    const nulls = await client.query('SELECT $1::text AS a, NULL::int AS b', [null]);
    expect(nulls.rows).toEqual([{ a: null, b: null }]);
  });

  it('gives the same values in text (first run) and in binary (prepared runs)', async () => {
    const sql = `SELECT $1::int AS i, $2::bigint AS big, $3::bigint AS huge, $4::float8 AS f, $5::float8 AS nan,
      $6::bool AS b, $7::timestamptz AS at, $8::smallint AS small, $9::oid AS o, $10::real AS r,
      'infinity'::timestamptz AS inf, '-infinity'::timestamptz AS ninf, '0044-03-15 12:00:00+00 BC'::timestamptz AS bc,
      '2024-02-29'::date AS d, 'infinity'::date AS dinf, '2024-01-02 03:04:05.678'::timestamp AS local,
      '1969-07-20 20:17:40.5'::timestamp AS before1970, '6f1c7d3a-0000-4000-8000-0000000000ff'::uuid AS u,
      '\\x00ff10'::bytea AS bytes, NULL::int AS nothing, 12.5::numeric AS num, '{1,2}'::int[] AS arr`;
    const at = new Date('2024-05-06T07:08:09.123Z');
    const values = [-7, 2 ** 40, 2n ** 62n, 1.5, NaN, true, at, -5, 4000000000, 0.5];
    const runs = [];
    for (let i = 0; i < 3; i += 1) runs.push((await client.query(sql, values)).rows[0]);
    const [first] = runs;
    expect(first.i).toBe(-7);
    expect(first.big).toBe(2 ** 40);
    expect(first.huge).toBe(2n ** 62n);
    expect(first.nan).toBeNaN();
    expect(first.at.getTime()).toBe(at.getTime());
    expect(first.inf).toBe(Infinity);
    expect(first.ninf).toBe(-Infinity);
    expect(first.bc.getUTCFullYear()).toBe(-43);
    expect(first.dinf).toBe(Infinity);
    expect(first.local.getTime()).toBe(new Date(2024, 0, 2, 3, 4, 5, 678).getTime());
    expect(first.u).toBe('6f1c7d3a-0000-4000-8000-0000000000ff');
    expect([...first.bytes]).toEqual([0, 255, 16]);
    expect(first.num).toBe('12.5');
    expect(first.arr).toEqual([1, 2]);
    // Prepared runs read the columns in binary: the same values.
    runs.slice(1).forEach((run) => {
      Object.keys(first).forEach((key) => {
        if (first[key] instanceof Date) expect(run[key].getTime()).toBe(first[key].getTime());
        else if (Buffer.isBuffer(first[key])) expect(run[key].equals(first[key])).toBe(true);
        else expect(run[key]).toEqual(first[key]);
      });
    });
  });

  it('rejects queries with null characters', async () => {
    await expect(client.query('SELECT 1 AS \u0000x', [])).rejects.toThrow('null character');
    await expect(client.query('SELECT 1 AS \u0000x')).rejects.toThrow('null character');
    expect((await client.query('SELECT $1::int AS ok', [1])).rows).toEqual([{ ok: 1 }]);
  });

  it('sends parameters of other types as text, in prepared runs too', async () => {
    const sql = 'SELECT $1::int AS i, $2::bigint AS b, $3::float8 AS f, $4::bool AS t, $5::timestamptz AS at';
    for (let i = 0; i < 3; i += 1) {
      const { rows } = await client.query(sql, ['42', '9007199254740993', '1.25', 'yes', '2024-01-02T00:00:00Z']);
      expect(rows[0]).toEqual({ i: 42, b: 9007199254740993n, f: 1.25, t: true, at: new Date('2024-01-02T00:00:00Z') });
    }
    // Values out of the range of their type fail as in text.
    for (let i = 0; i < 2; i += 1) {
      const error = await client.query('SELECT $1::int AS i', [3000000000]).catch((err) => err);
      expect(error.code).toBe('22003');
    }
    const fraction = await client.query('SELECT $1::int AS i', [1.5]).catch((err) => err);
    expect(fraction.code).toBe('22P02');
  });

  it('gives the results of several statements', async () => {
    const results = await client.query('SELECT 1 AS a; SELECT 2 AS b; UPDATE pg_test SET n = 1');
    expect(results).toHaveLength(3);
    expect(results[0].rows).toEqual([{ a: 1 }]);
    expect(results[1].rows).toEqual([{ b: 2 }]);
    expect(results[2].command).toBe('UPDATE');
  });

  it('prepares a text the second time it runs', async () => {
    const once = 'SELECT $1::int AS n, 1 AS once';
    expect((await client.query(once, [1])).rows).toEqual([{ n: 1, once: 1 }]);
    expect(client.connection.statements.has(once)).toBe(false);
    expect((await client.query(once, [2])).rows).toEqual([{ n: 2, once: 1 }]);
    expect(client.connection.statements.has(once)).toBe(true);
    const plain = 'SELECT 2 AS plain';
    expect((await client.query(plain)).rows).toEqual([{ plain: 2 }]);
    expect(client.connection.statements.has(plain)).toBe(false);
    expect((await client.query(plain)).rows).toEqual([{ plain: 2 }]);
    expect(client.connection.statements.has(plain)).toBe(true);
  });

  it('runs texts of several statements sent at the same time, and prepares those of one', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => client.query('SELECT 1 AS a; SELECT 2 AS b')));
    results.forEach((result) => expect(result.map((item) => item.rows)).toEqual([[{ a: 1 }], [{ b: 2 }]]));
    for (let i = 0; i < 3; i += 1) {
      expect((await client.query('SELECT 1.5::float8 AS f, now() AS t')).rows[0].f).toBe(1.5);
    }
    expect(client.connection.statements.has('SELECT 1.5::float8 AS f, now() AS t')).toBe(true);
  });

  it('throws the errors of the server and goes on', async () => {
    const error = await client.query('SELECT * FROM not_a_table').catch((err) => err);
    expect(error).toBeInstanceOf(DatabaseError);
    expect(error.code).toBe('42P01');
    expect(error.severity).toBe('ERROR');
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS pg_test_name ON pg_test (name)');
    await client.query('INSERT INTO pg_test (name) VALUES ($1)', ['dup']);
    const unique = await client.query('INSERT INTO pg_test (name) VALUES ($1)', ['dup']).catch((err) => err);
    expect(unique.code).toBe('23505');
    expect(unique.constraint).toBe('pg_test_name');
    await client.query('DROP INDEX pg_test_name');
    const prepared = await client.query('SELECT $1::int / 0 AS x', [1]).catch((err) => err);
    expect(prepared.code).toBe('22012');
    expect((await client.query('SELECT $1::int AS ok', [1])).rows).toEqual([{ ok: 1 }]);
  });

  it('pipelines queries on one connection, in order', async () => {
    const results = await Promise.all(
      Array.from({ length: 200 }, (_, i) =>
        i % 7 === 3
          ? client.query('SELECT $1::int / 0', [i]).catch((err) => err.code)
          : client.query('SELECT $1::int AS i, repeat($2, $1::int) AS s', [i, 'x']).then((r) => r.rows[0])
      )
    );
    results.forEach((result, i) => {
      if (i % 7 === 3) expect(result).toBe('22012');
      else expect(result).toEqual({ i, s: 'x'.repeat(i) });
    });
  });

  it('prepares statements again when their tables change', async () => {
    await client.query('INSERT INTO pg_test (name) VALUES ($1)', ['a']);
    const query = 'SELECT * FROM pg_test WHERE name = $1';
    // Prepared the second time it runs.
    for (let i = 0; i < 2; i += 1) expect(Object.keys((await client.query(query, ['a'])).rows[0])).toContain('name');
    expect(client.connection.statements.has(query)).toBe(true);
    await client.query('ALTER TABLE pg_test ADD COLUMN extra INT DEFAULT 7');
    const { rows } = await client.query(query, ['a']);
    expect(rows[0].extra).toBe(7);
    await client.query('ALTER TABLE pg_test DROP COLUMN extra');
  });

  it('prepares statements again when their types are made again', async () => {
    const setup = async () => {
      await client.query('DROP TABLE IF EXISTS pg_enum_test');
      await client.query('DROP TYPE IF EXISTS pg_test_mood');
      await client.query("CREATE TYPE pg_test_mood AS ENUM ('happy', 'sad')");
      await client.query('CREATE TABLE pg_enum_test (mood pg_test_mood)');
      await client.query("INSERT INTO pg_enum_test VALUES ('happy')");
    };
    const query = 'SELECT mood FROM pg_enum_test WHERE mood = $1';
    await setup();
    for (let i = 0; i < 2; i += 1) expect((await client.query(query, ['happy'])).rows).toEqual([{ mood: 'happy' }]);
    await setup();
    expect((await client.query(query, ['happy'])).rows).toEqual([{ mood: 'happy' }]);
    await client.query('DROP TABLE pg_enum_test');
    await client.query('DROP TYPE pg_test_mood');
  });

  it('prepares statements again when their tables are made again with other types', async () => {
    const make = async (type) => {
      await client.query('DROP TABLE IF EXISTS pg_retype_test');
      await client.query(`CREATE TABLE pg_retype_test (id ${type})`);
    };
    const insert = 'INSERT INTO pg_retype_test (id) VALUES ($1) RETURNING id';
    await make('INT');
    for (let i = 1; i <= 2; i += 1) expect((await client.query(insert, [i])).rows).toEqual([{ id: i }]);
    await make('TEXT');
    expect((await client.query(insert, ['surya'])).rows).toEqual([{ id: 'surya' }]);
    // A value that is not of the type still fails.
    await make('INT');
    await expect(client.query(insert, ['surya'])).rejects.toMatchObject({ code: '22P02' });
    await client.query('DROP TABLE pg_retype_test');
  });

  it('forgets its statements after changes of the schema, also in transactions', async () => {
    const setup = async () => {
      await client.query('DROP TABLE IF EXISTS pg_forget_test');
      await client.query('DROP TYPE IF EXISTS pg_forget_mood');
      await client.query("CREATE TYPE pg_forget_mood AS ENUM ('happy', 'sad')");
      await client.query('CREATE TABLE pg_forget_test (mood pg_forget_mood)');
    };
    const insert = 'INSERT INTO pg_forget_test (mood) VALUES ($1) RETURNING mood';
    await setup();
    for (let i = 0; i < 2; i += 1) await client.query(insert, ['happy']);
    await setup();
    client.forgetStatements();
    await client.query('BEGIN');
    expect((await client.query(insert, ['sad'])).rows).toEqual([{ mood: 'sad' }]);
    await client.query('COMMIT');
    expect(client.connection.statements.has(insert)).toBe(true);
    await client.query('DROP TABLE pg_forget_test');
    await client.query('DROP TYPE pg_forget_mood');
  });

  it('reads large results', async () => {
    await client.query('INSERT INTO pg_test (name, n) SELECT $1 || g, g FROM generate_series(1, 20000) g', ['row']);
    const { rows, rowCount } = await client.query('SELECT id, name, n FROM pg_test ORDER BY id');
    expect(rowCount).toBe(20000);
    expect(rows[19999]).toEqual({ id: 20000, name: 'row20000', n: 20000 });
  });

  it('sends and reads values of megabytes, cut between many chunks', async () => {
    // Not ASCII: the bytes of the text are not its length, and a character can be cut between chunks.
    const text = 'añ€😀'.repeat(300000);
    const bytes = Buffer.alloc(3 * 1024 * 1024 + 7);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 31) % 256;
    // Three runs: the first in text, the others prepared (binary results).
    for (let run = 0; run < 3; run += 1) {
      const { rows } = await client.query('SELECT $1::text AS t, $2::bytea AS b, length($1::text) AS n', [text, bytes]);
      expect(rows[0].t === text).toBe(true);
      expect(rows[0].b.equals(bytes)).toBe(true);
      expect(rows[0].n).toBe(text.length - text.split('😀').length + 1);
    }
    // Large messages between small ones, on one connection (pipelined): each is read whole and in order.
    const results = await Promise.all([
      client.query("SELECT repeat('a', 2000000) AS v"),
      client.query('SELECT 1 AS v'),
      client.query("SELECT repeat('b', 70000) AS v"),
      client.query('SELECT 2 AS v'),
    ]);
    expect(results.map(({ rows }) => (typeof rows[0].v === 'string' ? rows[0].v.length : rows[0].v))).toEqual([
      2000000, 1, 70000, 2,
    ]);
  });

  it('receives notifications', async () => {
    const received = new Promise((resolve) => client.once('notification', resolve));
    await client.query('LISTEN xufa_channel');
    await client.query("NOTIFY xufa_channel, 'hello'");
    expect(await received).toMatchObject({ channel: 'xufa_channel', payload: 'hello' });
    await client.query('UNLISTEN xufa_channel');
  });
});

describe.skipIf(!available)('Pool', () => {
  let pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: url, max: 3 });
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('runs queries on at most max connections', async () => {
    const results = await Promise.all(Array.from({ length: 100 }, (_, i) => pool.query('SELECT $1::int AS i', [i])));
    expect(results.map((result) => result.rows[0].i)).toEqual(Array.from({ length: 100 }, (_, i) => i));
    expect(pool.totalCount).toBeLessThanOrEqual(3);
  });

  it('gives connections of their own for transactions', async () => {
    await pool.query('CREATE TABLE IF NOT EXISTS pg_pool_test (n INT)');
    await pool.query('TRUNCATE pg_pool_test');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO pg_pool_test VALUES ($1)', [1]);
      // Other queries do not see it (nor run in it) until the commit.
      expect((await pool.query('SELECT count(*)::int AS n FROM pg_pool_test')).rows[0].n).toBe(0);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    expect((await pool.query('SELECT count(*)::int AS n FROM pg_pool_test')).rows[0].n).toBe(1);
    const other = await pool.connect();
    await other.query('BEGIN');
    // Released inside a transaction: the connection is closed, not reused.
    other.release();
    expect((await pool.query('SELECT 1 AS ok')).rows).toEqual([{ ok: 1 }]);
    await pool.query('DROP TABLE pg_pool_test');
  });

  it('waits for a connection when every one is taken', async () => {
    const clients = await Promise.all([pool.connect(), pool.connect(), pool.connect()]);
    let done = false;
    const waiting = pool.query('SELECT 1 AS ok').then((result) => {
      done = true;
      return result;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(done).toBe(false);
    clients.forEach((client) => client.release());
    expect((await waiting).rows).toEqual([{ ok: 1 }]);
  });

  it('waits for a connection at most acquireTimeoutMillis, and gives back what comes late', async () => {
    const limited = new Pool({ connectionString: url, max: 1, acquireTimeoutMillis: 5000 });
    try {
      // The first connection opened (logging in can take longer than the limit tested), then the short limit.
      const client = await limited.connect();
      limited.acquireTimeoutMillis = 50;
      await expect(limited.connect()).rejects.toMatchObject({ code: 'ACQUIRE_TIMEOUT' });
      await expect(limited.query('SELECT 1')).rejects.toMatchObject({ code: 'ACQUIRE_TIMEOUT' });
      client.release();
      // The connect() that timed out took the connection when it was free, and gave it back.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(limited.idleCount).toBe(1);
      expect((await limited.query('SELECT 1 AS ok')).rows).toEqual([{ ok: 1 }]);
    } finally {
      await limited.end();
    }
  });

  it('opens its connections with openConnection, which can be replaced', async () => {
    const opened = [];
    const custom = new Pool({ connectionString: url, max: 1, acquireTimeoutMillis: 5000 });
    const open = custom.openConnection.bind(custom);
    custom.openConnection = (options) => {
      opened.push(options.host);
      return open(options);
    };
    try {
      expect((await custom.query('SELECT 1 AS ok')).rows).toEqual([{ ok: 1 }]);
      expect(opened).toHaveLength(1);
      // An opening that never ends: queries wait for it until the timeout.
      const stuck = new Pool({ connectionString: url, max: 1, acquireTimeoutMillis: 30 });
      stuck.openConnection = () => new Promise(() => {});
      await expect(stuck.query('SELECT 1')).rejects.toMatchObject({ code: 'ACQUIRE_TIMEOUT' });
    } finally {
      await custom.end();
    }
  });
});

describe.skipIf(!available)('ending', () => {
  it('lets the queries sent end before a pool ends, and waits for the clients given', async () => {
    const pool = new Pool({ connectionString: url, max: 2 });
    await pool.query('SELECT 1');
    const running = pool.query('SELECT pg_sleep(0.1), 1 AS done');
    const client = await pool.connect();
    let ended = false;
    const ending = pool.end().then(() => {
      ended = true;
    });
    await expect(pool.query('SELECT 1')).rejects.toThrow('The pool has ended');
    expect((await running).rows[0].done).toBe(1);
    // The client given by connect() still works until it is released.
    expect((await client.query('SELECT 2 AS n')).rows[0].n).toBe(2);
    expect(ended).toBe(false);
    client.release();
    await ending;
    expect(pool.totalCount).toBe(0);
  });

  it('lets the queries sent end before a client ends, and refuses new ones', async () => {
    const client = new Client(url);
    await client.connect();
    const running = client.query('SELECT pg_sleep(0.05), 3 AS n');
    const ending = client.end();
    await expect(client.query('SELECT 1')).rejects.toThrow('ending');
    expect((await running).rows[0].n).toBe(3);
    await ending;
  });
});

describe.skipIf(!available)('describing statements', () => {
  it('gives the types of the parameters and the columns of a text without running it', async () => {
    const client = new Client(url);
    await client.connect();
    const described = await client.query({ text: 'SELECT $1::int + 1 AS n, $2::text AS t, now() AS at', describe: true });
    expect(described.params).toEqual([23, 25]);
    expect(described.fields.map((field) => [field.name, field.dataTypeID])).toEqual([
      ['n', 23],
      ['t', 25],
      ['at', 1184],
    ]);
    // Not run: the table is not made.
    expect(await client.query({ text: 'CREATE TABLE pg_never_made (a int)', describe: true })).toEqual({ fields: [], params: [] });
    expect((await client.query("SELECT to_regclass('pg_never_made') AS t")).rows[0].t).toBe(null);
    await expect(client.query({ text: 'SELEC 1', describe: true })).rejects.toMatchObject({ code: '42601' });
    expect((await client.query('SELECT 1 AS ok')).rows).toEqual([{ ok: 1 }]);
    await client.end();
  });
});

describe.skipIf(!available)('tracing', () => {
  const dc = require('node:diagnostics_channel');

  it('publishes queries, connections and the pool on the channels of pg', async () => {
    const events = [];
    const handlers = (name) => ({
      start: (context) => events.push([name, 'start', context]),
      asyncEnd: (context) => events.push([name, 'asyncEnd', context]),
      error: (context) => events.push([name, 'error', context]),
      end: () => {},
      asyncStart: () => {},
    });
    const subscriptions = ['pg:query', 'pg:connection', 'pg:pool:connect'].map((name) => {
      const channel = dc.tracingChannel(name);
      const subscriber = handlers(name);
      channel.subscribe(subscriber);
      return () => channel.unsubscribe(subscriber);
    });
    const released = [];
    const onRelease = (message) => released.push(message);
    dc.channel('pg:pool:release').subscribe(onRelease);
    try {
      const pool = new Pool({ connectionString: url, max: 1 });
      const client = await pool.connect();
      await client.query('SELECT $1::int AS n', [1]);
      await expect(client.query('SELECT nope')).rejects.toThrow();
      client.release();
      await pool.end();
      const names = events.map(([name, kind]) => `${name} ${kind}`);
      expect(names).toEqual([
        'pg:pool:connect start',
        'pg:connection start',
        'pg:connection asyncEnd',
        'pg:pool:connect asyncEnd',
        'pg:query start',
        'pg:query asyncEnd',
        'pg:query start',
        'pg:query error',
        'pg:query asyncEnd',
      ]);
      const query = events.find(([name, kind]) => name === 'pg:query' && kind === 'asyncEnd')[2];
      expect(query.query.text).toBe('SELECT $1::int AS n');
      expect(query.result).toMatchObject({ rowCount: 1, command: 'SELECT' });
      expect(query.client).toMatchObject({ database: 'xufa_test', user: 'xufa', port: 5432, ssl: false });
      expect(typeof query.client.processID).toBe('number');
      expect(events[3][2].client).toMatchObject({ reused: false });
      expect(released).toHaveLength(1);
    } finally {
      subscriptions.forEach((unsubscribe) => unsubscribe());
      dc.channel('pg:pool:release').unsubscribe(onRelease);
    }
  });
});

describe.skipIf(!available)('resources', () => {
  it('releases a client and ends pools and clients by Symbol.dispose', async () => {
    const pool = new Pool({ connectionString: url, max: 1 });
    {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client[Symbol.dispose]();
      expect(client.released).toBe(true);
    }
    // Released: the only connection is free again.
    expect((await pool.query('SELECT 1 AS n')).rows[0].n).toBe(1);
    await pool[Symbol.asyncDispose]();
    await expect(pool.query('SELECT 1')).rejects.toThrow('The pool has ended');
    const client = new Client(url);
    await client.connect();
    await client[Symbol.asyncDispose]();
    await expect(client.query('SELECT 1')).rejects.toThrow();
  });

  it('does not keep a statement whose values could not be written', async () => {
    const client = new Client(url);
    await client.connect();
    const text = 'SELECT $1::text AS v';
    await client.query(text, ['once']);
    const bad = {
      toPostgres() {
        throw new Error('cannot write it');
      },
    };
    await expect(client.query(text, [bad])).rejects.toThrow('cannot write it');
    expect(client.connection.statements.has(text)).toBe(false);
    // The next runs prepare it again, without a failed first try.
    const runs = await Promise.all([client.query(text, ['a']), client.query(text, ['b'])]);
    expect(runs.map((result) => result.rows[0].v)).toEqual(['a', 'b']);
    expect(client.connection.statements.has(text)).toBe(true);
    await client.end();
  });
});

describe.skipIf(!available)('settings', () => {
  it('sends the timeouts of the session given in the config', async () => {
    const client = new Client({ connectionString: url, statement_timeout: 1234, lock_timeout: '2s', idle_in_transaction_session_timeout: 5000 });
    await client.connect();
    const show = async (name) => (await client.query(`SHOW ${name}`)).rows[0][name];
    expect(await show('statement_timeout')).toBe('1234ms');
    expect(await show('lock_timeout')).toBe('2ms');
    expect(await show('idle_in_transaction_session_timeout')).toBe('5s');
    await expect(client.query('SELECT pg_sleep(2)')).rejects.toMatchObject({ code: '57014' });
    await client.end();
  });

  it('fails only the query whose value a type parser could not read', async () => {
    const client = new Client({
      connectionString: url,
      types: {
        25: (value) => {
          if (value === 'bad') throw new Error('not this one');
          return value.toUpperCase();
        },
      },
    });
    await client.connect();
    const [bad, other] = await Promise.allSettled([
      client.query("SELECT 'ok'::text AS t UNION ALL SELECT 'bad'::text"),
      client.query("SELECT 'fine'::text AS t"),
    ]);
    expect(bad.status).toBe('rejected');
    expect(bad.reason.message).toBe('Cannot parse the value of t (type 25): not this one');
    expect(other.value.rows).toEqual([{ t: 'FINE' }]);
    expect((await client.query("SELECT 'again'::text AS t")).rows).toEqual([{ t: 'AGAIN' }]);
    await client.end();
  });
});

describe.skipIf(!available)('cancelling queries', () => {
  let pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: url, max: 2 });
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('aborts a query with a signal, and cancels it in the server', async () => {
    const controller = new AbortController();
    const start = Date.now();
    const sleeping = pool.query({ text: 'SELECT pg_sleep(5)', signal: controller.signal });
    setTimeout(() => controller.abort(), 100);
    await expect(sleeping).rejects.toMatchObject({ name: 'AbortError', code: 'ABORT_ERR' });
    expect(Date.now() - start).toBeLessThan(2000);
    // The server stopped it: the connections answer at once.
    const after = Date.now();
    await Promise.all([pool.query('SELECT 1'), pool.query('SELECT 2')]);
    expect(Date.now() - after).toBeLessThan(2000);
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM pg_stat_activity WHERE query = 'SELECT pg_sleep(5)' AND state = 'active'"
    );
    expect(rows[0].n).toBe(0);
  });

  it('times queries out', async () => {
    const start = Date.now();
    await expect(pool.query({ text: 'SELECT pg_sleep(5)', timeout: 150 })).rejects.toMatchObject({
      code: 'QUERY_TIMEOUT',
    });
    expect(Date.now() - start).toBeLessThan(2000);
    expect((await pool.query({ text: 'SELECT 1 AS ok', timeout: 1000 })).rows).toEqual([{ ok: 1 }]);
  });

  it('gives a connection to who waits for it once a query that timed out has ended', async () => {
    const single = new Pool({ connectionString: url, max: 1, acquireTimeoutMillis: 5000 });
    try {
      await expect(single.query({ text: 'SELECT pg_sleep(1)', timeout: 100 })).rejects.toMatchObject({
        code: 'QUERY_TIMEOUT',
      });
      // At once, while the cancelled query ends in the server: connect() waits for it, then takes it.
      const client = await single.connect();
      expect((await client.query('SELECT 1 AS ok')).rows).toEqual([{ ok: 1 }]);
      client.release();
    } finally {
      await single.end();
    }
  });

  it('does not send a query aborted before it is sent', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(pool.query({ text: 'SELECT 1', signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('keeps the queries around a cancelled one', async () => {
    const client = new Client(url);
    await client.connect();
    const controller = new AbortController();
    const before = client.query('SELECT 1 AS before');
    const cancelled = client.query({ text: 'SELECT pg_sleep(5)', signal: controller.signal });
    const after = client.query('SELECT 2 AS after');
    setTimeout(() => controller.abort(), 200);
    expect((await before).rows).toEqual([{ before: 1 }]);
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    expect((await after).rows).toEqual([{ after: 2 }]);
    await client.end();
  });
});
