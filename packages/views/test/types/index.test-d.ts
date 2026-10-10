import { expectType, expectError } from 'tsd';
import xufa from '@xufa/http';
import { ListView, CreateView, DeleteView, RedirectView, Http404, getObjectOr404, ViewHandler } from '../..';

class BookList extends ListView {
  static paginateBy = 10;
}
class BookCreate extends CreateView {
  static fields = ['title'];
  static permissionRequired = 'Book.add';
}
class BookDelete extends DeleteView {
  getSuccessUrl() {
    return this.reverse('books');
  }
}

const app = xufa();
app.route(BookList.asRoute('/books/', { name: 'books' }));
app.route(BookCreate.asRoute('/books/create/'));
app.route(BookDelete.asRoute('/books/:pk/delete/'));
expectType<ViewHandler>(RedirectView.asView({ url: '/books/', permanent: true }));
expectType<string[]>(BookList.methods);
expectType<404>(new Http404().statusCode);
expectType<Promise<{ title: string }>>(getObjectOr404<{ title: string }>(BookList, { pk: 1 }));
expectError(RedirectView.asView({ permanent: 'yes' }));

// crud, the defaults of the app, the built-in templates.
import { crud, plugin as viewsPlugin, templates, addressOf, type Blocker } from '../..';
import type { RouteOptions } from '@xufa/http';
expectType<RouteOptions[]>(crud({}, { fields: ['title'], prefix: '/catalog', list: { selectRelated: 'author', paginateBy: false } }));
expectType<string>(templates);
expectType<string | null>(addressOf({}, {}));
expectType<(app: any, options: { baseTemplate?: string; paginateBy?: number | null }, done: (err?: Error) => void) => void>(viewsPlugin);
declare const blocker: Blocker;
expectType<string | null>(blocker.href);
