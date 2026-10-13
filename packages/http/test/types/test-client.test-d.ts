import { expectTypeOf } from '@xufa/test';
import xufa, { TestClient, TestResponse, textOf } from '../..';

const app = xufa();
const client = new TestClient(app, { enforceCsrfChecks: false });
expectTypeOf(client.get('/books', { page: 2 }, { follow: true })).toEqualTypeOf<Promise<TestResponse>>();
expectTypeOf(client.post('/notes', { title: 'x' }, { json: true })).toEqualTypeOf<Promise<TestResponse>>();
expectTypeOf(client.login({ username: 'ada', password: 'x' })).toEqualTypeOf<Promise<boolean>>();
expectTypeOf(textOf('<p>x</p>')).toEqualTypeOf<string>();
client.get('/books').then((res) => {
  expectTypeOf(res.templates).toEqualTypeOf<string[]>();
  expectTypeOf(res.textContent).toEqualTypeOf<string>();
});
// @ts-expect-error
new TestClient;
