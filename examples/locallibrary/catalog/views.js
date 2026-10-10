// The pages of the catalog with logic of their own (catalog/views.py); urls.yaml puts them at their addresses, with
// the pages crud gives each model.
import { Count } from 'xufa/orm';
import { DetailView, ListView, getObjectOr404 } from 'xufa/views';
import { reverse } from 'xufa/project';
import { Author, Book, BookInstance } from './models.js';
import { addDays } from 'xufa/forms';
import { RenewBookForm } from './forms.js';

// The home page: counts, and the visits of this browser (in its session). The counts are kept (cached(): until a
// write to their model, or 10 s), not counted again for every visit.
async function index(request, reply) {
  const numVisits = (request.session.get('numVisits') || 0) + 1;
  request.session.set('numVisits', numVisits);
  const [numBooks, numInstances, numInstancesAvailable, numAuthors] = await Promise.all([
    Book.objects.cached().count(),
    BookInstance.objects.cached().count(),
    BookInstance.objects.filter({ status: 'a' }).cached().count(),
    Author.objects.cached().count(),
  ]);
  return reply.view('index', { numBooks, numInstances, numInstancesAvailable, numAuthors, numVisits });
}

// An author with their books, and how many copies each has.
class AuthorDetail extends DetailView {
  async getContextData(context) {
    const books = await this.object.bookSet.annotate({ copies: Count('bookInstanceSet') });
    return super.getContextData({ ...context, books });
  }
}

// The copies the user borrowed (LoginRequiredMixin).
class LoanedBooksByUser extends ListView {
  static model = BookInstance;
  static templateName = 'catalog/bookinstance_list_borrowed';
  static loginRequired = true;

  getQueryset() {
    return BookInstance.objects
      .selectRelated('book')
      .filter({ borrower: this.request.account.pk, status: 'o' })
      .orderBy('dueBack');
  }
}

// Every copy on loan, for librarians (PermissionRequiredMixin).
class LoanedBooksAll extends ListView {
  static model = BookInstance;
  static templateName = 'catalog/bookinstance_list_borrowed';
  static permissionRequired = 'BookInstance.markReturned';
  static extraContext = { all: true };

  getQueryset() {
    return BookInstance.objects.selectRelated('book', 'borrower').filter({ status: 'o' }).orderBy('dueBack');
  }
}

// A librarian renews a copy: a date between today and 4 weeks, 3 weeks at first (renew_book_librarian).
async function renewBookLibrarian(request, reply) {
  const bookInstance = await getObjectOr404(BookInstance.objects.selectRelated('book', 'borrower'), {
    pk: request.params.pk,
  });
  const form = new RenewBookForm({
    data: request.method === 'POST' ? request.body : null,
    initial: { renewalDate: addDays(21) },
  });
  if (await form.isValid()) {
    bookInstance.dueBack = form.cleanedData.renewalDate;
    await bookInstance.save({ fields: ['dueBack'] });
    return reply.redirect(reverse('all-borrowed'));
  }
  return reply.view('catalog/book_renew_librarian', { bookInstance, form });
}

export { index, AuthorDetail, LoanedBooksByUser, LoanedBooksAll, renewBookLibrarian };
