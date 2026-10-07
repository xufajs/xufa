// @xufa/admin: the page and its API on a memory database: the models and their fields as the forms show them, lists
// with search, filters, order and pages, labels (toString() and foreign keys), creates and updates with the errors of
// the model by field, deletes (soft too), choices of foreign keys, authorize() and the header of writes. (The page
// itself was driven in Chrome while it was written: lists, search, forms with errors, creates and edits.)
const xufa = require('@xufa/http');
const { Database, Model, fields, factory } = require('@xufa/orm');
const { admin, describeModel } = require('..');

function models() {
  class Author extends Model {
    static fields = {
      name: fields.string({ maxLength: 100 }),
      country: fields.string({ null: true, choices: ['ES', 'UK'] }),
    };
  }
  class Book extends Model {
    static options = { softDelete: true };

    static fields = {
      title: fields.string({ maxLength: 200, unique: true }),
      pages: fields.integer({ null: true, validate: [{ rule: 'value > 0', message: 'Pages are more than 0.' }] }),
      published: fields.boolean({ default: false }),
      author: fields.foreignKey(() => Author),
      notes: fields.text({ null: true }),
      createdAt: fields.datetime({ autoNowAdd: true }),
    };

    toString() {
      return `«${this.title}»`;
    }
  }
  return { Author, Book };
}

async function setUp(options = {}) {
  const { Author, Book } = models();
  const db = new Database({ backend: 'memory' }).register(Author, Book);
  await db.sync();
  const ada = await Author.objects.create({ name: 'Ada', country: 'UK' });
  const grace = await Author.objects.create({ name: 'Grace' });
  await factory(Book, {
    title: (n) => `Book ${String(n).padStart(2, '0')}`,
    pages: (n) => n * 10,
    author: ada,
    published: (n) => n % 2 === 0,
  }).createMany(12);
  const app = xufa();
  app.register(admin, { prefix: '/admin', models: [Book, Author], authorize: () => true, ...options });
  await app.ready();
  return { app, Author, Book, ada, grace };
}

const WRITE = { 'x-xufa-admin': '1' };

