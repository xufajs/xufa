// Tests of xufa (not ported from fastify): health, the routes of the health of an app (live, ready, the report) with
// its checks (up, degraded, down, timeouts, critical or not), the background run and onChange, heal for a check down
// too long, and readiness down while the app closes; and maintenance, the 503 of the maintenance mode with its file
// and stores, the routes that go through, the addresses allowed and the secret path's cookie.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const xufa = require('@xufa/http');
const { bypassOf } = require('../../lib/maintenance');

const sleep = (wait) => new Promise((resolve) => setTimeout(resolve, wait));

describe('health', () => {
  it('live, ready and the report: every check with its status, time, details and error', async () => {
    let databaseUp = true;
    const app = xufa();
    app.register(xufa.health, {
      cache: 0,
      checks: {
        database: () => {
          if (!databaseUp) throw new Error('connection refused');
          return 1.5;
        },
        queue: { check: () => ({ status: 'degraded', failed: 3 }), critical: false },
        cache: () => true,
      },
    });
    const live = await app.inject('/health/live');
    expect(live.statusCode).toBe(200);
    expect(live.json().status).toBe('up');
    let ready = await app.inject('/health/ready');
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: 'degraded' });
    let report = (await app.inject('/health')).json();
    expect(report.status).toBe('degraded');
    expect(report.checks.database).toMatchObject({ status: 'up', details: 1.5, critical: true });
    expect(report.checks.database.duration).toEqual(expect.any(Number));
    expect(report.checks.queue).toMatchObject({ status: 'degraded', details: { failed: 3 }, critical: false });
    expect(report.checks.cache).toMatchObject({ status: 'up' });
    databaseUp = false;
    ready = await app.inject('/health/ready');
    expect(ready.statusCode).toBe(503);
    report = (await app.inject('/health')).json();
    expect(report.status).toBe('down');
    expect(report.checks.database).toMatchObject({ status: 'down', error: 'connection refused' });
    expect(app.health.status).toBe('down');
    await app.close();
  });

  it('results: false, a text, an exception and a timeout are down; a check not critical only degrades', async () => {
    const app = xufa();
    app.register(xufa.health, {
      prefix: '/status',
      timeout: 30,
      details: false,
      checks: {
        no: { check: () => false, critical: false },
        text: { check: () => 'no nodes', critical: false },
        slow: { check: () => sleep(200), critical: false },
      },
    });
    const res = await app.inject('/status');
    expect(res.statusCode).toBe(200);
    // details: false shows the status only.
    expect(res.json()).toEqual({ status: 'degraded' });
    await app.ready();
    const report = await app.health.check();
    expect(report.checks.no.status).toBe('down');
    expect(report.checks.text).toMatchObject({ status: 'down', error: 'no nodes' });
    expect(report.checks.slow.error).toBe('The check slow took more than 30 ms');
    await app.close();
  });

  it('runs in the background (interval), tells onChange, and heals a check down too long', async () => {
    let up = true;
    const changes = [];
    const healed = [];
    const app = xufa();
    app.register(xufa.health, {
      interval: 20,
      checks: {
        database: {
          check: () => up || 'down',
          heal: {
            after: 50,
            run: (result) => {
              healed.push(result.error);
              up = true;
            },
          },
        },
      },
      onChange: (status, previous) => changes.push([status, previous]),
    });
    await app.ready();
    expect(app.health.report.status).toBe('up');
    up = false;
    await sleep(150);
    // Down (told), healed after 50 ms (up again, told).
    expect(changes).toEqual([
      ['up', null],
      ['down', 'up'],
      ['up', 'down'],
    ]);
    expect(healed).toEqual(['down']);
    await app.close();
  });

  it('ready is down while the app closes', async () => {
    const app = xufa();
    let ready;
    app.register(xufa.health, { checks: { ok: () => true } });
    app.addHook('onClose', async () => {
      ready = app.health.status;
    });
    await app.ready();
    await app.close();
    expect(ready).toBe('down');
  });

  it('refuses checks that are not functions and durations that are not', async () => {
    await expect(xufa().register(xufa.health, { checks: { x: 1 } }).ready()).rejects.toThrow(/is a function/);
    await expect(xufa().register(xufa.health, { interval: 'soon' }).ready()).rejects.toThrow(/not a duration/);
  });
});

