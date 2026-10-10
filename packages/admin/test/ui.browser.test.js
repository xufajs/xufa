// The page of the admin in a browser (Chrome or Edge as installed, driven by playwright-core; skipped without one): the
// login (a wrong password, then in), the dashboard, a list searched, filtered and ordered (in the address), a form with
// a required field left empty, the question before leaving it, a new object with its foreign key chosen in the
// combobox, objects deleted at once, a user who may only view, the tenant chosen, a failed job tried again, a paused
// step of a run resumed, and logging out; with no error of a script on the way.
import fs from 'node:fs';
import xufa from '@xufa/http';
import { Database, Model, Tenants, fields } from '@xufa/orm';
import * as auth from '@xufa/auth';
import { sessionPlugin } from '@xufa/session';
import { Queue, Pipelines } from '@xufa/queue';
import { Scheduler } from '@xufa/scheduler';
import { admin } from '../index.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const CHROME = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((file) => file && fs.existsSync(file));

let playwright = null;
try {
  playwright = require('playwright-core'); // eslint-disable-line global-require
} catch {
  playwright = null;
}

const PASSWORD = 'right-horse-battery';

class Author extends Model {
  static fields = { name: fields.string({ maxLength: 100 }) };

  toString() {
    return this.name;
  }
}

class Book extends Model {
  static fields = {
    title: fields.string({ maxLength: 200 }),
    pages: fields.integer({ null: true }),
    published: fields.boolean({ default: false }),
    author: fields.foreignKey(() => Author, { null: true }),
  };

  toString() {
    return this.title;
  }
}

class User extends Model {
  static fields = {
    email: fields.string({ unique: true }),
    password: fields.string(),
    superuser: fields.boolean({ default: false }),
    totpSecret: fields.string({ null: true }),
    recoveryCodes: fields.json({ default: () => [] }),
  };
}

