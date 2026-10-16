// @xufa/test/supertest on the three kinds of apps the backends have: Express (5, and @xufa/express), fastify and
// @xufa/http. The same routes on each, the same requests (JSON, forms, multipart, queries, cookies of an agent,
// redirects, errors), the same answers.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from '@xufa/test/supertest';
import fastify from 'fastify';
import xufa from '@xufa/http';
import multer from '@xufa/http/multer';
import realExpress from 'express';
import xufaExpress from '../index.js';

const FILE = path.join(os.tmpdir(), `xufa-express-supertest-${process.pid}.png`);

// Express: its parsers, multer for multipart.
function expressApp(express) {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage() });
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.get('/items', (req, res) => res.json({ query: req.query }));
  app.post('/items', (req, res) => res.status(201).json({ body: req.body }));
  app.post('/upload', upload.single('file'), (req, res) =>
    res.json({ fields: req.body, file: { name: req.file.originalname, type: req.file.mimetype, size: req.file.size } })
  );
  app.get('/login', (req, res) => res.set('Set-Cookie', 'sid=abc; Path=/').send('in'));
  app.get('/me', (req, res) => res.json({ cookie: req.headers.cookie || null }));
  app.get('/old', (req, res) => res.redirect('/items?moved=1'));
  app.get('/fail', () => {
    throw Object.assign(new Error('nope'), { status: 418 });
  });
  return app;
}

// fastify and @xufa/http (its API): a parser of forms, multer's of multipart.
function fastifyApp(create) {
  const app = create();
  const upload = multer({ storage: multer.memoryStorage() });
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (req, text, done) =>
    done(null, Object.fromEntries(new URLSearchParams(text)))
  );
  app.addContentTypeParser('multipart/form-data', (req, payload, done) => done(null));
  app.get('/items', (req) => ({ query: { ...req.query } }));
  app.post('/items', (req, reply) => reply.code(201).send({ body: req.body }));
  app.post('/upload', (req, reply) => {
    upload.single('file')(req.raw, reply.raw, (error) => {
      if (error) return reply.send(error);
      const { file, body } = req.raw;
      return reply.send({ fields: { ...body }, file: { name: file.originalname, type: file.mimetype, size: file.size } });
    });
    return reply;
  });
  app.get('/login', (req, reply) => reply.header('Set-Cookie', 'sid=abc; Path=/').send('in'));
  app.get('/me', (req) => ({ cookie: req.headers.cookie || null }));
  app.get('/old', (req, reply) => reply.redirect('/items?moved=1'));
  app.get('/fail', () => {
    throw Object.assign(new Error('nope'), { statusCode: 418 });
  });
  return app;
}

const APPS = {
  'Express 5': () => expressApp(realExpress),
  '@xufa/express': () => expressApp(xufaExpress),
  fastify: () => fastifyApp(fastify),
  '@xufa/http': () => fastifyApp(xufa),
};

describe('@xufa/test/supertest on Express, fastify and @xufa/http', () => {
  beforeAll(() => fs.writeFileSync(FILE, Buffer.from([137, 80, 78, 71, 13, 10])));
  afterAll(() => fs.rmSync(FILE, { force: true }));

  Object.entries(APPS).forEach(([name, create]) => {
    describe(name, () => {
      let app;
      beforeAll(() => {
        app = create();
      });
      afterAll(async () => {
        // (fastify and @xufa/http: their instance closed; an app of Express is a function, its servers closed already.)
        if (typeof app !== 'function') await app.close();
      });

      it('queries and JSON', async () => {
        const res = await request(app).get('/items').query({ a: '1', b: 'x y' }).expect(200).expect('Content-Type', /json/);
        expect(res.body).toEqual({ query: { a: '1', b: 'x y' } });
        await request(app).post('/items').send({ n: 1 }).expect(201, { body: { n: 1 } });
      });

      it('forms', async () => {
        await request(app).post('/items').type('form').send({ name: 'ada' }).expect(201, { body: { name: 'ada' } });
      });

      it('multipart: fields and files', async () => {
        const res = await request(app).post('/upload').field('title', 'photo').attach('file', FILE).expect(200);
        expect(res.body).toEqual({
          fields: { title: 'photo' },
          file: { name: path.basename(FILE), type: 'image/png', size: 6 },
        });
      });

      it('cookies of an agent', async () => {
        const agent = request.agent(app);
        await agent.get('/login').expect(200, 'in');
        await agent.get('/me').expect(200, { cookie: 'sid=abc' });
      });

      it('redirects, followed when asked', async () => {
        await request(app).get('/old').expect(302).expect('Location', '/items?moved=1');
        await request(app).get('/old').redirects(1).expect(200, { query: { moved: '1' } });
      });

      it('errors', async () => {
        const res = await request(app).get('/fail').expect(418);
        expect(res.error.message).toBe('cannot GET /fail (418)');
        await expect(request(app).get('/fail').expect(200)).rejects.toThrow(`expected 200 "OK", got 418 "I'm a Teapot"`);
      });
    });
  });
});
