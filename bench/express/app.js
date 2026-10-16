// The app of the benchmark, built the same way on Express and on @xufa/express: a route for each scenario of
// ../express.js, behind what apps put before their routes, and a large app (40 routers of 10 routes mounted on /api).
const path = require('node:path');

const BOOKS = Array.from({ length: 200 }, (_, i) => ({
  id: i,
  title: `Book ${i}`,
  author: { name: `Author ${i % 17}`, born: 1900 + (i % 90) },
  tags: ['fiction', `tag${i % 7}`],
  available: i % 3 !== 0,
}));

function build(express) {
  const app = express();
  app.set('env', 'production');

  // Ten middlewares that do little, before the routes of /mw only.
  const stack = express.Router();
  for (let i = 0; i < 10; i += 1) {
    stack.use((req, res, next) => {
      req[`m${i}`] = i;
      next();
    });
  }
  stack.get('/end', (req, res) => res.send('ok'));
  app.use('/mw', stack);

  app.get('/hello', (req, res) => res.send('Hello World'));
  app.get('/json', (req, res) => res.json({ hello: 'world' }));
  app.get('/users/:userId/books/:bookId', (req, res) => res.json(req.params));
  app.get('/search', (req, res) => res.json(req.query));
  app.post('/echo', express.json(), (req, res) => res.json(req.body));
  app.get('/books', (req, res) => res.json(BOOKS));
  app.get('/fail', () => {
    throw new Error('failed');
  });

  // A router inside a router, with params in its mount path.
  const shelves = express.Router({ mergeParams: true });
  shelves.get('/:shelf', (req, res) => res.json({ library: req.params.library, shelf: req.params.shelf }));
  const libraries = express.Router();
  libraries.use('/:library/shelves', shelves);
  app.use('/libraries', libraries);

  // The large app: 40 routers of 10 routes each, all mounted on /api.
  for (let r = 0; r < 40; r += 1) {
    const router = express.Router();
    router.get(`/r${r}/items`, (req, res) => res.json({ router: r }));
    router.get(`/r${r}/items/:id`, (req, res) => res.json({ router: r, id: req.params.id }));
    router.post(`/r${r}/items`, (req, res) => res.status(201).json({ router: r }));
    router.patch(`/r${r}/items/:id`, (req, res) => res.json({ router: r }));
    router.delete(`/r${r}/items/:id`, (req, res) => res.status(204).end());
    router.get(`/r${r}/items/:id/children`, (req, res) => res.json([]));
    router.get(`/r${r}/items/:id/children/:child`, (req, res) => res.json({}));
    router.get(`/r${r}/stats`, (req, res) => res.json({}));
    router.get(`/r${r}/export`, (req, res) => res.send('csv'));
    router.put(`/r${r}/settings`, (req, res) => res.json({}));
    app.use('/api', router);
  }

  app.use('/static', express.static(path.join(__dirname, 'public')));
  // eslint-disable-next-line no-unused-vars -- Express tells error handlers by their four arguments
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return app;
}

module.exports = { build };
