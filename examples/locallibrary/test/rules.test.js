// The book of fines (catalog/rules/fines.xlsx), kept as the first version of the book fines when the app starts
// (rules: true in xufa.yaml), and in the admin (Rules) for the staff.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TestClient } from 'xufa';
import { useTestApp } from 'xufa/testing';

const app = useTestApp();

test('the fines of late loans: by the member, the days late less the grace days, at most maxFine', async () => {
  const [book] = await app.rules.list();
  assert.equal(book.name, 'fines');
  assert.equal(book.active, 1);
  const fine = (member, daysLate) => app.rules.call('fines', 'Fine', { member, daysLate });
  assert.deepEqual(await fine('student', 1), { daysLate: 0, daily: 0, amount: 0, capped: false });
  assert.deepEqual(await fine('student', 20), { daysLate: 18, daily: 0.2, amount: 3.6, capped: false });
  assert.deepEqual(await fine('reader', 60), { daysLate: 58, daily: 1, amount: 20, capped: true });
  assert.deepEqual(await (await app.rules.book('fines')).test(), []);
});

test('the books of rules in the admin, for the staff', async () => {
  const admin = await app.createUser('admin', 'an admin password', { isStaff: true, isSuperuser: true });
  // The login of the admin (its own page: the CSRF token of the page, and the header of the admin's writes).
  const client = new TestClient(app);
  const page = await client.get('/admin/login');
  const csrf = /name="csrf-token" content="([^"]*)"/.exec(page.body)[1];
  const login = await client.post(
    '/admin/login',
    { username: admin.username, password: 'an admin password' },
    { json: true, headers: { 'x-xufa-admin': '1', 'x-csrf-token': csrf } }
  );
  assert.equal(login.statusCode, 200);
  const meta = (await client.get('/admin/api/models')).json();
  assert.equal(meta.rules, true);
  const books = await client.get('/admin/api/_rules');
  assert.equal(books.statusCode, 200);
  assert.deepEqual(
    books.json().results.map((book) => [book.name, book.active]),
    [['fines', 1]]
  );
  const fines = (await client.get('/admin/api/_rules/fines')).json();
  assert.deepEqual(
    fines.tables.map((table) => [table.kind, table.name]),
    [
      ['Rules', 'DailyFine'],
      ['Constants', 'Limits'],
      ['Spreadsheet', 'Fine'],
      ['Test', 'DailyFineTests'],
      ['Test', 'FineTests'],
      ['Datatype', 'Loan'],
    ]
  );
  assert.deepEqual(fines.errors, []);
});
