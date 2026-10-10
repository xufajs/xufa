// The blocks of the pipelines of the catalog (pipelines.yaml): the work of each step, run by the queue of the project.
import { Book, BookInstance } from './models.js';

// New copies of a book, in maintenance until a librarian approves them: { book, count, imprint } gives their ids.
export async function addCopies({ book, count = 1, imprint = '' }) {
  const found = await Book.objects.get({ pk: book });
  const copies = [];
  for (let i = 0; i < count; i += 1) {
    copies.push(await BookInstance.objects.create({ book: found, imprint: imprint || 'Unknown', status: 'd' }));
  }
  return { title: found.title, copies: copies.map((copy) => copy.pk) };
}

// The copies of the step "copies", available to borrow.
export async function makeAvailable(input, { outputs }) {
  const { copies, title } = outputs.copies;
  const available = await BookInstance.objects.filter({ pk__in: copies, status: 'd' }).update({ status: 'a' });
  return { title, available };
}