describe('admin', () => {
  it('the page, and the models with their fields, lists, searches and filters', async () => {
    const { app } = await setUp({ title: 'Shop' });
    const page = await app.inject('/admin/');
    expect([page.statusCode, page.headers['content-type']]).toEqual([200, 'text/html; charset=utf-8']);
    expect(page.body).toContain('<title>Shop</title>');
    expect((await app.inject('/admin')).headers.location).toBe('/admin/');
    const { models: described } = (await app.inject('/admin/api/models')).json();
    const book = described.find((model) => model.name === 'Book');
    expect(book.count).toBe(12);
    expect(book.list).toEqual(['id', 'title', 'pages', 'published', 'author', 'createdAt']);
    expect(book.search).toEqual(['title']);
    expect(book.filters).toEqual(['published', 'author']);
    expect(book.softDelete).toBe('deletedAt');
    const byName = Object.fromEntries(book.fields.map((field) => [field.name, field]));
    expect(byName.title).toMatchObject({ input: 'text', required: true, maxLength: 200, readOnly: false });
    expect(byName.pages).toMatchObject({ input: 'number', required: false, null: true });
    expect(byName.published).toMatchObject({ input: 'checkbox', required: false, default: false });
    expect(byName.author).toMatchObject({ input: 'select', target: 'Author', attname: 'authorId', required: true });
    expect(byName.createdAt.readOnly).toBe(true);
    expect(byName.id.readOnly).toBe(true);
    const author = described.find((model) => model.name === 'Author');
    expect(author.fields.find((field) => field.name === 'country')).toMatchObject({
      input: 'choices',
      choices: ['ES', 'UK'],
    });
  });

  it('lists: pages, search, filters, order; labels of the objects and of their foreign keys', async () => {
    const { app } = await setUp();
    const first = (await app.inject('/admin/api/Book?size=10')).json();
    expect([first.count, first.results.length, first.page]).toEqual([12, 10, 1]);
    expect(first.results[0]).toMatchObject({ label: '«Book 01»', related: { author: 'Ada' } });
    expect((await app.inject('/admin/api/Book?size=10&page=2')).json().results).toHaveLength(2);
    expect((await app.inject('/admin/api/Book?search=book 1')).json().count).toBe(3); // 10, 11, 12
    expect((await app.inject('/admin/api/Book?filter.published=true')).json().count).toBe(6);
    const ordered = (await app.inject('/admin/api/Book?order=-pages')).json().results.map((item) => item.values.pages);
    expect(ordered.slice(0, 3)).toEqual([120, 110, 100]);
    expect((await app.inject('/admin/api/Book?order=nope')).statusCode).toBe(400);
    expect((await app.inject('/admin/api/Nope')).statusCode).toBe(404);
    const choices = (await app.inject('/admin/api/Author/choices')).json();
    expect(choices.map((choice) => choice.label)).toEqual(['Ada', 'Grace']);
  });

  it("creates and updates with the errors of the model by field; deletes (softly, with the model's option)", async () => {
    const { app, Book, grace } = await setUp();
    const invalid = await app.inject({
      method: 'POST',
      url: '/admin/api/Book',
      headers: WRITE,
      payload: { title: 'New', pages: -1 },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().errors).toEqual({ pages: ['Pages are more than 0.'], author: ['This field is required.'] });
    const created = await app.inject({
      method: 'POST',
      url: '/admin/api/Book',
      headers: WRITE,
      payload: { title: 'New', pages: 5, authorId: grace.pk, createdAt: '2000-01-01' },
    });
    expect(created.statusCode).toBe(201);
    const { pk } = created.json();
    const book = await Book.objects.get({ pk });
    expect([book.title, book.authorId, book.createdAt.getFullYear() > 2000]).toEqual(['New', grace.pk, true]);
    const duplicate = await app.inject({
      method: 'POST',
      url: '/admin/api/Book',
      headers: WRITE,
      payload: { title: 'New', authorId: grace.pk },
    });
    expect([duplicate.statusCode, duplicate.json().errors]).toEqual([
      409,
      { title: ['There is already one with this value.'] },
    ]);
    const updated = await app.inject({
      method: 'PATCH',
      url: `/admin/api/Book/${pk}`,
      headers: WRITE,
      payload: { title: 'Renamed', notes: '' },
    });
    expect([updated.statusCode, updated.json().values.title, updated.json().values.notes]).toEqual([
      200,
      'Renamed',
      null,
    ]);
    const one = (await app.inject(`/admin/api/Book/${pk}`)).json();
    expect(one).toMatchObject({ label: '«Renamed»', related: { author: 'Grace' } });
    expect((await app.inject({ method: 'DELETE', url: `/admin/api/Book/${pk}`, headers: WRITE })).statusCode).toBe(204);
    expect((await app.inject(`/admin/api/Book/${pk}`)).statusCode).toBe(404);
    expect(await Book.objects.onlyDeleted().count()).toBe(1);
  });

  it('authorize() and the header of writes; models only read', async () => {
    const { app } = await setUp({ authorize: (request) => request.headers['x-staff'] === 'yes' });
    expect((await app.inject('/admin/api/models')).statusCode).toBe(403);
    expect((await app.inject({ url: '/admin/api/models', headers: { 'x-staff': 'yes' } })).statusCode).toBe(200);
    const noHeader = await app.inject({
      method: 'POST',
      url: '/admin/api/Book',
      headers: { 'x-staff': 'yes' },
      payload: {},
    });
    expect([noHeader.statusCode, noHeader.json().error]).toEqual([
      403,
      'Writes of the admin need the header x-xufa-admin: 1',
    ]);
    const { Author } = models();
    await expect(
      xufa()
        .register(admin, { models: [Author] })
        .ready()
    ).rejects.toThrow(/needs login .* or authorize/);
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const { app: production } = await setUp({ authorize: 'development' });
      expect((await production.inject('/admin/api/models')).statusCode).toBe(403);
    } finally {
      process.env.NODE_ENV = previous;
    }
    const { Author: Writer } = models();
    const db = new Database({ backend: 'memory' }).register(Writer);
    await db.sync();
    const only = xufa();
    only.register(admin, { models: [[Writer, { readOnlyModel: true }]], authorize: () => true });
    expect(
      (await only.inject({ method: 'POST', url: '/api/Author', headers: WRITE, payload: { name: 'x' } })).statusCode
    ).toBe(405);
  });

  it('describeModel: options of a model, and fields that are not there', () => {
    const { Book } = models();
    expect(describeModel(Book, { list: ['title'], search: [], filters: [], label: 'Books' })).toMatchObject({
      label: 'Books',
      list: ['title'],
    });
    expect(() => describeModel(Book, { list: ['nope'] })).toThrow(/has no field nope/);
  });
});

