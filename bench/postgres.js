// PostgreSQL drivers: @xufa/pg against pg (node-postgres), on the same server and workloads, both through a Pool of
// the same size. Every driver runs every round in a process of its own, the drivers taking turns, and the median of
// the rounds is shown.
//
// node postgres.js [--url postgres://xufa:xufa@127.0.0.1:5432/xufa_test] [--rounds 5] [--scale 1] [--only a,b]
//                  [--pool 10]
//
// It uses the table bench_pg, dropped before and after.
const { fork } = require('node:child_process');

// `bound`: what the time of a workload is spent on. 'driver': the server does little (small queries, few rows read,
// or large messages), so the drivers can be told apart. 'server': PostgreSQL does most of the work (scans of whole
// tables, many rows rewritten); both drivers wait for it, and their results only show that neither slows it down.
const WORKLOADS = {
  // One query after another: the round trip of the driver.
  'select $1 (serial)': { ops: 5000, unit: 'ops', bound: 'driver' },
  'select by id (serial)': { ops: 5000, unit: 'ops', bound: 'driver' },
  'insert one row (serial)': { ops: 3000, unit: 'ops', bound: 'driver' },
  // Many queries at the same time: the pool (and the pipelining).
  'select $1 (64 concurrent)': { ops: 20000, unit: 'ops', bound: 'driver' },
  'select by id (64 concurrent)': { ops: 20000, unit: 'ops', bound: 'driver' },
  // Values to encode and decode: many parameters of every type, and the rows of a small table read again and again.
  'encode 64 params of 8 types (serial)': { ops: 3000, unit: 'ops', bound: 'driver' },
  'decode 1000 rows of 8 types (serial)': { ops: 100000, unit: 'rows', bound: 'driver' },
  // Large messages: a value of 1 MB sent and given back.
  'text of 1 MB, sent and read (serial)': { ops: 200, unit: 'ops', bound: 'driver' },
  'bytea of 1 MB, sent and read (serial)': { ops: 200, unit: 'ops', bound: 'driver' },
  // Bulk: large messages to write and read.
  'insert 1000 rows per statement': { ops: 50000, unit: 'rows', bound: 'driver' },
  // COPY FROM STDIN: @xufa/pg copyRows (binary), pg with pg-copy-streams (rows written as COPY text by the caller).
  'copy rows (50k)': { ops: 50000, unit: 'rows', bound: 'driver' },
  'select all rows (50k)': { ops: 50000, unit: 'rows', bound: 'driver' },
  // The server's work: on a table just made and vacuumed, so what ran before does not change them.
  'aggregate group by': { ops: 200, unit: 'ops', bound: 'server' },
  'update many': { ops: 100, unit: 'ops', bound: 'server' },
};

// 64 parameters: the 8 types of the table, in turn (their row value IS NOT NULL: the server only reads them).
const PARAM_TYPES = ['int', 'text', 'text', 'boolean', 'float8', 'timestamptz', 'text[]', 'jsonb'];
const PARAMS_SQL = `SELECT (${Array.from({ length: 64 }, (_, i) => `$${i + 1}::${PARAM_TYPES[i % 8]}`).join(', ')}) IS NOT NULL AS ok`;

const COLUMNS = ['i', 'name', 'email', 'active', 'score', 'created_at', 'tags', 'address'];

function parseArgs(argv) {
  const args = { url: 'postgres://xufa:xufa@127.0.0.1:5432/xufa_test', rounds: 5, scale: 1, only: null, pool: 10 };
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i].replace(/^--/, '');
    if (!(name in args)) throw new Error(`Unknown option --${name}`);
    args[name] = name === 'url' ? argv[i + 1] : name === 'only' ? argv[i + 1].split(',') : Number(argv[i + 1]);
  }
  return args;
}

// The rows as the text format of COPY, in chunks (what a caller of pg-copy-streams writes).
function* copyText(rows) {
  const escape = (text) =>
    text.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  const value = (item) => {
    if (item === null || item === undefined) return '\\N';
    if (item instanceof Date) return item.toISOString();
    if (Array.isArray(item)) {
      return escape(`{${item.map((element) => `"${String(element).replace(/[\\"]/g, '\\$&')}"`).join(',')}}`);
    }
    return escape(String(item));
  };
  let chunk = '';
  for (const row of rows) {
    chunk += `${row.map(value).join('\t')}\n`;
    if (chunk.length > 256 * 1024) {
      yield chunk;
      chunk = '';
    }
  }
  if (chunk) yield chunk;
}

function makeRow(i) {
  return [
    i,
    `user ${i}`,
    `user${i}@example.com`,
    i % 2 === 0,
    i * 1.5,
    new Date(1700000000000 + i * 1000),
    ['a', 'b', `t${i % 10}`],
    JSON.stringify({ street: `${i} Main St`, city: 'Springfield', zip: String(10000 + (i % 1000)) }),
  ];
}

// INSERT ... VALUES ($1, ...), (...) for `count` rows.
function insertSql(count) {
  const tuples = [];
  for (let r = 0; r < count; r += 1) {
    tuples.push(`(${COLUMNS.map((_, c) => `$${r * COLUMNS.length + c + 1}`).join(', ')})`);
  }
  return `INSERT INTO bench_pg (${COLUMNS.join(', ')}) VALUES ${tuples.join(', ')}`;
}

