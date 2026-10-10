// Tests of xufa (not ported from fastify): routes by name, and reverse() (Django's path(name=) and reverse()).
import xufa from '../../index.js';

async function makeApp() {
  const app = xufa();
  app.get('/', { name: 'home' }, async () => 'home');
  app.register(
    async (books) => {
      books.get('/:id(^\\d+$)', { name: 'book' }, async (request) => request.params);
      books.route({ method: ['GET', 'POST'], url: '/:id/edit', name: 'book-edit', handler: async () => 'edit' });
      books.get('/page/:page?', { name: 'books' }, async () => 'list');
    },
    { prefix: '/catalog/books' }
  );
  app.get('/files/*', { name: 'file' }, async (request) => request.params['*']);
  app.get('/from/:a-:b', { name: 'range' }, async (request) => request.params);
  app.get('/at/::hour', { name: 'hour' }, async () => 'hour');
  await app.ready();
  return app;
}

describe('route names', () => {
  it('reverse(): parameters by name or in order, the prefix of the plugin, a query', async () => {
    const app = await makeApp();
    expect(app.reverse('home')).toBe('/');
    expect(app.reverse('book', { id: 7 })).toBe('/catalog/books/7');
    expect(app.reverse('book', [8], { query: { page: 2, tags: ['a', 'b'], none: null } })).toBe(
      '/catalog/books/8?page=2&tags=a&tags=b'
    );
    expect(app.reverse('book-edit', { id: 'a b/c' })).toBe('/catalog/books/a%20b%2Fc/edit');
    expect(app.reverse('books')).toBe('/catalog/books/page');
    expect(app.reverse('books', { page: 3 })).toBe('/catalog/books/page/3');
    expect(app.reverse('file', { '*': 'css/site 1.css' })).toBe('/files/css/site%201.css');
    expect(app.reverse('range', ['x', 'y'])).toBe('/from/x-y');
    expect(app.reverse('hour')).toBe('/at/:hour');
    // The address goes back to the route.
    expect((await app.inject(app.reverse('book', { id: 42 }))).json()).toEqual({ id: '42' });
    expect((await app.inject(app.reverse('file', { '*': 'css/site.css' }))).body).toBe('css/site.css');
  });

  it('errors: an unknown name, a parameter missing or not of its pattern, too many; two routes of one name', async () => {
    const app = await makeApp();
    expect(() => app.reverse('nope')).toThrow('No route named nope');
    expect(() => app.reverse('book')).toThrow('The route book (/catalog/books/:id(^\\d+$)) needs id');
    expect(() => app.reverse('book', { id: 'x' })).toThrow('id of the route book is not ^\\d+$: x');
    expect(() => app.reverse('book', [1, 2])).toThrow('takes 1 parameters');
    try {
      app.reverse('nope');
    } catch (err) {
      expect(err.code).toBe('XUFA_ERR_ROUTE_NAME');
    }
    const twice = xufa();
    twice.get('/a', { name: 'same' }, async () => 'a');
    expect(() => twice.get('/b', { name: 'same' }, async () => 'b')).toThrow('Two routes named same: /a and /b');
    // The same address by other methods (and its HEAD route) is one name.
    twice.post('/a', { name: 'same' }, async () => 'a');
    expect(() => twice.get('/c', { name: '' }, async () => 'c')).toThrow('The name of a route is a text');
  });

  it('routeNames(): the routes by name, with their methods', async () => {
    const app = await makeApp();
    expect(app.routeNames()['book-edit']).toEqual({ url: '/catalog/books/:id/edit', methods: ['GET', 'POST', 'HEAD'] });
    expect(Object.keys(app.routeNames()).sort()).toEqual(['book', 'book-edit', 'books', 'file', 'home', 'hour', 'range']);
  });
});
