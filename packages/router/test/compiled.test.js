// The compiled walk (lib/compile.js) against the walk of match(): the same routes, the same results.
import createRouter from '../index.js';

const { Router } = createRouter;

function show(result) {
  if (result === null) return null;
  return {
    status: result.status,
    handler: result.handler && result.handler.id,
    store: result.store,
    params: result.params && { ...result.params },
    querystring: result.querystring,
  };
}

// Two routers with the same routes: the first walks its trees, the second compiles them at once.
function pair(opts, routes) {
  const make = () => {
    const router = createRouter(opts);
    routes.forEach(([method, path, constraints], i) => {
      const handler = () => {};
      handler.id = i;
      try {
        router.on(method, path, constraints ? { constraints } : {}, handler, { i });
      } catch (err) {
        // a duplicated or an invalid route: the same in both
      }
    });
    return router;
  };
  const interpreted = make();
  const compiled = make();
  return (method, path, constraints) => {
    const previous = Router.COMPILE_AFTER;
    try {
      Router.COMPILE_AFTER = Infinity;
      const expected = show(interpreted.match(method, path, constraints));
      Router.COMPILE_AFTER = 0;
      const actual = show(compiled.match(method, path, constraints));
      return { expected, actual };
    } finally {
      Router.COMPILE_AFTER = previous;
    }
  };
}

const ROUTES = [
  ['GET', '/'],
  ['GET', '/health'],
  ['GET', '/users'],
  ['GET', '/users/:id'],
  ['GET', '/users/:id/posts/:postId'],
  ['GET', '/users/me'],
  ['GET', '/users/search/recent'],
  ['GET', '/files/*'],
  ['GET', '/files/public/:name'],
  ['GET', '/img/:name.:ext'],
  ['GET', '/range/:from-:to'],
  ['GET', '/num/:id(^\\d+$)'],
  ['GET', '/num/:slug'],
  ['GET', '/at/:lat(^\\d+)-:lng(^\\d+)'],
  ['GET', '/v/:x', { version: '1.0.0' }],
  ['GET', '/v/:x', { version: '2.0.0' }],
  ['GET', '/v/:x'],
  ['GET', '/colon/a::b/:c'],
  ['GET', '/abc:id'],
  ['POST', '/users'],
  ['POST', '/users/:id'],
];

const PATHS = [
  '/',
  '/health',
  '/healt',
  '/healthy',
  '/users',
  '/users/',
  '/users/42',
  '/users/me',
  '/users/me/posts/7',
  '/users/42/posts/7',
  '/users/42/posts/',
  '/users/42/posts',
  '/users/search/recent',
  '/users/search/old',
  '/users/search',
  '/files',
  '/files/',
  '/files/a/b/c.txt',
  '/files/public/x.txt',
  '/files/public/x/y',
  '/img/logo.png',
  '/img/logo',
  '/range/1-9',
  '/range/19',
  '/num/123',
  '/num/12a',
  '/at/40-3',
  '/at/x-3',
  '/v/1',
  '/colon/a:b/c',
  '/abc42',
  '/users/caf%C3%A9',
  '/users/a%2Fb',
  '/users/%zz',
  '/users/42?x=1&y=2',
  '/users/42#frag',
  '/nothing',
  '/USERS/42',
  'http://example.com/users/42?q=1',
];

