import { expectType, expectError } from 'tsd';
import { Client, Pool, PoolClient, QueryResult, DatabaseError } from '../..';

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
