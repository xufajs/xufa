# @xufa/views

Views of classes, as Django's generic views: a class says what a page is (its model, its fields, its template, its
pages) and its methods do the rest. `ListView` (in pages), `DetailView` (404 when the object is not there),
`CreateView` and `UpdateView` (a [ModelForm](../forms) of the fields, checked by the model), `DeleteView`, `FormView`,
`TemplateView` and `RedirectView`, over models of [@xufa/orm](../orm) and templates of [@xufa/template](../template),
with the login and permissions of the accounts of [@xufa/auth](../auth).

Its documentation is in [docs/views/](../../docs/views/index.html). This file is the summary.

```sh
npm install @xufa/views
```

```js
import { ListView, DetailView, CreateView, UpdateView, DeleteView } from '@xufa/views';

class BookList extends ListView {
  static model = Book;
  static templateDir = 'catalog'; // catalog/book_list: bookList, page, paginator, isPaginated
  static paginateBy = 10;
}

class BookUpdate extends UpdateView {
  static model = Book; // catalog/book_form: form, book
  static templateDir = 'catalog';
  static fields = ['title', 'author', 'summary', 'isbn', 'genre'];
  static permissionRequired = 'Book.change';
}

class BookDelete extends DeleteView {
  static model = Book; // catalog/book_confirm_delete
  static templateDir = 'catalog';
  static permissionRequired = 'Book.delete';

  getSuccessUrl() {
    return this.reverse('books');
  }
}

app.route(BookList.asRoute('/catalog/books/', { name: 'books' }));
app.route(BookUpdate.asRoute('/catalog/book/:pk/update/', { name: 'book-update' }));
app.route(BookDelete.asRoute('/catalog/book/:pk/delete/', { name: 'book-delete' }));
app.get('/about/', TemplateView.asView({ templateName: 'about' }));
```

- **Settings** are static fields (Django's class attributes); `asView(options)` changes them for one route.
- **Steps** are methods to change: `getQueryset()`, `getObject()`, `getContextData()`, `getForm()`,
  `getSuccessUrl()`, `formValid()`, `formInvalid()`...
- **Access**: `loginRequired` and `permissionRequired` (to the login with `?next=`, or 403).
- **Shortcuts**: `getObjectOr404()`, `getListOr404()`, `Http404`.
- **The pages of a model**: `crud(Book, { prefix, fields, list, detail, create, update, delete })` gives the five routes
  of the Django tutorial (`books`, `book-detail`, `book-create`, `book-update`, `book-delete`), with `Book.add`,
  `.change` and `.delete`.
- **Built-in templates**: when the app has no `<model>_list.html` (`_detail`, `_form`, `_confirm_delete`), the views
  render `xufa/list` (and `detail`, `form`, `confirm_delete`) of the folder `templates` it exports, which extend the
  app's `baseTemplate` with a `title` made of the model's `label`. `plugin` sets the app's `baseTemplate` and
  `paginateBy`.
- **Deletes**: the objects that protect one (`onDelete: 'protect'`) are `blockers` of the page; a POST they stop comes
  back to it.

## License

MIT