describe('the compiled walk', () => {
  for (const opts of [
    {},
    { caseSensitive: false },
    { ignoreTrailingSlash: true },
    { ignoreDuplicateSlashes: true },
    { maxParamLength: 2, onMaxParamLength: () => {} },
  ]) {
    test(`finds what match() finds: ${JSON.stringify(opts)}`, () => {
      const check = pair(opts, ROUTES);
      for (const method of ['GET', 'POST', 'PUT']) {
        for (const path of PATHS) {
          for (const constraints of [undefined, { version: '1.0.0' }, { version: '3.0.0' }]) {
            const { expected, actual } = check(method, path, constraints);
            expect({ method, path, constraints, result: actual }).toEqual({
              method,
              path,
              constraints,
              result: expected,
            });
          }
        }
      }
    });
  }

  test('with a wildcard route at the root', () => {
    const check = pair({}, [
      ['GET', '*'],
      ['GET', '/a/:b'],
      ['GET', '/a/b/c'],
    ]);
    for (const path of ['/', '/a', '/a/x', '/a/b/c', '/a/b/d', '/z/y']) {
      const { expected, actual } = check('GET', path);
      expect(actual).toEqual(expected);
    }
  });

  test('on random routes and paths', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const pick = (list) => list[Math.floor(random() * list.length)];
    const words = ['a', 'ab', 'abc', 'users', 'user', 'u', 'x.y', 'café', 'A', 'b-c'];
    const segment = () => {
      const r = random();
      if (r < 0.45) return pick(words);
      if (r < 0.65) return `:${pick(['id', 'name'])}`;
      if (r < 0.72) return ':n(^\\d+$)';
      if (r < 0.78) return ':f.:ext';
      if (r < 0.82) return ':f-:g';
      if (r < 0.86) return `${pick(words)}:id`;
      return pick(words);
    };
    const routePath = () => {
      const parts = [];
      for (let i = 0, n = 1 + Math.floor(random() * 4); i < n; i += 1) parts.push(segment());
      return `/${parts.join('/')}${random() < 0.15 ? '/*' : ''}`;
    };
    const values = ['a', 'ab', 'users', 'u', '42', 'x.y', 'f.png', 'f-g', 'caf%C3%A9', '', 'A', 'a%2Fb', 'b-c'];
    for (let run = 0; run < 60; run += 1) {
      const opts = {
        caseSensitive: random() < 0.8,
        maxParamLength: random() < 0.2 ? 3 : 100,
        onMaxParamLength: () => {},
      };
      const routes = [];
      for (let i = 0, n = 1 + Math.floor(random() * 20); i < n; i += 1) {
        routes.push(['GET', routePath(), random() < 0.1 ? { version: pick(['1.0.0', '2.0.0']) } : undefined]);
      }
      const check = pair(opts, routes);
      for (let k = 0; k < 40; k += 1) {
        const path = routePath()
          .replace(/:[a-z]+(\([^)]*\))?/g, () => pick(values))
          .replace('*', pick(values));
        const constraints = random() < 0.15 ? { version: pick(['1.0.0', '3.0.0']) } : undefined;
        const { expected, actual } = check('GET', path, constraints);
        expect({ path, actual }).toEqual({ path, actual: expected });
      }
    }
  });

  test('is compiled after COMPILE_AFTER walks, and again after a change of the routes', () => {
    const previous = Router.COMPILE_AFTER;
    Router.COMPILE_AFTER = 16;
    try {
      const router = createRouter();
      router.on('GET', '/a/:id', () => {});
      for (let i = 0; i < 16; i += 1) router.match('GET', '/a/1');
      expect(router.tierGET.walk).toBe(null);
      router.match('GET', '/a/1');
      expect(typeof router.tierGET.walk).toBe('function');
      router.on('GET', '/b/:id', () => {});
      expect(router.tierGET).toBe(null);
      for (let i = 0; i <= 16; i += 1) router.match('GET', '/b/1');
      expect(router.match('GET', '/b/2').params).toEqual({ id: '2' });
      expect(typeof router.tierGET.walk).toBe('function');
    } finally {
      Router.COMPILE_AFTER = previous;
    }
  });

  test('large trees are split into functions, and find what match() finds', () => {
    const routes = [];
    const resources = ['users', 'posts', 'comments', 'likes', 'tags', 'orders', 'carts', 'teams', 'projects', 'tasks'];
    for (const resource of resources) {
      for (const method of ['GET', 'PUT', 'DELETE']) routes.push([method, `/api/${resource}/:id`]);
      routes.push(['GET', `/api/${resource}`]);
      routes.push(['GET', `/api/${resource}/:id/comments/:commentId`]);
      routes.push(['GET', `/api/${resource}/search/recent`]);
      routes.push(['GET', `/static/${resource}/*`]);
      for (let i = 0; i < 20; i += 1) routes.push(['GET', `/v${i}/${resource}/:x(^\\d+$)/list`]);
    }
    const check = pair({ maxParamLength: 6, onMaxParamLength: () => {} }, routes);
    const paths = ['/api/tasks/7/comments/9', '/api/tasks/search/recent', '/static/teams/a/b', '/v19/carts/42/list'];
    paths.push('/v3/carts/x/list', '/api/nothing', '/api/users/1234567/comments/1', '/v7/tags/1234567/list');
    for (const path of paths) {
      for (const method of ['GET', 'PUT']) {
        const { expected, actual } = check(method, path);
        expect({ method, path, actual }).toEqual({ method, path, actual: expected });
      }
    }
    const router = createRouter();
    routes.forEach(([method, path]) => router.on(method, path, () => {}));
    for (let i = 0; i <= Router.COMPILE_AFTER + 1; i += 1) router.match('GET', '/api/tasks/7');
    const source = router.tierGET.walk.toString();
    expect(source).toMatch(/= f\d+\(/); // subtrees in functions of their own
    expect(source.length).toBeLessThan(30000);
  });

  test('trees too large to compile are walked by match()', () => {
    const router = createRouter();
    for (let i = 0; i < 10001; i += 1) router.on('GET', `/r${i}/:id`, () => {});
    for (let i = 0; i <= Router.COMPILE_AFTER + 1; i += 1) router.match('GET', '/r5/x');
    expect(router.tierGET.walk).toBe(null);
    expect(router.match('GET', '/r10000/7').params).toEqual({ id: '7' });
  });
});
