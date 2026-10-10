// Parameters of routes as Django's path converters: <int:pk> (a number), <slug:...>, <uuid:...>, <str:...> or
// <name>, <path:...> (the rest); a value not of its kind is a 404; the hooks of the route see the values converted,
// and the names of routes give their addresses back.
import xufa from '../../index.js';

describe('path converters', () => {
  it('int, slug, uuid, str and path: their values, and 404 for others', async () => {
    const app = xufa();
    app.get('/books/<int:pk>/', { name: 'book' }, async (request) => ({ pk: request.params.pk }));
    app.get('/tags/<slug:slug>', async (request) => request.params);
    app.get('/copies/<uuid:id>', async (request) => request.params);
    app.get('/authors/<name>/books/<str:title>', async (request) => request.params);
    app.get('/files/<path:file>', async (request) => ({ file: request.params.file }));
    const json = async (url) => {
      const res = await app.inject(url);
      return res.statusCode === 200 ? res.json() : res.statusCode;
    };
    expect(await json('/books/42/')).toEqual({ pk: 42 });
    expect(await json('/books/x42/')).toBe(404);
    expect(await json('/tags/new-books_2')).toEqual({ slug: 'new-books_2' });
    expect(await json('/tags/a.b')).toBe(404);
    expect(await json('/copies/0f1e2d3c-4b5a-4968-8776-655443322110')).toEqual({ id: '0f1e2d3c-4b5a-4968-8776-655443322110' });
    expect(await json('/copies/nope')).toBe(404);
    expect(await json('/authors/ursula/books/earthsea')).toEqual({ name: 'ursula', title: 'earthsea' });
    expect((await json('/files/a/b/c.txt')).file).toBe('a/b/c.txt');
    expect(app.reverse('book', [7])).toBe('/books/7/');
    expect(() => app.reverse('book', ['x'])).toThrow();
  });

  it('the hooks of the route see the values converted; mistakes of patterns', async () => {
    const app = xufa();
    const seen = [];
    app.get('/n/<int:n>', { preHandler: async (request) => seen.push(typeof request.params.n) }, async () => 'ok');
    expect((await app.inject('/n/3')).body).toBe('ok');
    expect(seen).toEqual(['number']);
    const other = xufa();
    expect(() => other.get('/x/<float:x>', async () => 'x')).toThrow('no converter float');
    expect(() => other.get('/x/<path:rest>/more', async () => 'x')).toThrow('is the last part of a route');
  });
});
