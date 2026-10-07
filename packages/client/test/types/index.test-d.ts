import { expectType, expectError } from 'tsd';
import { createClient, retry, HTTPError, RetryError, Client } from '../..';

const api = createClient({
  baseUrl: 'https://api.example.com/v1',
  timeout: 5000,
  retry: { attempts: 5, statuses: [503] },
});
expectType<Client>(api);
expectType<Promise<{ id: number }[]>>(api.get<{ id: number }[]>('/books', { query: { page: 2, tags: ['a'] } }));
expectType<Promise<any>>(api.post('/books', { json: { title: 'Dune' }, retry: false }));
expectType<Client>(api.extend({ headers: { authorization: 'Bearer t' } }));
expectType<Client>(api.for({ id: 'req-1', signal: new AbortController().signal }));
expectError(createClient({ responseType: 'xml' }));
expectError(createClient({ retry: 'yes' }));
expectError(createClient({ transport: 'undici' }));
createClient({ transport: 'http' }).close();
createClient({ proxy: 'http://user:pass@proxy:3128', tls: { ca: 'PEM', rejectUnauthorized: true } });
createClient({ proxy: 'env' });
createClient({ proxy: false });
expectError(createClient({ proxy: 3128 }));

expectType<Promise<string>>(retry(async () => 'done', { until: (value) => value === 'done', attempts: 3 }));

const err = new HTTPError<{ message: string }>();
expectType<number>(err.status);
expectType<{ message: string }>(err.body);
expectType<number>(new RetryError().attempts);

// Faults.
const flaky = createClient({ baseUrl: 'https://api.example.com' });
flaky.faults.fail({ operations: 'write', paths: [/^\/orders/], times: 2 });
flaky.faults.respond({ status: 503, headers: { 'retry-after': '1' }, json: { error: 'busy' } });
flaky.faults.hang({ urls: 'https://api.example.com/slow' }).release();
expectError(flaky.faults.fail({ operations: 'connect' }));