async function worker(name, args) {
  const { Pool } = name === 'xufa' ? require('@xufa/pg') : require('pg');
  const pool = new Pool({ connectionString: args.url, max: args.pool });
  const results = {};
  const scaled = (workload) => Math.max(1, Math.round(WORKLOADS[workload].ops * args.scale));
  const run = async (workload, setup, fn) => {
    if (args.only && !args.only.some((part) => workload.includes(part))) return;
    const ops = scaled(workload);
    const context = setup ? await setup(ops) : undefined;
    const start = process.hrtime.bigint();
    await fn(ops, context);
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    results[workload] = ops / seconds;
  };
  const reset = async () => {
    await pool.query('DROP TABLE IF EXISTS bench_pg');
    await pool.query(`CREATE TABLE bench_pg (
      id SERIAL PRIMARY KEY, i INTEGER, name TEXT, email TEXT, active BOOLEAN, score DOUBLE PRECISION,
      created_at TIMESTAMPTZ, tags TEXT[], address JSONB)`);
  };
  // `vacuum`: the table vacuumed after it is filled (no dead rows nor stale statistics), for the server-bound workloads.
  const fill = async (count, vacuum = false) => {
    await reset();
    const batch = insertSql(1000);
    for (let start = 0; start < count; start += 1000) {
      const size = Math.min(1000, count - start);
      const values = [];
      for (let i = start; i < start + size; i += 1) values.push(...makeRow(i));
      await pool.query(size === 1000 ? batch : insertSql(size), values);
    }
    await pool.query(vacuum ? 'VACUUM ANALYZE bench_pg' : 'ANALYZE bench_pg');
  };
  // Warm up: the connections of the pool are opened before the first measure.
  await Promise.all(Array.from({ length: args.pool }, () => pool.query('SELECT 1')));

  await run('select $1 (serial)', null, async (ops) => {
    for (let i = 0; i < ops; i += 1) await pool.query('SELECT $1::int AS n', [i]);
  });
  await run(
    'select by id (serial)',
    () => fill(5000),
    async (ops) => {
      for (let i = 0; i < ops; i += 1) await pool.query('SELECT * FROM bench_pg WHERE id = $1', [(i % 5000) + 1]);
    }
  );
  const insertOne = insertSql(1);
  await run('insert one row (serial)', reset, async (ops) => {
    for (let i = 0; i < ops; i += 1) await pool.query(insertOne, makeRow(i));
  });
  await run('select $1 (64 concurrent)', null, async (ops) => {
    let next = 0;
    const lane = async () => {
      while (next < ops) {
        const i = next;
        next += 1;
        await pool.query('SELECT $1::int AS n', [i]);
      }
    };
    await Promise.all(Array.from({ length: 64 }, lane));
  });
  await run(
    'select by id (64 concurrent)',
    () => fill(5000),
    async (ops) => {
      let next = 0;
      const lane = async () => {
        while (next < ops) {
          const i = next;
          next += 1;
          await pool.query('SELECT * FROM bench_pg WHERE id = $1', [(i % 5000) + 1]);
        }
      };
      await Promise.all(Array.from({ length: 64 }, lane));
    }
  );
  await run(
    'encode 64 params of 8 types (serial)',
    () => Array.from({ length: 100 }, (_, i) => Array.from({ length: 8 }, () => makeRow(i)).flat()),
    async (ops, sets) => {
      for (let i = 0; i < ops; i += 1) {
        const { rows } = await pool.query(PARAMS_SQL, sets[i % sets.length]);
        if (i === 0 && rows[0].ok !== true) throw new Error('The parameters were not read');
      }
    }
  );
  await run(
    'decode 1000 rows of 8 types (serial)',
    () => fill(1000),
    async (ops) => {
      for (let read = 0; read < ops; read += 1000) {
        const { rows } = await pool.query('SELECT * FROM bench_pg');
        if (rows.length !== 1000) throw new Error(`The query gave ${rows.length} rows instead of 1000`);
      }
    }
  );
  const text = 'x'.repeat(1024 * 1024);
  await run('text of 1 MB, sent and read (serial)', null, async (ops) => {
    for (let i = 0; i < ops; i += 1) {
      const { rows } = await pool.query('SELECT $1::text AS t', [text]);
      if (rows[0].t.length !== text.length) throw new Error('The text came back changed');
    }
  });
  const bytes = Buffer.alloc(1024 * 1024, 7);
  await run('bytea of 1 MB, sent and read (serial)', null, async (ops) => {
    for (let i = 0; i < ops; i += 1) {
      const { rows } = await pool.query('SELECT $1::bytea AS b', [bytes]);
      if (!Buffer.isBuffer(rows[0].b) || rows[0].b.length !== bytes.length)
        throw new Error('The bytes came back changed');
    }
  });
  const batch = insertSql(1000);
  await run(
    'insert 1000 rows per statement',
    async (ops) => {
      await reset();
      const batches = [];
      for (let start = 0; start < ops; start += 1000) {
        const values = [];
        for (let i = start; i < start + 1000; i += 1) values.push(...makeRow(i));
        batches.push(values);
      }
      return batches;
    },
    async (ops, batches) => {
      for (let i = 0; i < batches.length; i += 1) await pool.query(batch, batches[i]);
    }
  );
  await run(
    'copy rows (50k)',
    async (ops) => {
      await reset();
      return Array.from({ length: ops }, (_, i) => makeRow(i));
    },
    async (ops, rows) => {
      if (name === 'xufa') {
        const count = await pool.copyRows('bench_pg', COLUMNS, rows);
        if (count !== ops) throw new Error(`COPY gave ${count} rows`);
        return;
      }
      const { from: copyFrom } = require('pg-copy-streams');
      const { pipeline } = require('node:stream/promises');
      const { Readable } = require('node:stream');
      const client = await pool.connect();
      try {
        const stream = client.query(copyFrom(`COPY bench_pg (${COLUMNS.join(', ')}) FROM STDIN`));
        await pipeline(Readable.from(copyText(rows)), stream);
      } finally {
        client.release();
      }
    }
  );
  await run('select all rows (50k)', fill, async (ops) => {
    const { rows } = await pool.query('SELECT * FROM bench_pg');
    if (rows.length !== ops) throw new Error(`The query gave ${rows.length} rows instead of ${ops}`);
  });
  await run(
    'aggregate group by',
    () => fill(10000, true),
    async (ops) => {
      for (let i = 0; i < ops; i += 1) {
        await pool.query("SELECT address->>'zip' AS zip, count(*), avg(score) FROM bench_pg GROUP BY 1");
      }
    }
  );
  await run(
    'update many',
    () => fill(10000, true),
    async (ops) => {
      for (let i = 0; i < ops; i += 1)
        await pool.query('UPDATE bench_pg SET score = score + 1 WHERE active = $1', [i % 2 === 0]);
    }
  );

  await pool.query('DROP TABLE IF EXISTS bench_pg');
  await pool.end();
  return results;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function runWorker(name, argv) {
  return new Promise((resolve, reject) => {
    const child = fork(__filename, ['--worker', name, ...argv], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    child.once('message', resolve);
    child.once('exit', (code) => code && reject(new Error(`${name} exited with ${code}`)));
  });
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === '--worker') {
    const results = await worker(argv[1], parseArgs(argv.slice(2)));
    // Run alone (to profile it: node --cpu-prof postgres.js --worker xufa), it prints its results.
    if (process.send) process.send(results, () => process.exit(0));
    else console.log(results);
    return;
  }
  const args = parseArgs(argv);
  const drivers = ['xufa', 'pg'];
  const rounds = { xufa: [], pg: [] };
  console.log(`PostgreSQL drivers: @xufa/pg against pg ${require('pg/package.json').version}`);
  console.log(
    `${args.url.replace(/:[^:@/]*@/, ':***@')}, ${args.rounds} rounds, scale ${args.scale}, pool ${args.pool}, Node.js ${process.version}`
  );
  for (let round = 0; round < args.rounds; round += 1) {
    // The order of the drivers alternates, so neither always runs on a warmer server.
    const order = round % 2 ? [...drivers].reverse() : drivers;
    for (const name of order) rounds[name].push(await runWorker(name, argv));
    process.stdout.write(`round ${round + 1}/${args.rounds} done\n`);
  }
  const rows = Object.keys(rounds.xufa[0]).map((workload) => {
    const xufa = rounds.xufa.map((result) => result[workload]);
    const pg = rounds.pg.map((result) => result[workload]);
    const spread = (values) => (Math.max(...values) - Math.min(...values)) / median(values);
    return {
      workload,
      unit: WORKLOADS[workload].unit,
      xufa: median(xufa),
      pg: median(pg),
      noisy: spread(xufa) > 0.1 || spread(pg) > 0.1,
    };
  });
  const format = (value) => Math.round(value).toLocaleString('en-US');
  const sections = [
    ['driver', 'Driver-bound: the work of the driver (encoding, decoding, messages, the pool) decides the result'],
    ['server', 'Server-bound: PostgreSQL does most of the work; the drivers can only show they do not slow it down'],
  ];
  sections.forEach(([bound, title]) => {
    const part = rows.filter((row) => WORKLOADS[row.workload].bound === bound);
    if (part.length === 0) return;
    console.log(`\n### ${title}\n`);
    console.log('| Workload | @xufa/pg | pg | xufa / pg |');
    console.log('| --- | ---: | ---: | ---: |');
    part.forEach((row) => {
      const ratio = `${(row.xufa / row.pg).toFixed(2)}x${row.noisy ? ' ⚠' : ''}`;
      console.log(
        `| ${row.workload} | ${format(row.xufa)} ${row.unit}/s | ${format(row.pg)} ${row.unit}/s | ${ratio} |`
      );
    });
  });
  console.log('\nMedians of the rounds.');
  if (rows.some((row) => row.noisy)) console.log('⚠: the rounds of a driver are more than 10% apart (noise).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
