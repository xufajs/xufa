// The jobs of the catalog (queue: in xufa.yaml): run by the workers of the project, and shown in the admin (Jobs),
// with their results. app.queue.enqueue('overdueReport') runs one; a scheduler can enqueue it every morning.
import { today } from 'xufa/forms';
import { BookInstance } from './models.js';

// The copies on loan past their due date: who has them, and since when (the report a librarian reads).
export const overdueReport = {
  attempts: 2,
  run: async () => {
    const copies = await BookInstance.objects
      .filter({ status: 'o', dueBack__lt: today() })
      .selectRelated('book', 'borrower')
      .orderBy('dueBack');
    return copies.map((copy) => ({
      copy: copy.pk,
      title: copy.book.title,
      borrower: copy.borrower ? copy.borrower.username : null,
      dueBack: copy.dueBack,
    }));
  },
};
