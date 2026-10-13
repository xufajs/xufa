import { expectTypeOf } from '@xufa/test';
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
expectTypeOf(RedirectView.asView({ url: '/books/', permanent: true })).toEqualTypeOf<ViewHandler>();
expectTypeOf(BookList.methods).toEqualTypeOf<string[]>();
expectTypeOf(new Http404().statusCode).toEqualTypeOf<404>();
expectTypeOf(getObjectOr404<{ title: string }>(BookList, { pk: 1 })).toEqualTypeOf<Promise<{ title: string }>>();
// @ts-expect-error
RedirectView.asView({ permanent: 'yes' });

// crud, the defaults of the app, the built-in templates.
import { crud, plugin as viewsPlugin, templates, addressOf, type Blocker } from '../..';
import type { RouteOptions } from '@xufa/http';
expectTypeOf(crud({}, { fields: ['title'], prefix: '/catalog', list: { selectRelated: 'author', paginateBy: false } })).toEqualTypeOf<RouteOptions[]>();
expectTypeOf(templates).toEqualTypeOf<string>();
expectTypeOf(addressOf({}, {})).toEqualTypeOf<string | null>();
expectTypeOf(viewsPlugin).toEqualTypeOf<(app: any, options: { baseTemplate?: string; paginateBy?: number | null }, done: (err?: Error) => void) => void>();
declare const blocker: Blocker;
expectTypeOf(blocker.href).toEqualTypeOf<string | null>();
