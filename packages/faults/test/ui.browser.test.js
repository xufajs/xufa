// The page of the faults plugin (/_faults/ui) in a browser (Chrome or Edge as installed, driven by playwright-core;
// skipped without one): the token asked, the targets listed, rules made by the form (filters of names and regular
// expressions), a rule refused by the server, removed, a hang released, a scenario started and stopped, one written on
// the page (not JSON, refused, started), every rule cleared, a wrong token asked again; and no error of a script nor of
// the Content-Security-Policy on the way.
const fs = require('node:fs');
const xufa = require('@xufa/http');
const { Faults, cacheFaults, plugin } = require('..');

const TOKEN = 'a-token-of-the-staging-admin';

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

function targets() {
  const db = new Faults({
    name: 'database',
    operations: ['select', 'insert', 'update'],
    groups: { read: ['select'], write: ['insert', 'update'] },
    filters: { models: 'model' },
  });
  const map = new Map();
  const cache = {
    async get(key) {
      return map.get(key);
    },
    async set(key, value) {
      map.set(key, value);
    },
    async delete(key) {
      map.delete(key);
    },
    async clear() {
      map.clear();
    },
  };
  cache.faults = cacheFaults(cache, 'cache');
  return { db, cache };
}

describe.skipIf(!CHROME || !playwright)('the page of the faults, in a browser', () => {
  let app;
  let browser;
  let page;
  let db;
  let cache;
  let base;
  const problems = [];

  beforeAll(async () => {
    ({ db, cache } = targets());
    app = xufa();
    await app.register(plugin, {
      targets: { db, cache },
      token: TOKEN,
      scenarios: {
        'cache outage': {
          steps: [
            { target: 'cache', kind: 'down', for: '10m' },
            { at: '5m', target: 'db', kind: 'fail' },
          ],
        },
      },
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    base = `http://127.0.0.1:${app.server.address().port}/_faults`;
    browser = await playwright.chromium.launch({ executablePath: CHROME });
    page = await browser.newPage();
    page.on('pageerror', (err) => problems.push(err.message));
    page.on('console', (message) => {
      // The answers 401 and 400 the tests ask for are logged by the browser: not problems.
      if (message.type() === 'error' && !/status of (400|401)/.test(message.text())) problems.push(message.text());
    });
  }, 30000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (app) await app.close();
  });

  it('the token, the targets, rules of the form, refused, removed, released, scenarios, cleared', async () => {
    await page.goto(`${base}/ui`);
    await page.waitForSelector('#token-form:not([hidden])');
    await page.fill('#token', TOKEN);
    await page.click('#token-form button');
    await page.waitForSelector('#main:not([hidden])');
    expect(await page.$$eval('#targets h2', (heads) => heads.map((head) => head.textContent))).toEqual(['db', 'cache']);

    // A fail of the writes of the database, twice.
    await page.selectOption('#target', 'db');
    await page.selectOption('#kind', 'fail');
    await page.check('#operations input[value="write"]');
    await page.fill('#times', '2');
    await page.fill('#message', 'Disk on fire');
    expect(await page.isHidden('[data-kinds="delay"]')).toBe(true);
    await page.click('#rule-form button[type="submit"]');
    await page.waitForFunction(
      () => document.querySelectorAll('#targets .card')[0].querySelectorAll('tbody tr').length === 1
    );
    expect([db.rules[0].kind, db.rules[0].times, [...db.rules[0].operations]]).toEqual([
      'fail',
      2,
      ['insert', 'update'],
    ]);

    // A delay of the cache, its keys by name and by a regular expression.
    await page.selectOption('#target', 'cache');
    await page.selectOption('#kind', 'delay');
    await page.fill('#filters input[data-filter="keys"]', 'user:, /^session-\\d+$/');
    await page.fill('#ms', '250');
    await page.fill('#times', '');
    await page.click('#rule-form button[type="submit"]');
    await page.waitForFunction(
      () => document.querySelectorAll('#targets .card')[1].querySelectorAll('tbody tr').length === 1
    );
    expect([cache.faults.rules[0].ms, String(cache.faults.rules[0].options.keys)]).toEqual([
      250,
      'user:,/^session-\\d+$/',
    ]);

    // Refused by the server: its message shown, nothing made.
    await page.selectOption('#kind', 'fail');
    await page.fill('#for', 'forever');
    await page.click('#rule-form button[type="submit"]');
    await page.waitForSelector('#form-error:not([hidden])');
    expect(await page.textContent('#form-error')).toMatch(/is a duration/);
    expect(cache.faults.rules).toHaveLength(1);
    await page.fill('#for', '');

    // Removed with its button.
    await page.click('#targets .card:nth-child(2) button.danger');
    await page.waitForFunction(() => document.querySelectorAll('#targets .card')[1].querySelector('.none') !== null);
    expect(cache.faults.rules).toEqual([]);

    // A hang: its Release button.
    await page.selectOption('#target', 'db');
    await page.selectOption('#kind', 'hang');
    await page.click('#rule-form button[type="submit"]');
    await page.waitForSelector('#targets button:text("Release")');

    // A scenario: started, its rule marked, stopped.
    await page.click('#scenarios button:text("Start")');
    await page.waitForSelector('.scenario-tag');
    expect(cache.faults.rules.map((rule) => rule.kind)).toEqual(['down']);
    await page.click('#scenarios button:text("Stop")');
    await page.waitForFunction(() => document.querySelector('#scenarios .run.stopped') !== null);
    expect(cache.faults.rules).toEqual([]);

    // A scenario written on the page: not JSON, refused by the server (its message), then started; the editor stays
    // open through the refreshes.
    await page.click('#scenarios .scenario-editor summary');
    await page.fill('#scenario-json', '{ "name": ');
    await page.click('#scenario-start');
    await page.waitForSelector('#scenario-error:not([hidden])');
    expect(await page.textContent('#scenario-error')).toMatch(/Not JSON/);
    const written = (target) =>
      JSON.stringify({ name: 'mine', steps: [{ target, kind: 'delay', options: { ms: 5 } }], duration: '1m' });
    await page.fill('#scenario-json', written('nowhere'));
    await page.click('#scenario-start');
    await page.waitForFunction(() => /no target nowhere/.test(document.querySelector('#scenario-error').textContent));
    await page.fill('#scenario-json', written('cache'));
    await page.click('#scenario-start');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('#scenarios .run strong')].some((name) => name.textContent === 'mine')
    );
    expect(cache.faults.rules.map((rule) => rule.kind)).toEqual(['delay']);
    expect(await page.isHidden('#scenario-error')).toBe(true);
    await page.waitForTimeout(2500); // a refresh
    expect(await page.$eval('#scenarios .scenario-editor', (details) => details.open)).toBe(true);
    expect(await page.inputValue('#scenario-json')).toBe(written('cache'));

    // Every rule cleared (the confirm answered yes).
    page.once('dialog', (dialog) => dialog.accept());
    await page.click('#clear-all');
    await page.waitForFunction(() => document.querySelectorAll('#targets .none').length === 2);
    expect([db.rules.length, cache.faults.rules.length]).toEqual([0, 0]);

    // A wrong token: asked again.
    await page.evaluate(() => sessionStorage.setItem('xufa-faults-token:/_faults', 'a-wrong-token-of-sixteen'));
    await page.reload();
    await page.waitForSelector('#token-form:not([hidden])');

    expect(problems).toEqual([]);
  }, 60000);

  it('presets of the form (kept in the browser), and the theme switched and kept', async () => {
    await page.goto(`${base}/ui`);
    await page.waitForSelector('#token-form:not([hidden])');
    await page.fill('#token', TOKEN);
    await page.click('#token-form button');
    await page.waitForSelector('#main:not([hidden])');
    // The form as a preset: a delay of the reads of the users in the cache.
    await page.selectOption('#target', 'cache');
    await page.selectOption('#kind', 'delay');
    await page.check('#operations input[value="read"]');
    await page.fill('#filters input[data-filter="keys"]', 'user:');
    await page.fill('#ms', '300');
    page.once('dialog', (dialog) => dialog.accept('slow users'));
    await page.click('#save-preset');
    expect(await page.$$eval('#preset option', (options) => options.map((option) => option.value))).toEqual([
      '',
      'slow users',
    ]);
    // Another form; the preset brings it back.
    await page.selectOption('#target', 'db');
    await page.selectOption('#kind', 'fail');
    await page.selectOption('#preset', 'slow users');
    expect(await page.$eval('#target', (select) => select.value)).toBe('cache');
    expect(await page.$eval('#kind', (select) => select.value)).toBe('delay');
    expect(await page.$eval('#filters input[data-filter="keys"]', (input) => input.value)).toBe('user:');
    expect(await page.$eval('#ms', (input) => input.value)).toBe('300');
    expect(await page.isChecked('#operations input[value="read"]')).toBe(true);
    // Still there after a reload; then deleted.
    await page.reload();
    await page.waitForSelector('#main:not([hidden])');
    expect(await page.$$eval('#preset option', (options) => options.length)).toBe(2);
    await page.selectOption('#preset', 'slow users');
    await page.click('#delete-preset');
    expect(await page.$$eval('#preset option', (options) => options.length)).toBe(1);
    // The theme: switched, and kept after a reload.
    const before = await page.evaluate(() => document.documentElement.dataset.theme || null);
    await page.click('#theme');
    const after = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(['light', 'dark']).toContain(after);
    expect(after).not.toBe(before);
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(after);
    expect(problems).toEqual([]);
  }, 60000);
});
