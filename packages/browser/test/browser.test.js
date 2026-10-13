// @xufa/browser in Chrome or Edge as installed (CHROME gives another; skipped without one): selectors, actions that
// wait for their element, reading, waiting, navigation, events, contexts and screenshots.
import http from 'node:http';
import { chromium, findBrowser, TimeoutError } from '../index.js';

const PAGES = {
  '/': `<!doctype html><html lang="en"><title>Books</title>
<main>
  <h1>Books</h1>
  <ul id="books"><li class="book">Dune <button class="edit">Edit</button></li><li class="book">Emma <button class="edit">Edit</button></li></ul>
  <p id="out"></p>
  <nav><a href="#/next" role="link">Next page</a><button aria-label="Close the panel">x</button></nav>
  <label for="q">Search</label><input id="q">
  <textarea id="notes"></textarea>
  <input id="when" type="date">
  <div id="editable" contenteditable="true">old</div>
  <select id="shelf"><option value="a">Aisle A</option><option value="b">Aisle B</option></select>
  <label><input type="checkbox" id="done"> Done</label>
  <button id="disabled" disabled>Disabled</button>
  <div id="hidden" style="display:none">Hidden</div>
  <form id="form"><input id="name"><button>Send</button></form>
  <div id="drag" style="position:absolute;left:600px;top:20px;width:40px;height:40px;background:#c33"></div>
</main>
<script>
const out = (text) => { document.getElementById('out').textContent = text; };
document.querySelectorAll('.edit').forEach((b, i) => b.addEventListener('click', () => out('edit ' + i)));
document.getElementById('q').addEventListener('input', (e) => out('q=' + e.target.value));
document.getElementById('form').addEventListener('submit', (e) => { e.preventDefault(); out('sent ' + document.getElementById('name').value); });
let start = null;
const drag = document.getElementById('drag');
drag.addEventListener('pointerdown', (e) => { start = [e.clientX, e.clientY]; });
addEventListener('pointerup', (e) => { if (start) out('dragged ' + Math.round(e.clientX - start[0]) + ',' + Math.round(e.clientY - start[1])); start = null; });
</script>`,
  '/late': `<!doctype html><button id="later" style="display:none">Later</button><p id="out"></p>
<div id="cover" style="position:fixed;inset:0;background:rgba(0,0,0,.2)"></div>
<script>
setTimeout(() => { document.getElementById('later').style.display = ''; }, 150);
setTimeout(() => { document.getElementById('cover').remove(); }, 300);
document.getElementById('later').addEventListener('click', () => { document.getElementById('out').textContent = 'clicked'; });
</script>`,
  '/events': `<!doctype html><script>
console.log('a log', 1);
console.error('an error');
setTimeout(() => { throw new TypeError('boom'); }, 10);
</script><img src="/missing.png">`,
  '/dialogs': `<!doctype html><p id="out"></p><button id="ask" onclick="document.getElementById('out').textContent = String(prompt('Name?', 'x'))">Ask</button>
<button id="confirm" onclick="document.getElementById('out').textContent = String(confirm('Sure?'))">Confirm</button>`,
  '/fetch': `<!doctype html><button id="go" onclick="fetch('/api', { method: 'PATCH', body: '{}' })">Go</button>`,
  '/tall': `<!doctype html><div style="height:3000px">tall</div>`,
  '/storage': `<!doctype html><p>storage</p>`,
};

const server = http.createServer((request, response) => {
  if (request.url === '/api') {
    response.writeHead(200, { 'content-type': 'application/json', 'x-kind': 'api' });
    response.end('{"ok":true}');
    return;
  }
  const page = PAGES[request.url.split('?')[0]];
  response.writeHead(page ? 200 : 404, { 'content-type': 'text/html' });
  response.end(page ?? 'not here');
});

