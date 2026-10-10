// The jobs of the catalog (catalog/jobs.js), run by the queue of the project (queue: in xufa.yaml).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useTestApp } from 'xufa/testing';
import { addDays } from 'xufa/forms';
import { Author, Book, BookInstance } from '../catalog/models.js';
import { User } from '../accounts/models.js';

const app = useTestApp();

test('the report of overdue loans: the copies on loan past their due date, and who has them', async () => {
  const author = await Author.objects.create({ firstName: 'Ursula', lastName: 'Le Guin' });
  const book = await Book.objects.create({
    title: 'The Dispossessed',
    author,
    summary: 'Anarres',
    isbn: '9780060512750',
  });
  const reader = await User.createUser({ username: 'reader', password: 'a long password' });
  await BookInstance.objects.create({ book, imprint: 'Harper', status: 'o', borrower: reader, dueBack: addDays(-3) });
  await BookInstance.objects.create({ book, imprint: 'Harper', status: 'o', borrower: reader, dueBack: addDays(7) });
  await BookInstance.objects.create({ book, imprint: 'Harper', status: 'a' });

  const job = await app.queue.enqueue('overdueReport');
  await app.queue.runDue();
  const done = await app.queue.jobs.filter({ pk: job.pk }).first();
  assert.equal(done.status, 'done');
  assert.deepEqual(
    done.result.map(({ title, borrower, dueBack }) => ({ title, borrower, dueBack })),
    [{ title: 'The Dispossessed', borrower: 'reader', dueBack: addDays(-3) }]
  );
});

test('the pipeline of new copies: in maintenance until a librarian approves them, then available', async () => {
  const author = await Author.objects.create({ firstName: 'Mary', lastName: 'Beard' });
  const book = await Book.objects.create({ title: 'SPQR', author, summary: 'Rome', isbn: '9781846683800' });
  const run = await app.pipelines.start('new-copies', { book: book.pk, count: 2, imprint: 'Profile' });
  for (let i = 0; i < 3; i += 1) await app.queue.runDue();
  const waiting = await app.pipelines.get(run.pk);
  assert.equal(waiting.steps.approval.status, 'paused');
  assert.deepEqual(await BookInstance.objects.filter({ book }).valuesList('status', { flat: true }), ['d', 'd']);

  await app.pipelines.resume(run.pk, 'approval', { by: 'librarian' });
  for (let i = 0; i < 3; i += 1) await app.queue.runDue();
  const done = await app.pipelines.get(run.pk);
  assert.deepEqual([done.run.status, done.run.result], ['done', { title: 'SPQR', available: 2 }]);
  assert.deepEqual(await BookInstance.objects.filter({ book }).valuesList('status', { flat: true }), ['a', 'a']);
});
