// The forms and lists of Django's ModelAdmin in a browser (Chrome or Edge, driven by playwright-core; skipped without
// one): a many-to-many field chosen with chips and its combobox, saved; fieldsets with fields on one line and a group
// that opens; columns of a method and of a path; with no error of a script on the way.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import xufa from '@xufa/http';
import { Database, Model, fields } from '@xufa/orm';
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

class Genre extends Model {
  static fields = {
    name: fields.string({ maxLength: 100 }),
    featured: fields.boolean({ default: false }),
    shelf: fields.string({
      choices: [
        ['a', 'Aisle A'],
        ['b', 'Aisle B'],
      ],
      default: 'a',
    }),
  };

  toString() {
    return this.name;
  }
}

class Writer extends Model {
  static fields = { lastName: fields.string({ maxLength: 100 }), firstName: fields.string({ maxLength: 100 }) };

  toString() {
    return `${this.lastName}, ${this.firstName}`;
  }
}

class Novel extends Model {
  static fields = {
    title: fields.string({ maxLength: 200 }),
    writer: fields.foreignKey(() => Writer, { null: true }),
    isbn: fields.string({ maxLength: 13, label: 'ISBN' }),
    pages: fields.integer({ null: true }),
    genre: fields.manyToMany(() => Genre, { help: 'Select a genre for this book' }),
  };

  async displayGenre() {
    return (await this.genre.all()).map((genre) => genre.name).join(', ');
  }

  toString() {
    return this.title;
  }
}
Novel.prototype.displayGenre.label = 'Genre';

// Permissions picked from those of the admin's models (as those of AbstractGroup of @xufa/auth).
class Crew extends Model {
  static fields = {
    name: fields.string({ maxLength: 100 }),
    permissions: fields.json({ default: () => [], widget: 'permissions' }),
  };
}

