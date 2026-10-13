import { expectTypeOf } from '@xufa/test';
import { Client, Pool, PoolClient, QueryResult, DatabaseError, escapeLiteral } from '../..';

async function main() {
  const client = new Client('postgres://user:password@localhost/app');
  expectTypeOf(await client.connect()).toEqualTypeOf<Client>();
  const result = await client.query<{ id: number }>('SELECT id FROM t WHERE id = $1', [1]);
  expectTypeOf(result).toEqualTypeOf<QueryResult<{ id: number }>>();
  expectTypeOf(result.rows[0].id).toEqualTypeOf<number>();
  expectTypeOf(result.rowCount).toEqualTypeOf<number | null>();
  expectTypeOf(await client.query({ text: 'SELECT 1', rowMode: 'array' })).toEqualTypeOf<QueryResult<any>>();
  expectTypeOf(await client.query({ text: 'SELECT 1', signal: new AbortController().signal, timeout: 100 })).toEqualTypeOf<QueryResult<any>>();
  client.on('notification', (message) => expectTypeOf(message.payload).toEqualTypeOf<string>());

  const pool = new Pool({ connectionString: 'postgres://localhost/app', max: 5, binary: false });
  const own: PoolClient = await pool.connect();
  own.release();
  expectTypeOf(await pool.copyRows('t', ['a', 'b'], [[1, 'x'], { a: 2, b: 'y' }])).toEqualTypeOf<number>();
  for await (const chunk of pool.copyTo('COPY t TO STDOUT')) expectTypeOf(chunk).toEqualTypeOf<Buffer>();
  expectTypeOf(await pool.copyFrom('COPY t FROM STDIN', ['1\tx\n'])).toEqualTypeOf<QueryResult<never>>();
  expectTypeOf(pool.totalCount).toEqualTypeOf<number>();
  // @ts-expect-error
  pool.query(1);
  try {
    await pool.query('SELECT');
  } catch (err) {
    if (err instanceof DatabaseError) expectTypeOf(err.code).toEqualTypeOf<string | undefined>();
  }
  await pool.end();
}

void main;

// Credentials by functions, timeouts, escaping.
const iam = new Client({
  host: '/var/run/postgresql',
  user: () => 'app',
  password: async () => 'token',
  connectionTimeoutMillis: 5000,
  statement_timeout: 1000,
});
expectTypeOf(iam.escapeIdentifier('t')).toEqualTypeOf<string>();
expectTypeOf(escapeLiteral("it's")).toEqualTypeOf<string>();
// @ts-expect-error
new Client({ password: 42 });

// Explicit resource management.
async function dispose(pool: Pool) {
  const client = await pool.connect();
  expectTypeOf(client[Symbol.dispose]()).toEqualTypeOf<void>();
  expectTypeOf(pool[Symbol.asyncDispose]()).toEqualTypeOf<Promise<void>>();
}
void dispose;

// Hosts, authentication, describing.
async function features() {
  const ha = new Pool({
    host: ['db1', 'db2'],
    port: [5432, 5433],
    target_session_attrs: 'read-write',
    load_balance_hosts: 'random',
    require_auth: 'scram-sha-256',
    channel_binding: 'require',
    oauthBearerToken: async () => 'token',
  });
  const described = await ha.query({ text: 'SELECT $1::int', describe: true });
  expectTypeOf(described.params).toEqualTypeOf<number[]>();
  expectTypeOf(described.fields[0].name).toEqualTypeOf<string>();
  // @ts-expect-error
  new Client({ target_session_attrs: 'leader' });
  // @ts-expect-error
  new Client({ channel_binding: 'always' });
}
void features;

const limited = new Pool({ max: 2, acquireTimeoutMillis: 500 });
expectTypeOf(limited.openConnection({ host: 'db' })).toEqualTypeOf<Promise<unknown>>();