describe.skipIf(!findBrowser())('@xufa/browser, in Chrome or Edge', () => {
  let browser;
  let base;
  let context;
  let page;

  beforeAll(async () => {
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    server.close();
  });

  beforeEach(async () => {
    context = await browser.newContext({ locale: 'es-ES', viewport: { width: 900, height: 700 } });
    page = await context.newPage();
    page.setDefaultTimeout(3000);
  });

  afterEach(async () => {
    await context.close();
  });

  it('selectors: CSS, :has-text, :text, text=, role=, >>, nth=, :not(:has-text), lists and :visible', async () => {
    await page.goto(`${base}/`);
    const texts = (selector) => page.$$eval(selector, (elements) => elements.map((element) => element.textContent.trim()));
    expect(await texts('li:has-text("emma") button')).toEqual(['Edit']);
    expect(await texts('li.book:not(:has-text("Dune"))')).toEqual(['Emma Edit']);
    expect(await texts(':text("Next")')).toEqual(['Next page']);
    expect(await texts('text=next page')).toEqual(['Next page']);
    expect(await texts('text="Next"')).toEqual([]);
    expect(await texts('role=button[name="Close the panel"]')).toEqual(['x']);
    expect(await texts('role=link[name="next"]')).toEqual(['Next page']);
    expect(await texts('#books >> .edit >> nth=1')).toEqual(['Edit']);
    expect(await page.$$eval('#books >> li >> nth=-1', (elements) => elements[0].textContent)).toContain('Emma');
    expect(await texts('h1, #out')).toEqual(['Books', '']);
    expect(await page.$$eval('div:visible', (elements) => elements.some((element) => element.id === 'hidden'))).toBe(false);
    expect(await page.$('#nowhere')).toBe(null);
    expect(await page.$$('li')).toHaveLength(2);
  });

  it('actions: click, fill (inputs, dates, contenteditable), select, check, press, keyboard and mouse', async () => {
    await page.goto(`${base}/`);
    await page.click('li:has-text("Emma") button');
    expect(await page.textContent('#out')).toBe('edit 1');
    await page.fill('#q', 'hola');
    expect(await page.textContent('#out')).toBe('q=hola');
    await page.fill('#q', '');
    expect(await page.inputValue('#q')).toBe('');
    await page.fill('#notes', 'two\nlines');
    expect(await page.inputValue('#notes')).toBe('two\nlines');
    await page.fill('#when', '2026-10-12');
    expect(await page.inputValue('#when')).toBe('2026-10-12');
    await page.fill('#editable', 'new');
    expect(await page.textContent('#editable')).toBe('new');
    expect(await page.selectOption('#shelf', { label: 'Aisle B' })).toEqual(['b']);
    expect(await page.selectOption('#shelf', 'a')).toEqual(['a']);
    await page.check('#done');
    expect(await page.isChecked('#done')).toBe(true);
    await page.uncheck('#done');
    expect(await page.isChecked('#done')).toBe(false);
    await page.click('#name');
    await page.keyboard.type('Ada');
    await page.keyboard.press('Enter');
    expect(await page.textContent('#out')).toBe('sent Ada');
    await page.fill('#name', 'Grace');
    await page.press('#name', 'Enter');
    expect(await page.textContent('#out')).toBe('sent Grace');
    const box = await page.locator('#drag').boundingBox();
    await page.mouse.move(box.x + 10, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 60, box.y + 40, { steps: 5 });
    await page.mouse.up();
    expect(await page.textContent('#out')).toBe('dragged 50,30');
  });

  it('actions wait for their element: shown later, then no longer covered', async () => {
    await page.goto(`${base}/late`);
    await page.click('#later');
    expect(await page.textContent('#out')).toBe('clicked');
  });

  it('a disabled element, or one that never comes, fails at the timeout with the line of the call', async () => {
    await page.goto(`${base}/`);
    const error = await page.click('#disabled', { timeout: 300 }).catch((err) => err);
    expect(error).toBeInstanceOf(TimeoutError);
    expect(error.message).toMatch(/^page\.click\("#disabled"\): Timeout 300ms exceeded \(disabled\), at http/);
    expect(error.stack).toContain('browser.test.js');
    await expect(page.waitForSelector('#nowhere', { timeout: 200 })).rejects.toThrow(/Timeout 200ms exceeded/);
  });

  it('locators: chains, first, nth, filter, count; strict when they act', async () => {
    await page.goto(`${base}/`);
    const books = page.locator('li.book');
    expect(await books.count()).toBe(2);
    expect((await books.first().textContent()).trim()).toBe('Dune Edit');
    expect(await books.nth(1).locator('button').getAttribute('class')).toBe('edit');
    expect(await page.locator('li', { hasText: 'emma' }).count()).toBe(1);
    expect(await books.filter({ hasText: /^Dune/ }).count()).toBe(1);
    await books.nth(0).locator('button').click();
    expect(await page.textContent('#out')).toBe('edit 0');
    await expect(page.locator('.edit').click({ timeout: 200 })).rejects.toThrow(/strict: 2 elements/);
  });

  it('waiting: states of selectors, functions, responses (with their requests)', async () => {
    await page.goto(`${base}/late`);
    expect(await page.waitForSelector('#later', { state: 'attached' })).not.toBe(null);
    await page.waitForSelector('#later');
    await page.waitForSelector('#cover', { state: 'detached' });
    await page.waitForFunction(() => !document.getElementById('cover'));
    await page.goto(`${base}/fetch`);
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.request().method() === 'PATCH' && res.ok()),
      page.click('#go'),
    ]);
    expect([response.status(), response.headers()['x-kind'], await response.json()]).toEqual([200, 'api', { ok: true }]);
  });

  it('navigation: responses, the same document, reload, url; the locale and the viewport of the context', async () => {
    const response = await page.goto(`${base}/`);
    expect(response.status()).toBe(200);
    expect(await page.goto(`${base}/#/next`)).toBe(null);
    expect(page.url()).toBe(`${base}/#/next`);
    expect((await page.reload()).status()).toBe(200);
    expect(await page.title()).toBe('Books');
    expect(await page.evaluate(() => [navigator.language, innerWidth, innerHeight])).toEqual(['es-ES', 900, 700]);
    expect((await page.goto(`${base}/nowhere`)).status()).toBe(404);
  });

  it('events: console messages, errors of the page, resources that fail; dialogs, dismissed when no one listens', async () => {
    const messages = [];
    const errors = [];
    page.on('console', (message) => messages.push([message.type(), message.text()]));
    page.on('pageerror', (err) => errors.push([err.name, err.message]));
    await page.goto(`${base}/events`);
    await page.waitForTimeout(100);
    expect(messages).toContainEqual(['log', 'a log 1']);
    expect(messages).toContainEqual(['error', 'an error']);
    expect(messages.some(([type, text]) => type === 'error' && /404/.test(text))).toBe(true);
    expect(errors).toEqual([['TypeError', 'boom']]);
    await page.goto(`${base}/dialogs`);
    page.once('dialog', (dialog) => dialog.accept(`${dialog.message()} Ada`));
    await page.click('#ask');
    expect(await page.textContent('#out')).toBe('Name? Ada');
    await page.click('#confirm');
    expect(await page.textContent('#out')).toBe('false');
  });

  it('contexts keep their storage apart; a page of browser.newPage closes its context', async () => {
    await page.goto(`${base}/storage`);
    await page.evaluate(() => localStorage.setItem('k', 'one'));
    const other = await browser.newPage();
    await other.goto(`${base}/storage`);
    expect(await other.evaluate(() => localStorage.getItem('k'))).toBe(null);
    const otherContext = other.context();
    await other.close();
    expect(otherContext.closed).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('k'))).toBe('one');
  });

  it('screenshots: PNG, of the viewport or the whole page', async () => {
    await page.goto(`${base}/tall`);
    const viewport = await page.screenshot();
    const full = await page.screenshot({ fullPage: true });
    expect(viewport.subarray(1, 4).toString()).toBe('PNG');
    expect(full.readUInt32BE(20)).toBeGreaterThan(viewport.readUInt32BE(20));
  });
});