describe.skipIf(!CHROME || !playwright)('the forms of the admin, in a browser', () => {
  let app;
  let browser;
  let base;
  const problems = [];
  const shots = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-admin-forms-'));

  beforeAll(async () => {
    // With an audit log: the history of objects, and the recent actions.
    const db = new Database({ backend: 'memory', audit: true }).register(Genre, Writer, Novel, Crew);
    await db.sync();
    for (const name of ['Fantasy', 'Poetry', 'Drama']) await Genre.objects.create({ name });
    const ursula = await Writer.objects.create({ lastName: 'Le Guin', firstName: 'Ursula' });
    const earthsea = await Novel.objects.create({ title: 'Earthsea', isbn: '9780000000001', writerId: ursula.pk });
    await earthsea.genre.set([1]);
    await Crew.objects.create({ name: 'Editors', permissions: ['Novel.view'] });
    app = xufa();
    app.register(admin, {
      prefix: '/admin',
      authorize: () => true,
      models: [
        [
          Novel,
          {
            list: ['title', 'writer__lastName', 'displayGenre'],
            fieldsets: [
              [null, { fields: ['title', ['isbn', 'pages']] }],
              ['Shelving', { fields: ['writer', 'genre'], description: 'Who wrote it, and where it goes' }],
            ],
          },
        ],
        // Booleans and choices changed in the rows of its list (list_editable).
        [Genre, { list: ['name', 'featured', 'shelf'], editable: ['featured', 'shelf'] }],
        // Its novels edited in rows (TabularInline).
        [Writer, { inlines: [{ relation: 'novelSet', fields: ['title', 'isbn', 'pages'] }] }],
        Crew,
      ],
    });
    await app.listen({ port: 0 });
    base = `http://127.0.0.1:${app.server.address().port}/admin/`;
    browser = await playwright.chromium.launch({ executablePath: CHROME });
  }, 60000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (app) await app.close();
    if (!process.env.KEEP_SHOTS) fs.rmSync(shots, { recursive: true, force: true });
    else console.log('screenshots in', shots);
  });

  it('columns of a method and a path; fieldsets; a many-to-many chosen and saved', async () => {
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', (err) => problems.push(err.message));
    page.on('console', (message) => message.type() === 'error' && problems.push(message.text()));
    await page.goto(`${base}#/Novel`);
    await page.waitForSelector('table.table tbody tr.link');
    const heads = await page.$$eval('table.table thead th', (cells) => cells.map((cell) => cell.textContent.trim()));
    expect(heads.filter(Boolean)).toEqual(['Title', 'Writer last name', 'Genre']);
    expect(await page.textContent('table.table tbody tr.link')).toContain('Le Guin');
    expect(await page.textContent('table.table tbody tr.link')).toContain('Fantasy');
    await page.screenshot({ path: path.join(shots, 'list.png') });

    await page.goto(`${base}#/Novel/1`);
    await page.waitForSelector('section.fieldset h3:has-text("Shelving")');
    // isbn and pages on one line.
    const row = await page.$$eval('.form-row .field label', (labels) =>
      labels.map((label) => label.textContent.trim())
    );
    // (A label has the mark of required and the count of characters after its text.)
    expect(row.map((text) => text.split(/[*\d]/)[0])).toEqual(['ISBN', 'Pages']);
    expect(await page.textContent('.chips')).toContain('Fantasy');
    // Add Poetry, take Fantasy out, save.
    await page.click('.many .combo-box');
    await page.click('.popover .option:has-text("Poetry")');
    await page.click('.chip:has-text("Fantasy") button');
    await page.screenshot({ path: path.join(shots, 'form.png'), fullPage: true });
    await page.click('button:has-text("Save and keep editing")');
    await page.waitForSelector('.toast:has-text("Saved")');
    const novel = await Novel.objects.get({ pk: 1 });
    expect((await novel.genre.all()).map(String)).toEqual(['Poetry']);
    await context.close();
    expect(problems).toEqual([]);
  }, 60000);

  it('permissions picked: by their labels, a model all, a pattern typed; saved', async () => {
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', (err) => problems.push(err.message));
    page.on('console', (message) => message.type() === 'error' && problems.push(message.text()));
    await page.goto(`${base}#/Crew/1`);
    await page.waitForSelector('.chip:has-text("Can view novel")');
    await page.click('.many .combo-box');
    const find = page.locator('.popover input');
    await find.fill('add genre');
    await page.click('.popover .option:has-text("Can add genre")');
    // A model's all: offered by its pattern too; not added twice.
    await find.fill('Writer.*');
    expect(await page.$$eval('.popover .option', (items) => items.map((item) => item.textContent))).toEqual([
      'Writers · Everything on WritersWriter.*',
    ]);
    await page.press('.popover input', 'Enter');
    // A permission of no model here: as typed.
    await find.fill('Report.export');
    await page.click('.popover .option:has-text("Add “Report.export”")');
    await page.screenshot({ path: path.join(shots, 'permissions.png'), fullPage: true });
    await page.click('.chip:has-text("Can view novel") button');
    await page.click('button:has-text("Save and keep editing")');
    await page.waitForSelector('.toast:has-text("Saved")');
    expect((await Crew.objects.get({ pk: 1 })).permissions).toEqual(['Genre.add', 'Writer.*', 'Report.export']);
    await context.close();
    expect(problems).toEqual([]);
  }, 60000);

  it('the data model: a box for each model, the lines of its relations, the details of one', async () => {
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', (err) => problems.push(err.message));
    page.on('console', (message) => message.type() === 'error' && problems.push(message.text()));
    await page.goto(`${base}#/_schema`);
    await page.waitForSelector('.entity');
    const names = await page.$$eval('.entity .entity-name', (items) => items.map((item) => item.textContent).sort());
    expect(names).toEqual(['Crew', 'Genre', 'Novel', 'Writer']);
    // Novel to Writer (a foreign key) and to Genre (many-to-many).
    expect(await page.$$eval('.react-flow__edge', (items) => items.length)).toBe(2);
    expect(await page.textContent('.react-flow__edge.many')).toContain('n:m');
    await page.click('.entity[aria-label="The model Novel"]');
    await page.waitForSelector('.erd-panel');
    expect(await page.textContent('.erd-panel')).toContain('6 fields');
    expect(await page.textContent('.erd-panel')).toContain('Select a genre for this book');
    // A search dims the others.
    await page.fill('.erd-search', 'isbn');
    expect(
      await page.$$eval('.entity.dimmed .entity-name', (items) => items.map((item) => item.textContent).sort())
    ).toEqual(['Crew', 'Genre', 'Writer']);
    await page.screenshot({ path: path.join(shots, 'schema.png') });
    await page.click('.erd-panel a:has-text("Open its list")');
    await page.waitForSelector('table.table tbody tr.link');
    await context.close();
    expect(problems).toEqual([]);
  }, 60000);

  it('list_editable: a switch and a select saved as they change; columns hidden, kept in the browser', async () => {
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', (err) => problems.push(err.message));
    await page.goto(`${base}#/Genre`);
    await page.waitForSelector('table.table tbody tr.link');
    const saved = () => page.waitForResponse((res) => res.request().method() === 'PATCH' && res.ok());
    await Promise.all([saved(), page.click('input[id="edit-1-featured"] + .track')]);
    await Promise.all([saved(), page.selectOption('select[aria-label="Shelf of Fantasy"]', { label: 'Aisle B' })]);
    const fantasy = await Genre.objects.get({ pk: 1 });
    expect([fantasy.featured, fantasy.shelf]).toEqual([true, 'b']);
    // The row was not opened by the clicks.
    expect(page.url()).toMatch(/#\/Genre$/);
    await page.click('button:has-text("Columns")');
    await page.click('label.check-option:has-text("Shelf") input');
    await page.keyboard.press('Escape');
    let heads = await page.$$eval('table.table thead th', (cells) => cells.map((cell) => cell.textContent.trim()));
    expect(heads.filter(Boolean)).toEqual(['Name', 'Featured']);
    await page.screenshot({ path: path.join(shots, 'editable.png') });
    await page.reload();
    await page.waitForSelector('table.table tbody tr.link');
    heads = await page.$$eval('table.table thead th', (cells) => cells.map((cell) => cell.textContent.trim()));
    expect(heads.filter(Boolean)).toEqual(['Name', 'Featured']);
    await context.close();
    expect(problems).toEqual([]);
  }, 60000);

  it('the history of an object and the recent actions of the dashboard', async () => {
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', (err) => problems.push(err.message));
    await page.goto(`${base}#/Writer/1`);
    await page.waitForSelector('main form input#field-firstName');
    await page.fill('#field-firstName', 'Ursula K.');
    await page.click('button:has-text("Save and keep editing")');
    await page.waitForSelector('.history li:has-text("Changed")');
    expect(await page.textContent('.history')).toContain('First name');
    expect(await page.textContent('.history')).toContain('Ursula K.');
    await page.goto(`${base}#/`);
    await page.waitForSelector('h2:has-text("Recent actions")');
    await page.waitForSelector('.history li:has-text("Writer")');
    await page.screenshot({ path: path.join(shots, 'recent.png'), fullPage: true });
    await context.close();
    expect(problems).toEqual([]);
  }, 60000);

  it('a new object with its inline rows: required fields first, then saved together', async () => {
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', (err) => problems.push(err.message));
    await page.goto(`${base}#/Writer/new`);
    await page.waitForSelector('#inline-novelSet-0-title');
    await page.fill('#field-lastName', 'Woolf');
    await page.fill('#field-firstName', 'Virginia');
    await page.fill('#inline-novelSet-0-title', 'The Waves');
    await page.click('button:has-text("Add another Novel")');
    await page.fill('#inline-novelSet-1-title', 'Orlando');
    await page.fill('#inline-novelSet-1-isbn', '9780000000010');
    // The ISBN of the first row is missing: nothing is sent.
    await page.click('button[type="submit"]:has-text("Save")');
    await page.waitForSelector('.inline-table tr.invalid-row');
    expect(await Writer.objects.filter({ lastName: 'Woolf' }).exists()).toBe(false);
    await page.fill('#inline-novelSet-0-isbn', '9780000000011');
    await page.click('button[type="submit"]:has-text("Save")');
    await page.waitForSelector('.toast:has-text("Saved Woolf")');
    const woolf = await Writer.objects.get({ lastName: 'Woolf' });
    expect((await Novel.objects.filter({ writerId: woolf.pk }).orderBy('title')).map(String)).toEqual([
      'Orlando',
      'The Waves',
    ]);
    await context.close();
    expect(problems).toEqual([]);
  }, 60000);

  it('in the language of the browser: Spanish words, dates and numbers', async () => {
    const context = await browser.newContext({ locale: 'es-ES', viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', (err) => problems.push(err.message));
    await page.goto(`${base}#/`);
    await page.waitForSelector('h1:has-text("Panel")');
    expect(await page.getAttribute('html', 'lang')).toBe('es');
    expect(await page.textContent('.sidebar')).toContain('Modelos');
    expect(await page.textContent('main')).toContain('Acciones recientes');
    await page.goto(`${base}#/Novel`);
    await page.waitForSelector('a:has-text("Añadir Novel")');
    expect(await page.textContent('.pager')).toContain('Filas');
    await page.goto(`${base}#/Novel/1`);
    await page.waitForSelector('button:has-text("Guardar y seguir editando")');
    await page.waitForSelector('h2:has-text("Historial")');
    await page.screenshot({ path: path.join(shots, 'spanish.png'), fullPage: true });
    await context.close();
    expect(problems).toEqual([]);
  }, 60000);

  it('an inline: rows changed, one added, one deleted, saved at once; errors by row', async () => {
    const tehanu = await Novel.objects.create({ title: 'Tehanu', isbn: '9780000000002', writerId: 1 });
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', (err) => problems.push(err.message));
    await page.goto(`${base}#/Writer/1`);
    await page.waitForSelector('.inline-table tbody tr');
    expect(await page.$$eval('.inline-table tbody tr', (rows) => rows.length)).toBe(3); // two novels, one empty row
    // (Newest first: Tehanu, then Earthsea.)
    await page.fill('#inline-novelSet-1-pages', '183');
    await page.check(`input[aria-label="Delete novel ${tehanu.pk}"]`);
    await page.fill('#inline-novelSet-2-title', 'The Farthest Shore');
    // The ISBN of the new row is missing: its error, in its row, and nothing saved.
    await page.click('button:has-text("Save Novel")');
    await page.waitForSelector('.inline-table tr.invalid-row');
    expect(await Novel.objects.filter({ writerId: 1 }).count()).toBe(2);
    await page.fill('#inline-novelSet-2-isbn', '9780000000003');
    await page.screenshot({ path: path.join(shots, 'inline.png'), fullPage: true });
    await page.click('button:has-text("Save Novel")');
    await page.waitForSelector('.toast:has-text("2 saved, 1 deleted")');
    const novels = await Novel.objects.filter({ writerId: 1 }).orderBy('title');
    expect(novels.map((novel) => [novel.title, novel.pages])).toEqual([
      ['Earthsea', 183],
      ['The Farthest Shore', null],
    ]);
    await context.close();
    expect(problems).toEqual([]);
  }, 60000);
});
