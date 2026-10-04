import { expectType, expectError } from 'tsd';
import { Client, Pool, PoolClient, QueryResult, DatabaseError, escapeLiteral } from '../..';

async function main() {
  const client = new Client('postgres://user:password@localhost/app');
  expectType<Client>(await client.connect());
  const result = await client.query<{ id: number }>('SELECT id FROM t WHERE id = $1', [1]);
  expectType<QueryResult<{ id: number }>>(result);
  expectType<number>(result.rows[0].id);
  expectType<number | null>(result.rowCount);
  expectType<QueryResult<any>>(await client.query({ text: 'SELECT 1', rowMode: 'array' }));
  expectType<QueryResult<any>>(
    await client.query({ text: 'SELECT 1', signal: new AbortController().signal, timeout: 100 })
  );
  client.on('notification', (message) => expectType<string>(message.payload));

  const pool = new Pool({ connectionString: 'postgres://localhost/app', max: 5, binary: false });
  const own: PoolClient = await pool.connect();
  own.release();
  expectType<number>(await pool.copyRows('t', ['a', 'b'], [[1, 'x'], { a: 2, b: 'y' }]));
  for await (const chunk of pool.copyTo('COPY t TO STDOUT')) expectType<Buffer>(chunk);
  expectType<QueryResult<never>>(await pool.copyFrom('COPY t FROM STDIN', ['1\tx\n']));
  expectType<number>(pool.totalCount);
  expectError(pool.query(1));
  try {
    await pool.query('SELECT');
  } catch (err) {
    if (err instanceof DatabaseError) expectType<string | undefined>(err.code);
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
expectType<string>(iam.escapeIdentifier('t'));
expectType<string>(escapeLiteral("it's"));
expectError(new Client({ password: 42 }));

// Explicit resource management.
async function dispose(pool: Pool) {
  const client = await pool.connect();
  expectType<void>(client[Symbol.dispose]());
  expectType<Promise<void>>(pool[Symbol.asyncDispose]());
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
  expectType<number[]>(described.params);
  expectType<string>(described.fields[0].name);
  expectError(new Client({ target_session_attrs: 'leader' }));
  expectError(new Client({ channel_binding: 'always' }));
}
void features;
