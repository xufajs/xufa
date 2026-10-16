import http from 'node:http';
import { expectTypeOf } from '@xufa/test';
import express, { Router, json, type Request, type Response, type NextFunction } from '../..';

const app = express({ server: { connectionTimeout: 1000 } });
const router = Router({ mergeParams: true });
router.get('/items/:id', (req, res) => {
  expectTypeOf(req.params.id).toEqualTypeOf<string>();
  expectTypeOf(req.ip).toEqualTypeOf<string | undefined>();
  return res.status(200).set('X-A', '1').json({ id: req.params.id });
});
router.param('id', (req, res, next, value: string) => next());
router.post('/items', json({ limit: '1mb' }), (req: Request, res: Response) => res.status(201).send(req.body));
app.use('/api', router);
app.use(express.static('public', { maxAge: '1d' }));
app.all('/any', (req, res) => res.redirect(301, '/elsewhere'));
app
  .route('/books/:id')
  .get((req, res) => res.cookie('seen', '1', { httpOnly: true }).format({ json: () => res.json({}) }))
  .put((req, res) => res.sendStatus(204));
app.use((error: Error, req: Request, res: Response, next: NextFunction) => next(error));
app.set('trust proxy', 1);
app.register(async (instance) => {
  instance.get('/native', async () => ({ ok: true }));
});
expectTypeOf(app.listen(0, '127.0.0.1', () => {})).toEqualTypeOf<http.Server>();
http.createServer(app);
expectTypeOf(app.server().ready).toBeFunction();
// @ts-expect-error a status is a number
router.get('/x', (req, res) => res.status('200'));
