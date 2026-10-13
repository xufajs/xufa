// The editor of books of rules in a browser (Chrome or Edge, driven by @xufa/browser; skipped without one): the list,
// a book's sheets as a grid with its tables outlined, a cell typed (the messages of its tests as it changes), a table
// tried with the sheets being edited, the test fixed, and a new version saved.
import fs from 'node:fs';
import xufa from '@xufa/http';
import { Database } from '@xufa/orm';
import { RuleStore } from '@xufa/rules';
import { admin } from '../index.js';
import { chromium, findBrowser } from '@xufa/browser';

// Chrome or Edge as installed (CHROME gives another), driven by @xufa/browser.
const CHROME = findBrowser();

const SHEETS = [
  {
    name: 'RULES',
    rows: [
      ['Rules Float Premium(String plan)', null],
      ['C1', 'RET'],
      ['plan', null],
      ['String', 'Float'],
      ['basic', 100],
      ['premium', 200],
      [null, null],
      ['Test Premium PremiumTests', null],
      ['plan', 'RET'],
      ['basic', 100],
    ],
  },
];

describe.skipIf(!CHROME)('the editor of books of rules, in a browser', () => {
  let app;
  let browser;
  let base;
  let rules;

  beforeAll(async () => {
    const db = new Database({ backend: 'memory' });
    await db.connect();
    rules = new RuleStore(db);
    await rules.sync();
    await rules.save('pricing', { sheets: SHEETS }, { comment: 'first' });
    app = xufa();
    app.register(admin, { prefix: '/admin', authorize: () => true, models: [], rules });
    await app.listen({ port: 0 });
    base = `http://127.0.0.1:${app.server.address().port}/admin/`;
    browser = await chromium.launch({ executablePath: CHROME });
  }, 60000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (app) await app.close();
  });

  it('a cell typed, its test failing then fixed, a table tried, and a new version saved', async () => {
    const problems = [];
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1500, height: 950 } });
    const page = await context.newPage();
    page.on('pageerror', (err) => problems.push(err.message));
    page.on('console', (message) => message.type() === 'error' && problems.push(message.text()));
    await page.goto(`${base}#/_rules`);
    await page.click('#rules a:has-text("pricing")');
    await page.waitForSelector('.sheet-grid');
    expect(await page.$$eval('.table-label', (labels) => labels.map((label) => label.textContent))).toEqual([
      'Rules · Premium',
      'Test · PremiumTests',
    ]);
    expect(await page.textContent('.rule-ok')).toContain('Every test passes');

    // B5 (the premium of basic) typed: the test of the book fails, and says so.
    const cell = (ref) => {
      const column = ref.charCodeAt(0) - 65;
      const row = Number(ref.slice(1));
      return page.locator(`.sheet-grid tbody tr:nth-child(${row}) td:nth-child(${column + 2})`);
    };
    await cell('B5').click();
    await page.keyboard.type('110');
    await page.keyboard.press('Enter');
    expect(await cell('B5').textContent()).toBe('110');
    await page.waitForSelector('.rule-messages li:has-text("Expected 100 but got 110")');
    expect(await page.textContent('.page-head')).toContain('Not saved');

    // The table tried with the sheets as they are now.
    await page.click('button[role="tab"]:has-text("Try a table")');
    await page.fill('#rule-try-args', '["basic"]');
    await page.click('.rule-panel button:has-text("Run")');
    await page.waitForSelector('.rule-result');
    expect(JSON.parse(await page.textContent('.rule-result'))).toBe(110);

    // The test fixed (B10), and the book saved as version 2.
    await page.click('button[role="tab"]:has-text("Messages")');
    await cell('B10').click();
    await page.keyboard.type('110');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.rule-ok');
    await page.fill('.rule-toolbar .input', 'raise basic');
    await page.click('button:has-text("Save a new version")');
    await page.waitForSelector('text=Version 2 of pricing kept');
    expect(await rules.call('pricing', 'Premium', 'basic')).toBe(110);
    expect((await rules.versions('pricing'))[0]).toMatchObject({
      version: 2,
      comment: 'raise basic',
      status: 'active',
    });
    expect(problems).toEqual([]);
    await context.close();
  }, 60000);

  it('tables found and analysed, rows of tests, a call traced on the grid, versions compared, a new table', async () => {
    const tiers = (adult) => [
      {
        name: 'S',
        rows: [
          ['SmartRules String Tier(Integer age)', null],
          ['Age', 'Tier'],
          ['<18', 'minor'],
          ['18 - 64', adult],
          ['30', 'thirty'],
          [null, null],
          ['Test Tier TierTest', null],
          ['age', '_res_'],
          ['Age', 'Tier'],
          [20, adult],
        ],
      },
    ];
    await rules.save('tiers', { sheets: tiers('adult') });
    await rules.save('tiers', { sheets: tiers('grown') });
    const problems = [];
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1500, height: 950 } });
    const page = await context.newPage();
    page.on('pageerror', (err) => problems.push(err.message));
    page.on('console', (message) => message.type() === 'error' && problems.push(message.text()));
    await page.goto(`${base}#/_rules/tiers`);
    await page.waitForSelector('.sheet-grid');
    const cell = (ref) => {
      const column = ref.charCodeAt(0) - 65;
      const row = Number(ref.slice(1));
      return page.locator(`.sheet-grid tbody tr:nth-child(${row}) td:nth-child(${column + 2})`);
    };
    // The rule of 30 never wins (the one before takes its cases); the row of the test passes.
    expect(await cell('A5').getAttribute('class')).toContain('spot-warn');
    expect(await cell('A10').getAttribute('class')).toContain('spot-pass');
    // (No test reaches the rule of under 18.)
    expect(await cell('A3').getAttribute('class')).toContain('spot-untested');

    // The tables: found by name, the gap (over 64) and the rule that never wins.
    await page.click('button[role="tab"]:has-text("Tables")');
    await page.fill('.rule-panel input[type="search"]', 'tier');
    expect(await page.locator('.rule-tables > li').count()).toBe(2);
    await page.click('.rule-analysis summary');
    expect(await page.textContent('.rule-analysis')).toContain('Gaps: 1');
    expect(await page.textContent('.rule-analysis')).toContain('age >64');
    await page.click('.rule-analysis .link:has-text("#3")');
    expect(await cell('A5').getAttribute('class')).toContain('cursor');

    // The tests, row by row.
    await page.click('button[role="tab"]:has-text("Tests")');
    expect(await page.textContent('.rule-test')).toContain('Passed: 1');
    // (Whether the store makes names used before their declarations errors: this one does not.)
    expect(await page.textContent('.rule-tdz')).toContain('tdz off');
    expect(await page.textContent('.rule-importers')).toContain('checkImporters off');

    // A call traced: the cell that gave its result, on the grid.
    await page.click('button[role="tab"]:has-text("Try a table")');
    await page.fill('#rule-try-args', '[20]');
    await page.click('.rule-panel button:has-text("Run")');
    await page.waitForSelector('.rule-trace');
    expect(await page.textContent('.rule-trace')).toContain('Tier(20)');
    expect(await cell('B4').getAttribute('class')).toContain('spot-hit');
    await page.click('.rule-panel button:has-text("Benchmark")');
    await page.waitForSelector('text=calls a second');

    // Version 2 compared with version 1: the cells that changed.
    await page.click('button[role="tab"]:has-text("Versions")');
    await page.click('.rule-versions button:has-text("Compare with this one")');
    await page.waitForSelector('.rule-highlight:has-text("Cells that differ")');
    expect(await page.textContent('.rule-highlight')).toContain('Cells that differ from version 1: 2');
    expect(await cell('B4').getAttribute('class')).toContain('spot-diff');
    expect(await cell('B4').getAttribute('title')).toBe('Was: adult');
    await page.click('.rule-highlight button:has-text("Clear")');

    // A new table from its example, outlined as its kind.
    await cell('E1').click();
    await page.selectOption('.grid-new', 'SmartLookup');
    await page.waitForSelector('.table-label:has-text("SmartLookup · Rate")');
    expect(await cell('F2').textContent()).toBe('2026');

    // A rule for the gap over 64: a row after the rules (the test moves down), its condition written, its result typed.
    await page.click('button[role="tab"]:has-text("Tables")');
    await page.fill('.rule-panel input[type="search"]', 'tier');
    await page.click('.rule-analysis summary');
    await page.click('.rule-analysis li:has-text("age >64") .rule-add');
    expect(await cell('A6').textContent()).toBe('>64');
    expect(await cell('A8').textContent()).toBe('Test Tier TierTest');
    expect(await cell('B6').getAttribute('class')).toContain('cursor');
    await page.waitForFunction(() => document.activeElement?.classList.contains('grid-box'));
    await page.keyboard.type('senior');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.rule-analysis summary:not(:has-text("Gaps"))');
    expect(problems).toEqual([]);
    await context.close();
  }, 60000);

  it('versions with their properties, one tried in the context that chooses it', async () => {
    await rules.save('rates', {
      sheets: [
        {
          name: 'AUTO',
          rows: [
            ['Properties', null, null],
            ['scope', 'Worksheet', null],
            ['lob', 'auto', null],
            [null, null, null],
            ['SimpleRules Double Rate(String plan)', null, null],
            ['Plan', 'Rate', null],
            ['basic', 1.5, null],
          ],
        },
        {
          name: 'HOME',
          rows: [
            ['SimpleRules Double Rate(String plan)', null, null],
            ['properties', 'lob', 'home'],
            ['Plan', 'Rate', null],
            ['basic', 0.8, null],
          ],
        },
      ],
    });
    const problems = [];
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1500, height: 950 } });
    const page = await context.newPage();
    page.on('pageerror', (err) => problems.push(err.message));
    page.on('console', (message) => message.type() === 'error' && problems.push(message.text()));
    await page.goto(`${base}#/_rules/rates`);
    await page.waitForSelector('.sheet-grid');
    await page.click('button[role="tab"]:has-text("Tables")');
    const entries = page.locator('.rule-tables > li');
    expect(await entries.nth(0).textContent()).toContain('Scope: Worksheet');
    expect(await entries.nth(1).textContent()).toContain('One of 2 versions');
    expect(await entries.nth(1).locator('.rule-prop.inherited').textContent()).toBe('lob = auto');
    expect(await entries.nth(2).locator('.rule-prop:not(.inherited)').textContent()).toBe('lob = home');

    // The version of HOME tried: the table and its context set, its result.
    await entries.nth(2).locator('button:has-text("Try this version")').click();
    expect(await page.inputValue('#rule-try-context')).toBe('{"lob":"home"}');
    await page.fill('#rule-try-args', '["basic"]');
    await page.click('.rule-panel button:has-text("Run")');
    await page.waitForSelector('.rule-result');
    expect(JSON.parse(await page.textContent('.rule-result'))).toBe(0.8);
    expect(problems).toEqual([]);
    await context.close();
  }, 60000);

  it('the language of each table: a chip, and what told it', async () => {
    await rules.save('mixed', {
      sheets: [
        {
          name: 'CODE',
          rows: [
            ['Method Object Label(Integer n)', null, null],
            ['properties', 'language', 'openl'],
            ['return "n = " + n * 1.0;', null, null],
            [null, null, null],
            ['Method Object Count(list)', null, null],
            ['let total = 0', null, null],
            ['for (const item of list) total += item', null, null],
            ['return total', null, null],
            [null, null, null],
            ['Method Object Either(n)', null, null],
            ['return "n = " + n * 1.0;', null, null],
          ],
        },
      ],
    });
    const problems = [];
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1500, height: 950 } });
    const page = await context.newPage();
    page.on('pageerror', (err) => problems.push(err.message));
    page.on('console', (message) => message.type() === 'error' && problems.push(message.text()));
    await page.goto(`${base}#/_rules/mixed`);
    await page.waitForSelector('.sheet-grid');
    await page.click('button[role="tab"]:has-text("Tables")');
    const entries = page.locator('.rule-tables > li');
    const label = entries.nth(0).locator('.rule-lang');
    expect([await label.textContent(), await label.getAttribute('title')]).toEqual([
      'OpenL',
      'Its property language says it',
    ]);
    const count = entries.nth(1).locator('.rule-lang');
    expect([await count.textContent(), await count.getAttribute('title')]).toEqual([
      'JavaScript',
      'The language of the book',
    ]);
    expect(await entries.nth(1).locator('.rule-props').count()).toBe(0);
    // (Code both languages read, in the book's language: a warning of the formulas.)
    await page.click('button[role="tab"]:has-text("Messages")');
    const warning = page.locator('.rule-lint li');
    expect(await warning.count()).toBe(1);
    expect(await warning.textContent()).toMatch(/Either.*runs as JavaScript, the book's language/);
    // (Its fix: the row added under the title of the table, and the warning gone once the book is checked again.)
    await warning.locator('button:has-text("Add the row properties | language | js")').click();
    await page.click('button[role="tab"]:has-text("Tables")');
    // (Once the book is checked again: the table Either, its language by its property.)
    const either = page.locator('.rule-tables > li', { hasText: 'Either' }).locator('.rule-lang');
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('.rule-tables > li')]
          .find((entry) => entry.textContent.startsWith('Either'))
          ?.querySelector('.rule-lang')?.title === 'Its property language says it',
      null,
      { timeout: 5000 }
    );
    expect([await either.textContent(), await either.getAttribute('title')]).toEqual([
      'JavaScript',
      'Its property language says it',
    ]);
    // (In the Try panel: the language of the table chosen.)
    await page.click('button[role="tab"]:has-text("Try a table")');
    expect(await page.textContent('.rule-panel .rule-lang')).toBe('OpenL');
    // (And no warning of the formulas left.)
    await page.click('button[role="tab"]:has-text("Messages")');
    expect(await page.locator('.rule-lint li').count()).toBe(0);
    expect(problems).toEqual([]);
    await context.close();
  }, 60000);

  it('the language said for a whole sheet: one click for every warning of it', async () => {
    await rules.save('sheetwide', {
      sheets: [
        {
          name: 'CODE',
          rows: [
            ['Method Object Label(Integer n)', null, null],
            ['properties', 'language', 'openl'],
            ['return "n = " + n * 1.0;', null, null],
            [null, null, null],
            ['Method Object Either(n)', null, null],
            ['return "n = " + n * 1.0;', null, null],
            [null, null, null],
            ['Method Object Grow(n)', null, null],
            ['n = n + 1;', null, null],
            ['return n;', null, null],
          ],
        },
      ],
    });
    const problems = [];
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1500, height: 950 } });
    const page = await context.newPage();
    page.on('pageerror', (err) => problems.push(err.message));
    page.on('console', (message) => message.type() === 'error' && problems.push(message.text()));
    await page.goto(`${base}#/_rules/sheetwide`);
    await page.waitForSelector('.sheet-grid');
    const cell = (ref) => {
      const column = ref.charCodeAt(0) - 65;
      const row = Number(ref.slice(1));
      return page.locator(`.sheet-grid tbody tr:nth-child(${row}) td:nth-child(${column + 2})`);
    };
    expect(await page.locator('.rule-lint li').count()).toBe(2);
    await page
      .locator('.rule-lint li')
      .first()
      .locator('button:has-text("Say JavaScript for the whole sheet CODE")')
      .click();
    // (A Properties table of the sheet at its top, the tables under it moved down; no warning left.)
    expect(
      await Promise.all(
        ['A1', 'A2', 'B2', 'A3', 'B3', 'A5'].map((ref) => cell(ref).locator('.cell-text').textContent())
      )
    ).toEqual(['Properties', 'scope', 'Worksheet', 'language', 'js', 'Method Object Label(Integer n)']);
    expect(await cell('A3').getAttribute('class')).toContain('cursor');
    await page.waitForFunction(() => document.querySelectorAll('.rule-lint li').length === 0);
    expect(await page.textContent('.rule-ok')).toContain('Every test passes');
    expect(problems).toEqual([]);
    await context.close();
  }, 60000);

  it('rows inserted and deleted between versions: lined up side by side, the rows under them not changed', async () => {
    const head = [
      ['SmartRules String Band(Integer age)', null],
      ['Age', 'Band'],
    ];
    await rules.save('bands', {
      sheets: [{ name: 'S', rows: [...head, ['<18', 'minor'], ['18 - 64', 'adult'], ['65+', 'senior']] }],
    });
    await rules.save('bands', {
      sheets: [
        { name: 'S', rows: [...head, ['<13', 'child'], ['13 - 17', 'teen'], ['18 - 64', 'adult'], ['65+', 'senior']] },
      ],
    });
    const problems = [];
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1500, height: 950 } });
    const page = await context.newPage();
    page.on('pageerror', (err) => problems.push(err.message));
    page.on('console', (message) => message.type() === 'error' && problems.push(message.text()));
    await page.goto(`${base}#/_rules/bands`);
    await page.waitForSelector('.sheet-grid');
    const line = (grid, n) => page.locator(`${grid} tbody tr:nth-child(${n})`);
    const old = '.rule-beside-side:nth-child(1) .sheet-grid';
    const now = '.rule-beside-side:nth-child(2) .sheet-grid';

    // Compared: the rows under the inserted one are not marked.
    await page.click('button[role="tab"]:has-text("Versions")');
    await page.click('.rule-versions button:has-text("Compare with this one")');
    expect(await page.textContent('.rule-highlight')).toContain('Cells that differ from version 1: 4');
    await page.click('.rule-highlight button:has-text("Clear")');

    // Side by side: <18 minor paired with <13 child (changed), 13 - 17 teen inserted (a gap opposite it), the rest lined up.
    await page.click('.rule-versions button:has-text("Side by side")');
    await page.waitForSelector('.rule-beside');
    expect(await page.textContent('.rule-beside-bar')).toContain('Cells that differ: 4');
    expect(await line(old, 4).getAttribute('class')).toBe('row-gap');
    expect(await line(now, 4).getAttribute('class')).toBe('row-added');
    expect(await line(old, 3).locator('td').nth(1).getAttribute('title')).toBe('Now: child');
    expect(await line(now, 3).locator('td').nth(1).getAttribute('title')).toBe('Was: minor');
    for (const grid of [old, now]) {
      expect(await line(grid, 5).locator('td').first().textContent()).toBe('18 - 64');
      expect(await line(grid, 5).locator('td.spot-diff').count()).toBe(0);
      expect(await line(grid, 6).locator('td').first().textContent()).toBe('65+');
    }
    expect(await page.locator(`${old} tbody tr`).count()).toBe(await page.locator(`${now} tbody tr`).count());
    // (A cell chosen on a line of both: the same line on the other side; on the inserted row, the next line of both.)
    await line(now, 5).locator('td').first().click();
    expect(await line(old, 5).locator('td').first().getAttribute('class')).toContain('cursor');
    await line(now, 4).locator('td').first().click();
    expect(await line(old, 5).locator('td').first().getAttribute('class')).toContain('cursor');
    expect(problems).toEqual([]);
    await context.close();
  }, 60000);

  it('the books that import a book; a warning before a version that breaks them becomes the active one', async () => {
    const tariffs = (gold) => [
      {
        name: 'R',
        rows: [
          ['SmartRules Double Rate(String plan)', null],
          ['Plan', 'Rate'],
          ['gold', gold],
        ],
      },
    ];
    await rules.save('tariffs', { sheets: tariffs(2) });
    await rules.save('invoice', {
      sheets: [
        {
          name: 'B',
          rows: [
            ['Method Double Total(Double base)'],
            ["import { Rate } from 'tariffs'"],
            ["return base * Rate('gold')"],
            [null],
            ['Test Total TotalTest', null],
            ['base', '_res_'],
            ['Base', 'Total'],
            [10, 20],
          ],
        },
      ],
    });
    await rules.save('tariffs', { sheets: tariffs(3) }, { activate: false });
    const problems = [];
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1500, height: 950 } });
    const page = await context.newPage();
    page.on('pageerror', (err) => problems.push(err.message));
    page.on('console', (message) => message.type() === 'error' && problems.push(message.text()));
    await page.goto(`${base}#/_rules/tariffs`);
    await page.waitForSelector('.sheet-grid');
    expect(await page.textContent('.rule-imported-by')).toBe('Imported by: invoice');
    // (Version 2 makes bill fail: a warning, and nothing done when it is cancelled.)
    await page.click('button[role="tab"]:has-text("Versions")');
    await page.click('.rule-versions li:has-text("v2") button:has-text("Make it the active one")');
    await page.waitForSelector('.modal');
    expect(await page.textContent('.modal')).toContain(
      'Making version 2 the active one breaks books that import tariffs'
    );
    expect(await page.textContent('.dialog-details')).toContain(
      'invoice: Test TotalTest failed at row 1. Expected 20 but got 30'
    );
    await page.click('.modal button:has-text("Cancel")');
    expect((await rules.versions('tariffs')).find((entry) => entry.status === 'active').version).toBe(1);
    // (Done anyway when the user says so.)
    await page.click('.rule-versions li:has-text("v2") button:has-text("Make it the active one")');
    await page.click('.modal button:has-text("Do it anyway")');
    await page.waitForSelector('text=Version 2 is the active one');
    expect((await rules.versions('tariffs')).find((entry) => entry.status === 'active').version).toBe(2);
    // (The book that imports it links to it.)
    await page.goto(`${base}#/_rules/invoice`);
    await page.waitForSelector('.sheet-grid');
    expect(await page.textContent('.rule-imports')).toContain('Imports: tariffs');
    expect(problems).toEqual([]);
    await context.close();
  }, 60000);

  it('versions side by side, and tests written of tries: a row of a test, a new test', async () => {
    const quotes = (gold) => [
      {
        name: 'S',
        rows: [
          ['SmartRules Double Discount(String plan, Integer age)', null, null],
          ['Plan', 'Age', 'Discount'],
          ['basic', '<25', 0],
          ['gold', '25+', gold],
          [null, null, null],
          ['Test Discount DiscountTest', null, null],
          ['plan', 'age', '_res_'],
          ['Plan', 'Age', 'Discount'],
          ['basic', 20, 0],
          [null, null, null],
          ['SimpleRules String Band(Integer age)', null, null],
          ['Age', 'Band', null],
          ['<18', 'minor', null],
          ['18+', 'adult', null],
        ],
      },
    ];
    await rules.save('quotes', { sheets: quotes(0.05) });
    await rules.save('quotes', { sheets: quotes(0.1) });
    const problems = [];
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1500, height: 950 } });
    const page = await context.newPage();
    page.on('pageerror', (err) => problems.push(err.message));
    page.on('console', (message) => message.type() === 'error' && problems.push(message.text()));
    await page.goto(`${base}#/_rules/quotes`);
    await page.waitForSelector('.sheet-grid');
    const cell = (ref, grid = '.sheet-grid') => {
      const column = ref.charCodeAt(0) - 65;
      const row = Number(ref.slice(1));
      return page.locator(`${grid} tbody tr:nth-child(${row}) td:nth-child(${column + 2})`);
    };
    const passes = (row) =>
      page.waitForFunction(
        (r) =>
          document
            .querySelector(`.sheet-grid tbody tr:nth-child(${r}) td:nth-child(2)`)
            ?.classList.contains('spot-pass'),
        row
      );

    // Version 1 beside version 2: a grid each, the cell that changed marked in both.
    await page.click('button[role="tab"]:has-text("Versions")');
    await page.click('.rule-versions button:has-text("Side by side")');
    await page.waitForSelector('.rule-beside');
    expect(await page.locator('.rule-beside .sheet-grid').count()).toBe(2);
    expect(await page.textContent('.rule-beside-bar')).toContain('Side by side with version 1. Cells that differ: 1');
    expect(await page.textContent('.rule-beside-bar')).toContain('Tables changed: Discount');
    const old = '.rule-beside-side:nth-child(1) .sheet-grid';
    const now = '.rule-beside-side:nth-child(2) .sheet-grid';
    expect(await cell('C4', old).getAttribute('title')).toBe('Now: 0.1');
    expect(await cell('C4', now).getAttribute('title')).toBe('Was: 0.05');
    expect(await cell('C3', now).getAttribute('class')).not.toContain('spot-diff');
    // (A cell chosen in one grid: the same in the other.)
    await cell('B2', old).click();
    expect(await cell('B2', now).getAttribute('class')).toContain('cursor');
    await page.click('.rule-beside-bar button:has-text("Close")');
    expect(await page.locator('.sheet-grid').count()).toBe(1);

    // Discount tried: its result written as a row of its test, under the others (the table under it moves down).
    await page.click('button[role="tab"]:has-text("Try a table")');
    await page.fill('#rule-try-args', '["gold", 30]');
    await page.click('.rule-panel button:has-text("Run")');
    await page.waitForSelector('.rule-result');
    await page.click('.rule-panel button:has-text("Write a test of this result")');
    await page.waitForSelector('text=A row added to the test DiscountTest');
    expect([await cell('A10').textContent(), await cell('B10').textContent(), await cell('C10').textContent()]).toEqual(
      ['gold', '30', '0.1']
    );
    expect(await cell('A12').textContent()).toBe('SimpleRules String Band(Integer age)');
    await passes(10);

    // Band, which no test runs: tried from the tables, and a new test of it written under the cells of the sheet.
    await page.click('button[role="tab"]:has-text("Tables")');
    const band = page.locator('.rule-tables > li', { hasText: 'Band' });
    expect(await band.textContent()).toContain('No test runs this table');
    await band.locator('button:has-text("Try it to write a test")').click();
    expect(await page.inputValue('#rule-try-table')).toBe('Band');
    await page.fill('#rule-try-args', '[20]');
    await page.click('.rule-panel button:has-text("Run")');
    await page.waitForSelector('.rule-result');
    await page.click('.rule-panel button:has-text("Write a test of this result")');
    await page.waitForSelector('text=A new test BandTest');
    expect(await cell('A17').textContent()).toBe('Test Band BandTest');
    expect([await cell('A18').textContent(), await cell('B18').textContent()]).toEqual(['age', '_res_']);
    expect([await cell('A20').textContent(), await cell('B20').textContent()]).toEqual(['20', 'adult']);
    expect(await cell('A20').getAttribute('class')).toContain('cursor');
    await passes(20);
    await page.click('button[role="tab"]:has-text("Messages")');
    expect(await page.textContent('.rule-ok')).toContain('Every test passes');
    expect(problems).toEqual([]);
    await context.close();
  }, 60000);
});
