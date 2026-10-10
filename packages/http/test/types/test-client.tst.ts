import { expect } from 'tstyche';
import xufa, { TestClient, TestResponse, textOf } from '../..';

const app = xufa();
const client = new TestClient(app, { enforceCsrfChecks: false });
expect(client.get('/books', { page: 2 }, { follow: true })).type.toBe<Promise<TestResponse>>();
expect(client.post('/notes', { title: 'x' }, { json: true })).type.toBe<Promise<TestResponse>>();
expect(client.login({ username: 'ada', password: 'x' })).type.toBe<Promise<boolean>>();
expect(textOf('<p>x</p>')).type.toBe<string>();
client.get('/books').then((res) => {
  expect(res.templates).type.toBe<string[]>();
  expect(res.textContent).type.toBe<string>();
});
expect(new TestClient).type.toRaiseError();
