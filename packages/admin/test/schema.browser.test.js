// The editor of the data model page in a browser (Chrome or Edge, driven by playwright-core; skipped without one),
// with a designer of its own here (xufa's is tested in packages/xufa/test/designer.test.js): the models of the designer
// editable, those of code locked; a field added, renamed and typed; a foreign key drawn from a model to another; the
// draft kept in the browser; the changes reviewed and published, and the page waiting for the server.
import fs from 'node:fs';
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

class Customer extends Model {
  static fields = { name: fields.string({ maxLength: 100 }) };
}
class Order extends Model {
  static fields = { title: fields.string({ maxLength: 200 }) };
}

describe.skipIf(!CHROME || !playwright)('the editor of the data model, in a browser', () => {
  let app;
  let browser;
  let base;
  const drafts = [];
  let published = null;

  beforeAll(async () => {
    const db = new Database({ backend: 'memory' }).register(Customer, Order);
    await db.sync();
    const designer = {
      apps: () => [
        {
          app: 'shop',
          file: 'shop/models.yaml',
          spec: { Order: { fields: { title: { type: 'string', maxLength: 200 } } } },
          models: ['Order'],
        },
      ],
      editable: (model) => model === Order,
      pending: () => published,
      async preview(draft) {
        drafts.push(draft);
        return {
          apps: [
            {
              app: 'shop',
              migration: {
                name: '0002_auto',
                file: 'shop/migrations/0002_auto.js',
                operations: [
                  { op: 'renameColumn', table: 'shop_order', from: 'title', to: 'subject' },
                  { op: 'addColumn', table: 'shop_order', column: 'customerId' },
                ],
              },
              risks: [],
            },
          ],
        };
      },
      async publish(draft) {
        drafts.push(draft);
        published = { at: new Date().toISOString(), files: ['shop/models.yaml', 'shop/migrations/0002_orders.js'] };
        return { apps: [], files: published.files };
      },
    };
    app = xufa();
    app.register(admin, { prefix: '/admin', authorize: () => true, models: [Customer, Order], designer });
    await app.listen({ port: 0 });
    base = `http://127.0.0.1:${app.server.address().port}/admin/`;
    browser = await playwright.chromium.launch({ executablePath: CHROME });
  }, 60000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (app) await app.close();
  });

  it('a field added and renamed, a foreign key drawn, the draft kept, reviewed and published', async () => {
    const problems = [];
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', (err) => problems.push(err.message));
    page.on('console', (message) => message.type() === 'error' && problems.push(message.text()));
    await page.goto(`${base}#/_schema`);
    await page.click('button:has-text("Edit")');
    await page.waitForSelector('.entity.editable');
    expect(await page.textContent('.entity.editable .entity-name')).toBe('Order');
    expect(await page.textContent('.entity.locked .entity-name')).toBe('Customer');

    // The field title renamed (the draft remembers what it was), and a field added as text.
    await page.click('.entity[aria-label="The model Order"]');
    await page.waitForSelector('.design-panel');
    const title = page.locator('.design-field').first().locator('input').first();
    await title.fill('subject');
    await title.press('Enter');
    await page.click('button:has-text("Add a field")');
    const added = page.locator('.design-field').nth(1);
    await added.locator('input').first().fill('notes');
    await added.locator('input').first().press('Enter');
    await added.locator('select').first().selectOption('text');

    // A line from Order to Customer: a foreign key customer.
    const from = await page.locator('.react-flow__node[data-id="Order"] .entity-link').boundingBox();
    const to = await page.locator('.react-flow__node[data-id="Customer"] .react-flow__handle-left').boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + 30, to.y + 10, { steps: 12 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForSelector('.design-field input[value="customer"]');
    expect(await page.$$eval('.react-flow__edge', (edges) => edges.length)).toBe(1);

    // The draft outlives the page.
    await page.reload();
    await page.click('button:has-text("Edit (a draft is kept)")');
    await page.click('.entity[aria-label="The model Order"]');
    expect(await page.$$eval('.design-field-row input', (inputs) => inputs.map((input) => input.value))).toEqual([
      'subject',
      'notes',
      'customer',
    ]);

    await page.click('button:has-text("Review the changes")');
    await page.waitForSelector('.design-review .design-ops');
    expect(await page.textContent('.design-review')).toContain('Renames the column shop_order.title to subject');
    expect(drafts[0]).toEqual({
      apps: {
        shop: {
          Order: {
            fields: {
              subject: { type: 'string', maxLength: 200 },
              notes: { type: 'text', null: true },
              customer: { type: 'foreignKey', to: 'Customer', null: true, onDelete: 'setNull' },
            },
          },
        },
      },
      renames: { shop: { models: {}, fields: { Order: { title: 'subject' } } } },
    });
    await page.fill('.design-review input', 'orders');
    await page.click('.design-review button:has-text("Publish")');
    await page.waitForSelector('.toast:has-text("Written: shop/models.yaml, shop/migrations/0002_orders.js")');
    expect(drafts[1].name).toBe('orders');
    // Until the server starts again: the files said, no editing.
    await page.waitForSelector('.alert:has-text("Published: shop/models.yaml")');
    expect(await page.$$('button:has-text("Edit")')).toHaveLength(0);
    await context.close();
    expect(problems).toEqual([]);
  }, 90000);
});