describe('admin: runs of pipelines and the health of the app', () => {
  const { Queue, Pipelines } = require('@xufa/queue'); // eslint-disable-line global-require

  async function setUpRuns(options = {}) {
    const db = new Database({ backend: 'memory' });
    const queue = new Queue(db, { backoff: 0 });
    const pipelines = new Pipelines(queue);
    await db.sync();
    pipelines.block('double', (input) => input * 2);
    pipelines.block('boom', () => {
      throw new Error('the converter is down');
    });
    pipelines.define({
      name: 'approval',
      concurrency: 2,
      steps: [
        { id: 'first', block: 'double' },
        { id: 'approve', block: 'wait', after: 'first', waitTimeout: '1h' },
        { id: 'last', block: 'double', after: 'approve', when: 'input > 0', result: true },
      ],
    });
    pipelines.define({ name: 'broken', steps: [{ id: 'only', block: 'boom', attempts: 1 }] });
    const app = xufa();
    app.register(xufa.health, { cache: 0, checks: { database: db.health(), queue: queue.health() } });
    app.register(admin, { prefix: '/admin', models: [], authorize: () => true, pipelines, ...options });
    await app.ready();
    return { app, db, queue, pipelines };
  }

  it('lists the runs (by status and pipeline), and gives a run with its graph and steps', async () => {
    const { app, queue, pipelines } = await setUpRuns();
    const waiting = await pipelines.start('approval', 21);
    await pipelines.start('broken');
    await queue.runDue();
    const models = (await app.inject('/admin/api/models')).json();
    expect([models.runs, models.health]).toEqual([true, true]);
    const list = (await app.inject('/admin/api/_runs')).json();
    expect(list.count).toBe(2);
    expect(list.counts).toEqual({ running: 1, done: 0, failed: 1, cancelled: 0 });
    expect(list.pipelines).toEqual(['approval', 'broken']);
    expect(list.results.map((run) => [run.pipeline, run.status])).toEqual([
      ['broken', 'failed'],
      ['approval', 'running'],
    ]);
    expect((await app.inject('/admin/api/_runs?status=failed')).json().results[0].error).toBe(
      'The step only failed: the converter is down'
    );
    expect((await app.inject('/admin/api/_runs?pipeline=approval')).json().count).toBe(1);
    expect((await app.inject('/admin/api/_runs?status=nope')).statusCode).toBe(400);
    const run = (await app.inject(`/admin/api/_runs/${waiting.pk}`)).json();
    expect(run).toMatchObject({ pipeline: 'approval', status: 'running', input: 21, inFlight: 0 });
    expect(run.graph).toEqual({
      concurrency: 2,
      steps: [
        { id: 'first', block: 'double', after: [], when: null, result: false, waitTimeout: null },
        { id: 'approve', block: 'wait', after: ['first'], when: null, result: false, waitTimeout: '1h' },
        { id: 'last', block: 'double', after: ['approve'], when: 'input > 0', result: true, waitTimeout: null },
      ],
    });
    expect(run.steps.first).toMatchObject({ status: 'done', output: 42, attempts: 1 });
    expect(run.steps.approve.status).toBe('paused');
    expect(Date.parse(run.steps.approve.pausedUntil) - Date.now()).toBeGreaterThan(59 * 60000);
    expect((await app.inject('/admin/api/_runs/999')).statusCode).toBe(404);
  });

  it('resume, cancel and retry: with the header of the admin, and errors that say why', async () => {
    const { app, queue, pipelines } = await setUpRuns();
    const run = await pipelines.start('approval', 1);
    const broken = await pipelines.start('broken');
    await queue.runDue();
    const post = (url, body) =>
      app.inject({ method: 'POST', url: `/admin/api/_runs/${url}`, headers: WRITE, payload: body || {} });
    expect((await app.inject({ method: 'POST', url: `/admin/api/_runs/${run.pk}/cancel` })).statusCode).toBe(403);
    expect((await post(`${run.pk}/steps/first/resume`)).json().error).toMatch(/is done, not paused/);
    expect((await post(`${run.pk}/steps/approve/resume`, { output: 5 })).json()).toEqual({ ok: true });
    await queue.runDue();
    const done = (await app.inject(`/admin/api/_runs/${run.pk}`)).json();
    expect([done.status, done.result, done.steps.approve.output]).toEqual(['done', 10, 5]);
    expect((await post(`${run.pk}/cancel`)).statusCode).toBe(409);
    expect((await post(`${broken.pk}/retry`)).json()).toEqual({ ok: true });
    expect((await app.inject(`/admin/api/_runs/${broken.pk}`)).json().status).toBe('running');
    expect((await post(`${broken.pk}/cancel`)).json()).toEqual({ ok: true });
    expect((await app.inject(`/admin/api/_runs/${broken.pk}`)).json().status).toBe('cancelled');
    expect((await post(`${broken.pk}/retry`)).json()).toEqual({ ok: true });
    expect((await post('999/retry')).statusCode).toBe(404);
  });

  it('a run of a step of another run: the step links to it, and it to its parent', async () => {
    const { app, queue, pipelines } = await setUpRuns();
    pipelines.define({ name: 'outer', steps: [{ id: 'sub', block: 'pipeline', config: { pipeline: 'approval' } }] });
    const outer = await pipelines.start('outer', 3);
    await queue.runDue();
    const parent = (await app.inject(`/admin/api/_runs/${outer.pk}`)).json();
    expect(parent.steps.sub.status).toBe('paused');
    const childId = parent.steps.sub.child;
    const child = (await app.inject(`/admin/api/_runs/${childId}`)).json();
    expect(child).toMatchObject({ pipeline: 'approval', parentStep: 'sub', depth: 1, input: 3 });
    expect(String(child.parent)).toBe(String(outer.pk));
  });

  it('the health of the app: its report, as GET /health gives it; none without xufa.health', async () => {
    const { app, db } = await setUpRuns();
    const report = (await app.inject('/admin/api/_health')).json();
    expect(report.status).toBe('up');
    expect(Object.keys(report.checks)).toEqual(['database', 'queue']);
    db.backend.ping = async () => {
      throw new Error('the database is gone');
    };
    expect((await app.inject('/admin/api/_health')).json()).toMatchObject({
      status: 'down',
      checks: { database: { status: 'down', error: 'the database is gone' } },
    });
    const plain = xufa();
    plain.register(admin, { prefix: '/admin', models: [], authorize: () => true });
    expect((await plain.inject('/admin/api/models')).json()).toMatchObject({ runs: false, health: false });
    expect((await plain.inject('/admin/api/_health')).statusCode).toBe(404);
    expect((await plain.inject('/admin/api/_runs')).statusCode).toBe(404);
    // authorize() asks for these too.
    const closed = await setUpRuns({ authorize: () => false });
    expect((await closed.app.inject('/admin/api/_runs')).statusCode).toBe(403);
    expect((await closed.app.inject('/admin/api/_health')).statusCode).toBe(403);
  });
});

