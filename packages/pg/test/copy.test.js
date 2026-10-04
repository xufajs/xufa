const { Client, Pool, DatabaseError, copy } = require('..');
const { url, available } = require('./server');

describe('copy encoding', () => {
  it('escapes values in the text format', () => {
    expect(copy.textValue(null)).toBe('\\N');
    expect(copy.textValue('a\tb\nc\\d\re')).toBe('a\\tb\\nc\\\\d\\re');
    expect(copy.textValue(Buffer.from([1, 255]))).toBe('\\\\x01ff');
    expect(copy.textValue(['a', 'b c'])).toBe('{"a","b c"}');
  });

  it('quotes identifiers', () => {
    expect(copy.quoteIdentifier('public.my"table')).toBe('"public"."my""table"');
  });
});

describe.skipIf(!available)('COPY', () => {
  let client;
  let pool;

  beforeAll(async () => {
    client = new Client(url);
    await client.connect();
    pool = new Pool({ connectionString: url, max: 2 });
    await client.query('DROP TABLE IF EXISTS pg_copy');
    await client.query(`CREATE TABLE pg_copy (
      id SERIAL PRIMARY KEY, n INTEGER, big BIGINT, small SMALLINT, f REAL, d DOUBLE PRECISION, ok BOOLEAN,
      name TEXT, code VARCHAR(10), at TIMESTAMPTZ, local TIMESTAMP, day DATE, data JSONB, plain JSON, tags TEXT[],
      matrix INT[], bytes BYTEA, uid UUID)`);
    await client.query('DROP TABLE IF EXISTS pg_copy_text');
    await client.query('CREATE TABLE pg_copy_text (n INTEGER, amount NUMERIC(10, 2), name TEXT)');
  });

  afterAll(async () => {
    if (client) {
      await client.query('DROP TABLE IF EXISTS pg_copy');
      await client.query('DROP TABLE IF EXISTS pg_copy_text');
      await client.end();
    }
    if (pool) await pool.end();
  });

  beforeEach(async () => {
    await client.query('TRUNCATE pg_copy, pg_copy_text RESTART IDENTITY');
  });

  const columns = [
    'n',
    'big',
    'small',
    'f',
    'd',
    'ok',
    'name',
    'code',
    'at',
    'local',
    'day',
    'data',
    'plain',
    'tags',
    'matrix',
    'bytes',
    'uid',
  ];

  it('copies rows in binary, with every type, and reads them back', async () => {
    const at = new Date('2024-05-06T07:08:09.123Z');
    const rows = [
      [
        1,
        2n ** 62n,
        -5,
        1.5,
        NaN,
        true,
        'héllo\ttab',
        'x',
        at,
        at,
        new Date(2024, 1, 29),
        { a: [1] },
        [1, 2],
        ['a', null, 'b "c"'],
        [
          [1, 2],
          [3, 4],
        ],
        Buffer.from([0, 255]),
        '6f1c7d3a-0000-4000-8000-000000000001',
      ],
      [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
      {
        n: '7',
        big: '9007199254740993',
        small: 3,
        f: '2.5',
        d: Infinity,
        ok: 'f',
        name: '',
        code: 'y',
        at: 'infinity',
        local: '2024-01-02T03:04:05Z',
        day: '2024-03-01',
        data: '{"j": true}',
        plain: { k: 'v' },
        tags: [],
        matrix: [],
        bytes: Buffer.alloc(0),
        uid: '6F1C7D3A000040008000000000000002',
      },
    ];
    expect(await client.copyRows('pg_copy', columns, rows)).toBe(3);
    const { rows: found } = await client.query('SELECT * FROM pg_copy ORDER BY id');
    expect(found[0]).toMatchObject({
      n: 1,
      big: 2n ** 62n,
      small: -5,
      f: 1.5,
      ok: true,
      name: 'héllo\ttab',
      code: 'x',
      data: { a: [1] },
      plain: [1, 2],
      tags: ['a', null, 'b "c"'],
      matrix: [
        [1, 2],
        [3, 4],
      ],
      uid: '6f1c7d3a-0000-4000-8000-000000000001',
    });
    expect(found[0].d).toBeNaN();
    expect(found[0].at.getTime()).toBe(at.getTime());
    expect(found[0].day.getTime()).toBe(new Date(2024, 1, 29).getTime());
    expect([...found[0].bytes]).toEqual([0, 255]);
    expect(Object.values(found[1]).filter((value) => value !== null)).toEqual([2]);
    expect(found[2]).toMatchObject({
      n: 7,
      big: 9007199254740993n,
      f: 2.5,
      d: Infinity,
      ok: false,
      name: '',
      at: Infinity,
      data: { j: true },
      plain: { k: 'v' },
      tags: [],
      matrix: [],
      uid: '6f1c7d3a-0000-4000-8000-000000000002',
    });
    expect(found[2].day.getTime()).toBe(new Date(2024, 2, 1).getTime());
  });

  it('copies many rows in chunks, on pool connections of their own', async () => {
    const rows = Array.from({ length: 30000 }, (_, i) => ({
      n: i,
      name: `row ${i}`,
      data: { i },
      tags: ['t', String(i)],
    }));
    expect(await pool.copyRows('pg_copy', ['n', 'name', 'data', 'tags'], rows)).toBe(30000);
    const { rows: found } = await pool.query('SELECT count(*)::int AS c, sum(n)::bigint AS s FROM pg_copy');
    expect(found[0]).toEqual({ c: 30000, s: (29999 * 30000) / 2 });
  });

  it('copies in the text format when a column has no binary encoder', async () => {
    const rows = [
      [1, '12.50', 'a\\b\nc'],
      [2, null, null],
    ];
    expect(await client.copyRows('pg_copy_text', ['n', 'amount', 'name'], rows)).toBe(2);
    const { rows: found } = await client.query('SELECT * FROM pg_copy_text ORDER BY n');
    expect(found).toEqual([
      { n: 1, amount: '12.50', name: 'a\\b\nc' },
      { n: 2, amount: null, name: null },
    ]);
  });

  it('fails the COPY on values of other types, and goes on', async () => {
    await expect(client.copyRows('pg_copy', ['n'], [[1], ['many']])).rejects.toThrow(
      'Cannot copy "many" to the integer column n'
    );
    expect((await client.query('SELECT count(*)::int AS c FROM pg_copy')).rows[0].c).toBe(0);
    await expect(client.copyRows('pg_copy', ['n'], [[1, 2]])).rejects.toThrow('A row has 2 values for 1 columns');
    await expect(client.copyRows('no_such_table', ['n'], [[1]])).rejects.toBeInstanceOf(DatabaseError);
    expect((await client.query('SELECT 1 AS ok')).rows).toEqual([{ ok: 1 }]);
  });

  it('copies raw data in and out, and keeps queries in order around it', async () => {
    const before = client.query('SELECT 1 AS before');
    const copied = client.copyFrom(
      'COPY pg_copy_text (n, name) FROM STDIN',
      (async function* data() {
        yield '1\tone\n';
        yield Buffer.from('2\ttwo\n');
      })()
    );
    const after = client.query('SELECT count(*)::int AS c FROM pg_copy_text');
    expect((await before).rows).toEqual([{ before: 1 }]);
    expect((await copied).rowCount).toBe(2);
    expect((await after).rows).toEqual([{ c: 2 }]);
    const chunks = [];
    for await (const chunk of client.copyTo('COPY (SELECT n, name FROM pg_copy_text ORDER BY n) TO STDOUT'))
      chunks.push(chunk);
    expect(Buffer.concat(chunks).toString()).toBe('1\tone\n2\ttwo\n');
  });

  it('reads large COPY TO, and stops early', async () => {
    await pool.copyRows(
      'pg_copy',
      ['n'],
      Array.from({ length: 100000 }, (_, i) => [i])
    );
    let bytes = 0;
    for await (const chunk of pool.copyTo('COPY pg_copy (n, name) TO STDOUT')) bytes += chunk.length;
    expect(bytes).toBeGreaterThan(100000 * 3);
    let seen = 0;
    for await (const chunk of client.copyTo('COPY pg_copy (n) TO STDOUT')) {
      seen += chunk.length;
      break;
    }
    expect(seen).toBeGreaterThan(0);
    expect((await client.query('SELECT 2 AS ok')).rows).toEqual([{ ok: 2 }]);
  });

  it('refuses COPY FROM STDIN given to query()', async () => {
    await expect(client.query('COPY pg_copy_text (n) FROM STDIN')).rejects.toBeInstanceOf(DatabaseError);
    expect((await client.query('SELECT 3 AS ok')).rows).toEqual([{ ok: 3 }]);
  });
});