describe('maintenance', () => {
  let dir;
  let file;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-maintenance-'));
    file = path.join(dir, '.xufa', 'down.json');
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  function makeApp(options = {}) {
    const app = xufa();
    app.register(xufa.maintenance, { file, refresh: 0, ...options });
    app.register(xufa.health, { checks: {} });
    app.get('/', async () => ({ hello: 'world' }));
    app.post('/webhook', { config: { maintenance: false } }, async () => ({ ok: true }));
    return app;
  }

  const down = (state) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state));
  };

  it('the file there turns it on: 503 with Retry-After, JSON or a page; health and opted-out routes go through', async () => {
    const app = makeApp();
    expect((await app.inject('/')).statusCode).toBe(200);
    down({ message: 'Back at <noon>', retryAfter: 600 });
    const json = await app.inject('/');
    expect(json.statusCode).toBe(503);
    expect(json.headers['retry-after']).toBe('600');
    expect(json.json()).toEqual({
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'Back at <noon>',
      retryAfter: 600,
    });
    const html = await app.inject({ url: '/', headers: { accept: 'text/html' } });
    expect(html.statusCode).toBe(503);
    expect(html.body).toContain('Back at &lt;noon&gt;');
    expect((await app.inject('/health/live')).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/webhook' })).statusCode).toBe(200);
    // Even a 404 is the maintenance page.
    expect((await app.inject('/nothing')).statusCode).toBe(503);
    fs.rmSync(file);
    expect((await app.inject('/')).statusCode).toBe(200);
    await app.close();
  });

  it('the addresses allowed go through, and the secret path gives a cookie that does', async () => {
    const app = makeApp();
    down({ allow: ['127.0.0.1'], secret: 'let-me-in' });
    expect((await app.inject('/')).statusCode).toBe(200);
    const other = { remoteAddress: '10.0.0.9' };
    expect((await app.inject({ url: '/', ...other })).statusCode).toBe(503);
    const opened = await app.inject({ url: '/let-me-in', ...other });
    expect(opened.statusCode).toBe(302);
    expect(opened.headers.location).toBe('/');
    const cookie = opened.headers['set-cookie'].split(';')[0];
    expect(cookie).toBe(`xufa_maintenance=${bypassOf('let-me-in')}`);
    expect((await app.inject({ url: '/', headers: { cookie }, ...other })).statusCode).toBe(200);
    expect((await app.inject({ url: '/', headers: { cookie: 'xufa_maintenance=forged' }, ...other })).statusCode).toBe(
      503
    );
    await app.close();
  });

  it('stores: any one on turns it on; a store that fails counts as up; render makes the page', async () => {
    let state = null;
    const app = makeApp({
      file: false,
      store: [
        {
          get: () => {
            throw new Error('the database is gone');
          },
        },
        { get: async () => state },
      ],
      render: (current) => `<p>${current.message}</p>`,
    });
    expect((await app.inject('/')).statusCode).toBe(200);
    state = { message: 'everywhere' };
    const res = await app.inject({ url: '/', headers: { accept: 'text/html' } });
    expect(res.statusCode).toBe(503);
    expect(res.body).toBe('<p>everywhere</p>');
    expect(await app.maintenance.state()).toEqual({ message: 'everywhere' });
    await app.close();
    await expect(xufa().register(xufa.maintenance, { store: {} }).ready()).rejects.toThrow(/get\(\)/);
  });

  it('reads the state at most every refresh', async () => {
    const app = makeApp({ refresh: 10000 });
    expect((await app.inject('/')).statusCode).toBe(200);
    down({});
    // Read a moment ago: still up until refresh passes (or state() reads it again).
    expect((await app.inject('/')).statusCode).toBe(200);
    expect(await app.maintenance.state()).toEqual({});
    expect((await app.inject('/')).statusCode).toBe(503);
    await app.close();
  });
});