describe('admin: its login (@xufa/auth and @xufa/session)', () => {
  const auth = require('@xufa/auth'); // eslint-disable-line global-require
  const { sessionPlugin } = require('@xufa/session'); // eslint-disable-line global-require
  const PASSWORDS = { ln: 4 }; // light scrypt for tests (the default is 2^17)

  async function setUpLogin(options = {}) {
    class User extends Model {
      static fields = {
        email: fields.string({ unique: true }),
        password: fields.string(),
        role: fields.string({ default: 'user' }),
        totpSecret: fields.string({ null: true }),
        totpStep: fields.integer({ null: true }),
      };
    }
    const { Author } = models();
    const db = new Database({ backend: 'memory' }).register(User, Author);
    await db.sync();
    const hash = await auth.hashPassword('right-horse-battery', PASSWORDS);
    const secret = auth.generateSecret();
    await User.objects.create({ email: 'ada@example.com', password: hash, role: 'staff' });
    await User.objects.create({ email: 'bob@example.com', password: hash, role: 'user' });
    await User.objects.create({ email: 'tom@example.com', password: hash, role: 'staff', totpSecret: secret });
    const app = xufa();
    if (options.session !== false) {
      app.register(sessionPlugin, { secret: 'a secret of thirty two characters or more', csrf: true });
    }
    app.register(admin, {
      prefix: '/admin',
      models: [Author],
      login: {
        findUser: (email) => User.objects.filter({ email: email.toLowerCase() }).first(),
        allow: (user) => user.role === 'staff',
        name: (user) => user.email,
        totp: (user) => user.totpSecret,
        lastTotpStep: (user) => user.totpStep,
        onTotp: (user, step) => User.objects.filter({ pk: user.pk }).update({ totpStep: step }),
        passwordOptions: PASSWORDS,
        lockout: { maxAttempts: 3 },
      },
      ...(options.authorize ? { authorize: options.authorize } : {}),
    });
    await app.ready();
    // A browser: its cookie, and the CSRF token of its session.
    let cookie = '';
    const send = async (request) => {
      const res = await app.inject({ ...request, headers: { cookie, ...request.headers } });
      const set = res.headers['set-cookie'];
      if (set) cookie = [].concat(set)[0].split(';')[0];
      return res;
    };
    const csrfOf = (html) => /name="csrf-token" content="([^"]*)"/.exec(html)[1];
    const loginAs = async (username, password, code) => {
      const page = await send({ url: '/admin/login' });
      return send({
        method: 'POST',
        url: '/admin/login',
        headers: { ...WRITE, 'x-csrf-token': csrfOf(page.body) },
        payload: { username, password, ...(code ? { code } : {}) },
      });
    };
    return { app, User, secret, send, loginAs, cookieOf: () => cookie };
  }

  it('without a user: the page goes to the login page, the API answers 401', async () => {
    const { send } = await setUpLogin();
    const page = await send({ url: '/admin/' });
    expect([page.statusCode, page.headers.location]).toEqual([302, 'login']);
    expect((await send({ url: '/admin/api/models' })).json()).toMatchObject({ login: true });
    expect((await send({ url: '/admin/api/models' })).statusCode).toBe(401);
    const login = await send({ url: '/admin/login' });
    expect(login.statusCode).toBe(200);
    expect(login.body).toContain('autocomplete="current-password"');
    expect(login.body).toMatch(/name="csrf-token" content="[^"]+"/);
  });

  it('wrong users, passwords and users not allowed get the same answer; the header and the CSRF token are needed', async () => {
    const { send, loginAs } = await setUpLogin();
    expect((await send({ method: 'POST', url: '/admin/login', payload: {} })).statusCode).toBe(403);
    for (const [user, password] of [
      ['ada@example.com', 'wrong'],
      ['nobody@example.com', 'right-horse-battery'],
      ['bob@example.com', 'right-horse-battery'],
    ]) {
      const res = await loginAs(user, password);
      expect([res.statusCode, res.json().error]).toEqual([401, 'Wrong user or password']);
    }
    // The session asks for its CSRF token (csrf: true).
    await send({ url: '/admin/login' });
    const forged = await send({
      method: 'POST',
      url: '/admin/login',
      headers: WRITE,
      payload: { username: 'ada@example.com', password: 'right-horse-battery' },
    });
    expect(forged.statusCode).toBe(403);
  });

  it('logs in (a new session id), works with the token of the session, and logs out', async () => {
    const { send, loginAs, cookieOf } = await setUpLogin();
    await send({ url: '/admin/login' });
    const before = cookieOf();
    const res = await loginAs('ADA@example.com', 'right-horse-battery');
    expect(res.json()).toEqual({ ok: true, user: { name: 'ada@example.com' } });
    expect(cookieOf()).not.toBe(before);
    const models = (await send({ url: '/admin/api/models' })).json();
    expect(models.user).toEqual({ name: 'ada@example.com' });
    expect((await send({ url: '/admin/' })).statusCode).toBe(200);
    expect((await send({ url: '/admin/login' })).headers.location).toBe('./');
    const create = (headers) => send({ method: 'POST', url: '/admin/api/Author', headers, payload: { name: 'Mary' } });
    expect((await create(WRITE)).statusCode).toBe(403);
    expect((await create({ ...WRITE, 'x-csrf-token': models.csrf })).statusCode).toBe(201);
    expect(
      (await send({ method: 'POST', url: '/admin/logout', headers: { ...WRITE, 'x-csrf-token': models.csrf } })).json()
    ).toEqual({ ok: true });
    expect((await send({ url: '/admin/api/models' })).statusCode).toBe(401);
  });

  it('the code of an authenticator app: asked for after the password, each code once', async () => {
    const { loginAs, secret, send } = await setUpLogin();
    const asked = await loginAs('tom@example.com', 'right-horse-battery');
    expect([asked.statusCode, asked.json()]).toEqual([
      401,
      { error: 'The code of your authenticator app', errors: {}, code: true },
    ]);
    expect((await loginAs('tom@example.com', 'right-horse-battery', '000000')).json().error).toBe('Wrong code');
    const code = auth.totp(secret);
    expect((await loginAs('tom@example.com', 'right-horse-battery', code)).json().ok).toBe(true);
    // Logged out, the same code does not log in again.
    const { csrf } = (await send({ url: '/admin/api/models' })).json();
    await send({ method: 'POST', url: '/admin/logout', headers: { ...WRITE, 'x-csrf-token': csrf } });
    expect((await loginAs('tom@example.com', 'right-horse-battery', code)).json().error).toBe('Wrong code');
  });

  it('too many failures lock the user out (429 with Retry-After), even with the right password', async () => {
    const { loginAs } = await setUpLogin();
    for (let i = 0; i < 3; i += 1) await loginAs('ada@example.com', 'wrong');
    const locked = await loginAs('ada@example.com', 'right-horse-battery');
    expect(locked.statusCode).toBe(429);
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    // Another user from the same address is not locked by those (its address takes 20).
    expect((await loginAs('tom@example.com', 'right-horse-battery')).json().code).toBe(true);
  });

  it('needs @xufa/session; authorize() is asked after the login, with request.adminUser', async () => {
    const without = await setUpLogin({ session: false });
    const res = await without.send({ url: '/admin/api/models' });
    expect([res.statusCode, res.json().error]).toEqual([
      500,
      'The login of the admin needs @xufa/session (registered before the admin)',
    ]);
    const seen = [];
    const strict = await setUpLogin({
      authorize: (request) => {
        seen.push(request.adminUser.name);
        return false;
      },
    });
    await strict.loginAs('ada@example.com', 'right-horse-battery');
    expect((await strict.send({ url: '/admin/api/models' })).statusCode).toBe(403);
    expect(seen).toEqual(['ada@example.com']);
  });
});
