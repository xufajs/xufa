import { expectTypeOf } from '@xufa/test';
import { createClient, retry, HTTPError, RetryError, Client } from '../..';

const api = createClient({
  baseUrl: 'https://api.example.com/v1',
  timeout: 5000,
  retry: { attempts: 5, statuses: [503] },
});
expectTypeOf(api).toEqualTypeOf<Client>();
expectTypeOf(api.get<{ id: number }[]>('/books', { query: { page: 2, tags: ['a'] } })).toEqualTypeOf<Promise<{ id: number }[]>>();
expectTypeOf(api.post('/books', { json: { title: 'Dune' }, retry: false })).toEqualTypeOf<Promise<any>>();
expectTypeOf(api.extend({ headers: { authorization: 'Bearer t' } })).toEqualTypeOf<Client>();
expectTypeOf(api.for({ id: 'req-1', signal: new AbortController().signal })).toEqualTypeOf<Client>();
// @ts-expect-error
createClient({ responseType: 'xml' });
// @ts-expect-error
createClient({ retry: 'yes' });
// @ts-expect-error
createClient({ transport: 'undici' });
createClient({ transport: 'http' }).close();
createClient({ proxy: 'http://user:pass@proxy:3128', tls: { ca: 'PEM', rejectUnauthorized: true } });
createClient({ proxy: 'env' });
createClient({ proxy: false });
// @ts-expect-error
createClient({ proxy: 3128 });

expectTypeOf(retry(async () => 'done', { until: (value) => value === 'done', attempts: 3 })).toEqualTypeOf<Promise<string>>();

const err = new HTTPError<{ message: string }>();
expectTypeOf(err.status).toEqualTypeOf<number>();
expectTypeOf(err.body).toEqualTypeOf<{ message: string }>();
expectTypeOf(new RetryError().attempts).toEqualTypeOf<number>();

// Faults.
const flaky = createClient({ baseUrl: 'https://api.example.com' });
flaky.faults.fail({ operations: 'write', paths: [/^\/orders/], times: 2 });
flaky.faults.respond({ status: 503, headers: { 'retry-after': '1' }, json: { error: 'busy' } });
flaky.faults.hang({ urls: 'https://api.example.com/slow' }).release();
// @ts-expect-error
flaky.faults.fail({ operations: 'connect' });