describe.skipIf(!CHROME || !playwright)('the page of the admin, in a browser', () => {
  let app;
  let browser;
  let context;
  let base;
  let tenants;
  let queue;
  let pipelines;
  let scheduler;
  const problems = [];

  beforeAll(async () => {
    tenants = new Tenants({
      models: [Author, Book],
      config: (id) => (['acme', 'globex'].includes(id) ? { backend: 'memory' } : null),
      setup: (db) => db.sync(),
    });
    for (const [tenant, n] of [
      ['acme', 30],
      ['globex', 3],
    ]) {
      await tenants.run(tenant, async () => {
        const ada = await Author.objects.create({ name: 'Ada Lovelace' });
        await Author.objects.create({ name: 'Grace Hopper' });
        for (let i = 1; i <= n; i += 1) {
          await Book.objects.create({
            title: `${tenant} book ${i}`,
            pages: i * 10,
            published: i % 2 === 0,
            author: ada,
          });
        }
      });
    }
    const users = new Database({ backend: 'memory' }).register(User);
    await users.sync();
    const hash = await auth.hashPassword(PASSWORD, { ln: 4 });
    await User.objects.create({ email: 'root@example.com', password: hash, superuser: true });
    await User.objects.create({ email: 'eve@example.com', password: hash });
    await User.objects.create({ email: 'kim@example.com', password: hash, superuser: true });
    const grants = { 'eve@example.com': [{ role: 'viewer', tenant: 'acme' }] };

    const db = new Database({ backend: 'memory' });
    queue = new Queue(db, { backoff: 0, keepDone: true });
    pipelines = new Pipelines(queue);
    await db.sync();
    let reports = 0;
    queue.define(
      'export-report',
      () => {
        reports += 1;
        if (reports === 1) throw new Error('the storage refused the file');
        return { file: 'report.csv' };
      },
      { attempts: 1 }
    );
    pipelines.block('double', (input) => input * 2);
    pipelines.define({
      name: 'approval',
      steps: [
        { id: 'first', block: 'double' },
        { id: 'approve', block: 'wait', after: 'first', waitTimeout: '1h' },
      ],
    });
    await queue.enqueue('export-report', { format: 'csv' });
    await pipelines.start('approval', 21);
    scheduler = new Scheduler();
    pipelines.task('nightly-export', (input) => ({ rows: input.rows }), { attempts: 1 });
    pipelines.schedule(scheduler, 'nightly-export', { cron: '0 2 * * *', input: { rows: 3 } });
    for (let i = 0; i < 4; i += 1) await queue.runDue();

    app = xufa();
    app.register(sessionPlugin, { secret: 'a secret of thirty two characters or more', csrf: true });
    app.register(admin, {
      prefix: '/admin',
      title: 'Library',
      models: [
        [
          Book,
          { actions: { publish: { label: 'Mark as published', run: (books) => books.update({ published: true }) } } },
        ],
        Author,
      ],
      pipelines,
      queue,
      scheduler,
      health: false,
      login: {
        findUser: (email) => User.objects.using(users).filter({ email }).first(),
        reload: (id) => User.objects.using(users).filter({ pk: id }).first(),
        passwordOptions: { ln: 4 },
        totp: (user) => user.totpSecret,
        setPassword: (user, password) => User.objects.using(users).filter({ pk: user.pk }).update({ password }),
        setTotp: (user, totpSecret) => User.objects.using(users).filter({ pk: user.pk }).update({ totpSecret }),
        recoveryCodes: (user) => user.recoveryCodes,
        setRecoveryCodes: (user, recoveryCodes) =>
          User.objects.using(users).filter({ pk: user.pk }).update({ recoveryCodes }),
      },
      rbac: {
        roles: { viewer: ['Book.view', 'Author.view'] },
        grants: (user) => grants[user.email] || [],
      },
      tenants: { tenants, list: () => ['acme', 'globex'], label: (id) => `${id.toUpperCase()} Inc` },
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    base = `http://127.0.0.1:${app.server.address().port}/admin/`;
    browser = await playwright.chromium.launch({ executablePath: CHROME });
  }, 30000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (app) await app.close();
  });

  async function open() {
    problems.length = 0;
    const page = await context.newPage();
    page.on('pageerror', (err) => problems.push(err.message));
    page.on('console', (message) => {
      // The answers the tests ask for (401 of a wrong password, 400 of a form) are logged by the browser.
      if (message.type() === 'error' && !/status of (400|401|403)/.test(message.text())) problems.push(message.text());
    });
    return page;
  }

  async function login(page, email) {
    await page.goto(base);
    await page.waitForSelector('form#login');
    await page.fill('#username', email);
    await page.fill('#password', PASSWORD);
    await page.click('form#login button[type="submit"]');
    await page.waitForSelector('.sidebar');
  }

  it('a superuser: the login, lists, forms, deletes, the tenant, jobs and runs', async () => {
    context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
    const page = await open();

    // A wrong password: said, and still the login page.
    await page.goto(base);
    await page.waitForSelector('form#login');
    expect(new URL(page.url()).pathname).toBe('/admin/login');
    await page.fill('#username', 'root@example.com');
    await page.fill('#password', 'wrong');
    await page.click('form#login button[type="submit"]');
    await page.waitForSelector('.alert');
    expect(await page.textContent('.alert')).toContain('Wrong user or password');
    await login(page, 'root@example.com');

    // The dashboard: the models of the first tenant with their counts.
    await page.waitForSelector('a.card.stat');
    expect(await page.$$eval('a.card.stat .label', (labels) => labels.map((label) => label.textContent))).toEqual([
      'Books',
      'Authors',
    ]);
    expect(await page.textContent('button[aria-label^="Tenant"]')).toContain('ACME Inc');
    // What waits in the queue, under its counts.
    await page.waitForSelector('.queue-wait');
    expect(await page.textContent('.queue-wait')).toMatch(/(Nothing waits|due now).*workers? here/);

    // The list: 25 a page, searched, filtered and ordered, all in the address.
    await page.click('.sidebar a:has-text("Book")');
    await page.waitForSelector('table.table tbody tr.link');
    expect(await page.$$eval('table.table tbody tr', (rows) => rows.length)).toBe(25);
    expect(await page.textContent('.pager')).toContain('1–25 of 30');
    await page.click('.pager button:has-text("2")');
    await page.waitForFunction(() => document.querySelectorAll('table.table tbody tr').length === 5);
    await page.fill('input[type="search"]', 'book 1');
    await page.waitForFunction(() => window.location.hash.includes('search=book+1'));
    await page.waitForFunction(() => document.querySelectorAll('table.table tbody tr').length === 12); // each word: book, and a 1 (1, 10-19, 21)
    await page.selectOption('select[aria-label="Published"]', 'true');
    await page.waitForFunction(() => document.querySelectorAll('table.table tbody tr').length === 5);
    await page.click('th button.sort:has-text("Pages")');
    await page.click('th button.sort:has-text("Pages")');
    await page.waitForFunction(() => window.location.hash.includes('order=-pages'));
    await page.waitForFunction(
      () => document.querySelector('table.table tbody tr td:nth-child(2)').textContent === '18'
    );
    expect(page.url()).toContain('f.published=true');
    await page.click('button:has-text("Clear")');
    await page.waitForFunction(() => document.querySelectorAll('table.table tbody tr').length === 25);

    // A form: the required title left empty is said, and leaving it asks first.
    await page.click('table.table tbody tr.link >> nth=0');
    await page.waitForSelector('#field-title');
    await page.fill('#field-title', '');
    await page.click('button:has-text("Save and keep editing")');
    await page.waitForSelector('.field.invalid .error');
    expect(await page.textContent('.field.invalid .error')).toBe('This field is required.');
    await page.click('.sidebar a:has-text("Author")');
    await page.waitForSelector('.modal');
    expect(await page.textContent('.modal h2')).toBe('Leave without saving?');
    await page.click('.modal button:has-text("Stay")');
    expect(page.url()).toContain('#/Book/');
    await page.fill('#field-title', 'acme book 1 (revised)');
    await page.click('form button[type="submit"]:has-text("Save")');
    await page.waitForSelector('.toast');
    expect(await page.textContent('.toast')).toContain('Saved acme book 1 (revised)');
    await page.waitForFunction(() => window.location.hash === '#/Book');

    // A new book, its author chosen in the combobox (searched, then Enter).
    await page.click('a:has-text("Add Book")');
    await page.waitForSelector('#field-title');
    await page.fill('#field-title', 'A new book');
    await page.fill('#field-pages', '321');
    await page.click('#field-author');
    await page.fill('.popover input', 'grace');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.popover .option')].some((o) => o.textContent === 'Grace Hopper')
    );
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    expect(await page.textContent('#field-author .value')).toBe('Grace Hopper');
    await page.click('button:has-text("Save and keep editing")');
    await page.waitForFunction(() => /#\/Book\/\d+$/.test(window.location.hash));
    const made = await tenants.run('acme', () => Book.objects.selectRelated('author').get({ title: 'A new book' }));
    expect([made.pages, made.author.name]).toEqual([321, 'Grace Hopper']);

    // Its author, from the link of the field; there its books, and another one added from them (the author given).
    await page.click('.field a:has-text("Open")');
    await page.waitForFunction(() => /#\/Author\/\d+$/.test(window.location.hash));
    await page.waitForSelector('.card:has-text("A new book")');
    await page.click('.card a:has-text("Add Book")');
    await page.waitForFunction(() => /#\/Book\/new\?author=\d+$/.test(window.location.hash));
    await page.waitForFunction(() => document.querySelector('#field-author .value')?.textContent === 'Grace Hopper');

    // Two deleted at once (after an action of the model on them).
    await page.click('.sidebar a:has-text("Book")');
    await page.waitForSelector('table.table tbody tr.link');
    await page.check('table.table tbody tr >> nth=0 >> input[type="checkbox"]');
    await page.check('table.table tbody tr >> nth=1 >> input[type="checkbox"]');
    const before = await tenants.run('acme', () => Book.objects.filter({ published: true }).count());
    await page.click('.bulk button:has-text("Mark as published")');
    await page.waitForFunction(() =>
      /Mark as published: \d objects?/.test(document.querySelector('.toasts').textContent)
    );
    expect(await tenants.run('acme', () => Book.objects.filter({ published: true }).count())).toBeGreaterThan(before);
    await page.waitForFunction(() => !document.querySelector('.bulk'));
    await page.check('table.table tbody tr >> nth=0 >> input[type="checkbox"]');
    await page.check('table.table tbody tr >> nth=1 >> input[type="checkbox"]');
    expect(await page.textContent('.bulk')).toContain('2 selected');
    await page.click('.bulk button:has-text("Delete")');
    await page.click('.modal button:has-text("Delete")');
    await page.waitForFunction(() => /Deleted 2 objects/.test(document.querySelector('.toasts').textContent));
    expect(await tenants.run('acme', () => Book.objects.count())).toBe(29);

    // The other tenant: its books.
    await page.click('button[aria-label^="Tenant"]');
    await page.click('.popover button:has-text("GLOBEX Inc")');
    await page.waitForFunction(() => window.location.hash === '#/');
    await page.waitForFunction(() => document.querySelector('a.card.stat .value').textContent === '3');

    // A failed job tried again (it works the second time).
    // The work: the job and the run together, newest first.
    await page.click('.sidebar a:has-text("Work")');
    await page.waitForSelector('table.table tbody tr.link');
    expect(
      await page.$$eval('table.table tbody tr .kind', (kinds) => kinds.map((kind) => kind.textContent.trim()).sort())
    ).toEqual(['Job #1', 'Run #1']);
    await page.click('.segmented a:has-text("Jobs")');
    await page.click('.tab:has-text("Failed")');
    await page.waitForSelector('table.table tbody tr.link');
    await page.click('table.table tbody tr.link >> nth=0');
    await page.waitForSelector('.code-block.error');
    expect(await page.textContent('.code-block.error')).toContain('the storage refused the file');
    await page.click('button:has-text("Retry")');
    await page.waitForSelector('.toast:has-text("Tried again")');
    await queue.runDue();
    await page.reload();
    await page.waitForSelector('.page-head .badge:has-text("done")');

    // A run: its graph, the paused step chosen, resumed with an output.
    await page.click('.sidebar a:has-text("Work")');
    await page.click('.segmented a:has-text("Pipeline runs")');
    await page.waitForSelector('table.table tbody tr.link');
    await page.click('table.table tbody tr.link >> nth=0');
    await page.waitForSelector('.graph .node');
    expect(await page.$$eval('.graph .node', (nodes) => nodes.map((node) => node.getAttribute('aria-label')))).toEqual([
      'first: done',
      'approve: paused',
    ]);
    await page.fill('#resume-output', '{ "approved": true }');
    await page.click('button:has-text("Resume approve")');
    await page.waitForSelector('.toast:has-text("Resumed")');
    for (let i = 0; i < 3; i += 1) await queue.runDue();
    await page.waitForSelector('.page-head .badge:has-text("done")', { timeout: 10000 });

    // Logging out: the login page.
    await page.click('button[aria-label^="Account"]');
    await page.click('.popover button:has-text("Log out")');
    await page.waitForSelector('form#login');
    await context.close();
    expect(problems).toEqual([]);
  }, 90000);

  it('logging out of the other sessions, then everywhere, from the menu of the account', async () => {
    const laptop = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
    const phone = await browser.newContext({ locale: 'en-US', viewport: { width: 390, height: 800 } });
    context = laptop;
    const here = await open();
    context = phone;
    const there = await open();
    await login(here, 'root@example.com');
    await login(there, 'root@example.com');

    // The others: the phone goes to the login page at its next request; the laptop goes on (and can still write).
    await here.click('button[aria-label^="Account"]');
    await here.click('.popover button:has-text("Log out other sessions")');
    await here.click('.modal button:has-text("Log out the others")');
    await here.waitForSelector('.toast:has-text("Your other sessions are logged out")');
    await there.goto(`${base}#/Book`);
    await there.waitForSelector('form#login');
    await here.click('.sidebar a:has-text("Book")');
    await here.waitForSelector('table.table tbody tr.link');
    await here.click('table.table tbody tr.link >> nth=0');
    await here.waitForSelector('#field-pages');
    await here.fill('#field-pages', '999');
    await here.click('button:has-text("Save and keep editing")');
    await here.waitForSelector('.toast:has-text("Saved")');

    // The sessions of the account, from the phone (logged in again): this one and the laptop's, which it ends.
    await login(there, 'root@example.com');
    await there.click('button[aria-label^="Account"]');
    await there.click('.popover button:has-text("Your sessions")');
    await there.waitForSelector('table.table tbody tr');
    expect(await there.$$eval('table.table tbody tr', (rows) => rows.length)).toBe(2);
    expect(await there.textContent('tr.checked')).toContain('This browser');
    await there.click('table.table tbody tr:not(.checked) button:has-text("End")');
    await there.click('.modal button:has-text("End it")');
    await there.waitForSelector('.toast:has-text("Session ended")');
    await there.waitForFunction(() => document.querySelectorAll('table.table tbody tr').length === 1);
    await here.click('.sidebar a:has-text("Author")');
    await here.waitForSelector('form#login');
    await login(here, 'root@example.com');

    // Everywhere, from the phone: the laptop too.
    await there.click('button[aria-label^="Account"]');
    await there.click('.popover button:has-text("Log out everywhere")');
    await there.click('.modal button:has-text("Log out everywhere")');
    await there.waitForSelector('form#login');
    await here.click('.sidebar a:has-text("Author")');
    await here.waitForSelector('form#login');
    await laptop.close();
    await phone.close();
    expect(problems).toEqual([]);
  }, 60000);

  it('your account: an authenticator app set up with its QR code, a recovery code, a new password', async () => {
    context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
    const page = await open();
    await login(page, 'kim@example.com');
    await page.click('button[aria-label^="Account"]');
    await page.click('.popover button:has-text("Your account")');
    await page.click('button:has-text("Set up an authenticator app")');
    await page.fill('#totp-password-input', PASSWORD);
    await page.click('#totp-password button[type="submit"]');
    await page.waitForSelector('.qr svg');
    await page.click('summary:has-text("Cannot scan it?")');
    const secret = (await page.textContent('#totp-confirm code')).trim();
    await page.fill('#totp-code', '000000');
    await page.click('#totp-confirm button[type="submit"]');
    await page.waitForSelector('#totp-confirm .alert:has-text("Wrong code")');
    await page.fill('#totp-code', auth.totp(secret));
    await page.click('#totp-confirm button[type="submit"]');
    await page.waitForSelector('ol.recovery-codes li');
    const codes = await page.$$eval('ol.recovery-codes li', (items) => items.map((item) => item.textContent.trim()));
    expect(codes).toHaveLength(10);
    await page.click('button:has-text("I have kept them")');
    await page.waitForSelector('p.muted:has-text("10 recovery codes left")');

    // The password changed here; then a new browser logs in with it and a recovery code (the app lost).
    await page.fill('#current-password', PASSWORD);
    await page.fill('#new-password', 'a-new-long-password');
    await page.fill('#repeat-password', 'a-new-long-password');
    await page.click('#password-form button[type="submit"]');
    await page.waitForSelector('.toast:has-text("Password changed")');
    const other = await browser.newContext({ locale: 'en-US' });
    context = other;
    const there = await open();
    await there.goto(base);
    await there.waitForSelector('form#login');
    await there.fill('#username', 'kim@example.com');
    await there.fill('#password', 'a-new-long-password');
    await there.click('form#login button[type="submit"]');
    await there.waitForSelector('#code');
    await there.click('button:has-text("Lost the app? Use a recovery code")');
    await there.fill('#code', codes[0]);
    await there.click('form#login button[type="submit"]');
    await there.waitForSelector('.sidebar');
    await page.reload();
    await page.waitForSelector('p.muted:has-text("9 recovery codes left")');
    await other.close();
    await page.context().close();
    expect(problems).toEqual([]);
  }, 60000);

  it('starts a run from the work: the pipeline, its input as JSON (errors said), later; then the run', async () => {
    context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
    const page = await open();
    await login(page, 'root@example.com');
    await page.goto(`${base}#/_work`);
    await page.click('button:has-text("Start a run")');
    await page.waitForSelector('form#start-run');
    await page.click('#start-run button[type="submit"]');
    await page.waitForSelector('#start-run .error:has-text("Choose a pipeline")');
    await page.selectOption('#run-pipeline', 'approval');
    // Choosing one clears its error.
    expect(await page.$('#start-run .error:has-text("Choose a pipeline")')).toBe(null);
    // The graph of the pipeline: its steps with their blocks; a step moved by hand, and put back.
    await page.waitForSelector('.run-graph .graph .node');
    expect(
      await page.$$eval('.run-graph .node', (nodes) => nodes.map((node) => node.getAttribute('aria-label')))
    ).toEqual(['first: double', 'approve: wait']);
    expect(await page.$$('.react-flow__attribution')).toEqual([]);
    const step = page.locator('.run-graph .node[aria-label="first: double"]');
    const before = await step.boundingBox();
    await page.mouse.move(before.x + 40, before.y + 20);
    await page.mouse.down();
    await page.mouse.move(before.x + 60, before.y + 70, { steps: 5 });
    await page.mouse.up();
    const after = await step.boundingBox();
    expect(Math.round(after.y - before.y)).toBeGreaterThan(20);
    await page.click('.run-graph button[aria-label="Put the steps back"]');
    await page.waitForSelector('.run-graph button[aria-label="Put the steps back"]', { state: 'detached' });
    // A step: its condition and wait in its tooltip; a click shows its definition, another hides it.
    // (moving a step by hand didn't choose it)
    expect(await page.$('.run-step')).toBe(null);
    const approve = '.run-graph .node[aria-label="approve: wait"]';
    expect(await page.getAttribute(approve, 'title')).toBe('approve: wait\nWaits at most: 1h');
    await page.click(approve);
    await page.waitForSelector('.run-step:has-text("approve")');
    expect(await page.textContent('.run-step')).toContain('Waits at most1h');
    expect(await page.textContent('.run-step')).toContain('Afterfirst');
    await page.click(approve);
    await page.waitForSelector('.run-step', { state: 'detached' });
    await page.fill('#run-input', '{ nope');
    await page.click('#start-run button[type="submit"]');
    await page.waitForSelector('#start-run .error:has-text("Not JSON")');
    await page.fill('#run-input', '21');
    await page.check('input[name="when"][value="delay"]');
    await page.fill('#run-delay', 'soon');
    await page.click('#start-run button[type="submit"]');
    await page.waitForSelector('#start-run .error:has-text("A time as 30s")');
    await page.fill('#run-delay', '10m');
    await page.fill('#run-priority', '3');
    await page.click('#start-run button[type="submit"]');
    await page.waitForSelector('.toast:has-text("Started the run")');
    await page.waitForSelector('.graph .node');
    expect(page.url()).toMatch(/#\/_runs\/\d+$/);
    expect(await page.textContent('main')).toContain('scheduled');
    await page.context().close();
    expect(problems).toEqual([]);
  }, 60000);

  it('schedules in the work: run now starts a run of the pipeline, marked by its schedule; its runs by trigger', async () => {
    context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
    const page = await open();
    await login(page, 'root@example.com');
    await page.goto(`${base}#/_work`);
    await page.click('.segmented a:has-text("Schedules")');
    await page.waitForSelector('#schedules tr[data-name="nightly-export"]');
    expect(await page.textContent('#schedules tr[data-name="nightly-export"]')).toContain('cron 0 2 * * *');
    await page.click('#schedules tr[data-name="nightly-export"] button:has-text("Run now")');
    await page.waitForSelector('.toast:has-text("Started the run")');
    await page.waitForSelector('main :text("by the schedule")');
    await queue.runDue();
    await page.goto(`${base}#/_schedules`);
    await page.click('#schedules tr[data-name="nightly-export"] a:has-text("1 run")');
    await page.waitForSelector('.filter-chip:has-text("nightly-export")');
    await page.waitForSelector('table.table tbody tr.link');
    expect(await page.$$eval('table.table tbody tr.link', (rows) => rows.length)).toBe(1);
    await page.context().close();
    expect(problems).toEqual([]);
  }, 60000);

  it('a viewer of one tenant: only its models, fields disabled, no buttons to change them', async () => {
    context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
    const page = await open();
    await login(page, 'eve@example.com');
    await page.waitForSelector('a.card.stat');
    // One tenant, no jobs nor runs, nothing to add.
    expect(await page.textContent('button[aria-label^="Tenant"]')).toContain('ACME Inc');
    expect(
      await page.$$eval('.sidebar .nav-item .label', (labels) => labels.map((label) => label.textContent))
    ).toEqual(['Dashboard', 'Books', 'Authors']);
    await page.click('.sidebar a:has-text("Book")');
    await page.waitForSelector('table.table tbody tr.link');
    expect(await page.$('a:has-text("Add Book")')).toBe(null);
    expect(await page.$('th.check-cell')).toBe(null);
    await page.click('table.table tbody tr.link >> nth=0');
    await page.waitForSelector('#field-title');
    expect(await page.$eval('#field-title', (input) => input.disabled)).toBe(true);
    expect(await page.textContent('.page-head')).toContain('View only');
    expect(await page.$('.form-bar')).toBe(null);
    await context.close();
    expect(problems).toEqual([]);
  }, 60000);
});
