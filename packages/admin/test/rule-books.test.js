// The books of rules in the admin (rules: a RuleStore of @xufa/rules): listed, created from edited sheets, inspected
// as they change, tried, uploaded as workbooks (refused when their tests fail, unless kept anyway), versions made
// active, downloaded and deleted; and the area in what the page knows (meta) and the permissions it offers.
import xufa from '@xufa/http';
import { Database } from '@xufa/orm';
import { RuleStore, RuleBook } from '@xufa/rules';
import { admin } from '../index.js';

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

async function setUp(storeOptions = {}) {
  const db = new Database({ backend: 'memory' });
  await db.connect();
  const rules = new RuleStore(db, storeOptions);
  await rules.sync();
  const app = xufa();
  app.register(admin, { prefix: '/admin', models: [], authorize: () => true, rules });
  await app.ready();
  const call = (method, url, payload) =>
    app.inject({ method, url: `/admin/api/${url}`, headers: { 'x-xufa-admin': '1' }, ...(payload ? { payload } : {}) });
  return { app, rules, call };
}

describe('admin: books of rules', () => {
  test('the area in the page and its permissions', async () => {
    const { app } = await setUp();
    const meta = (await app.inject('/admin/api/models')).json();
    expect(meta.rules).toBe(true);
    expect(meta.actions.rules).toEqual({ change: true, delete: true });
    const { permissions } = (await app.inject('/admin/api/_permissions')).json();
    expect(permissions.filter((item) => item.name.startsWith('_rules'))).toEqual([
      { name: '_rules.view', kind: 'area' },
      { name: '_rules.change', kind: 'area' },
      { name: '_rules.delete', kind: 'area' },
    ]);
  });

  test('a book tells the checks of its store: tdz and checkImporters', async () => {
    for (const [tdz, checkImporters] of [
      [false, false],
      [true, false],
      [false, true],
    ]) {
      const { call } = await setUp({ tdz, checkImporters });
      expect((await call('POST', '_rules/pricing', { sheets: SHEETS })).statusCode).toBe(201);
      expect((await call('GET', '_rules/pricing')).json()).toMatchObject({ name: 'pricing', tdz, checkImporters });
    }
  });

  test('a book of edited sheets: created, read with its tables, inspected, tried, and a new version', async () => {
    const { call } = await setUp();
    const created = await call('POST', '_rules/pricing', { sheets: SHEETS, comment: 'first' });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toEqual({ ok: true, version: 1, messages: [] });
    expect((await call('GET', '_rules')).json().results).toEqual([
      expect.objectContaining({ name: 'pricing', active: 1, last: 1 }),
    ]);
    const book = (await call('GET', '_rules/pricing')).json();
    expect(book).toMatchObject({ name: 'pricing', version: 1, active: 1, errors: [] });
    expect(book.sheets[0].rows[4]).toEqual(['basic', 100]);
    expect(book.tables.map((table) => [table.kind, table.name])).toEqual([
      ['Rules', 'Premium'],
      ['Test', 'PremiumTests'],
    ]);
    expect(book.versions).toEqual([expect.objectContaining({ version: 1, comment: 'first', status: 'active' })]);

    const edited = structuredClone(book.sheets);
    edited[0].rows[4][1] = 110;
    expect((await call('POST', '_rules/pricing/inspect', { sheets: edited })).json().errors).toEqual([
      'Test PremiumTests failed at row 1. Expected 100 but got 110',
    ]);
    expect(
      (await call('POST', '_rules/pricing/try', { table: 'Premium', args: ['basic'], sheets: edited })).json()
    ).toMatchObject({ result: 110 });
    expect((await call('POST', '_rules/pricing/try', { table: 'Premium', args: ['basic'] })).json()).toMatchObject({
      result: 100,
    });

    const refused = await call('POST', '_rules/pricing', { sheets: edited });
    expect(refused.statusCode).toBe(422);
    expect(refused.json().messages).toEqual(['Test PremiumTests failed at row 1. Expected 100 but got 110']);
    const kept = await call('POST', '_rules/pricing', { sheets: edited, force: true });
    expect(kept.json()).toMatchObject({ version: 2 });
    expect((await call('GET', '_rules/pricing')).json()).toMatchObject({ version: 2, active: 2 });
    expect((await call('GET', '_rules/pricing?version=1')).json()).toMatchObject({ version: 1, active: 2 });
    expect((await call('PUT', '_rules/pricing/active', { version: 1 })).json()).toEqual({ ok: true, version: 1 });
    expect((await call('POST', '_rules/pricing/try', { table: 'Premium', args: ['premium'] })).json()).toMatchObject({
      result: 200,
    });
  });

  test('tries traced, in a runtime context or measured; the rows of the tests and the gaps of the tables', async () => {
    const { call } = await setUp();
    const sheets = [
      {
        name: 'S',
        rows: [
          ['SmartRules Double Rate(String plan)', null],
          ['Plan', 'Rate'],
          ['basic', 1],
          [null, null],
          ['SmartRules Double Rate(String plan)', null],
          ['properties', 'state', 'NY'],
          ['Plan', 'Rate'],
          ['basic', 2],
          [null, null],
          ['Test Rate RateTest', null],
          ['plan', '_res_'],
          ['Plan', 'Rate'],
          ['basic', 1],
          ['basic', 5],
        ],
        merges: [],
      },
    ];
    expect((await call('POST', '_rules/rates', { sheets, force: true })).statusCode).toBe(201);

    const traced = (
      await call('POST', '_rules/rates/try', { table: 'Rate', args: ['basic'], context: { usState: 'NY' } })
    ).json();
    expect(traced).toMatchObject({
      result: 2,
      trace: { table: 'Rate', kind: 'SmartRules', result: 2, version: { state: 'NY' } },
    });
    expect(traced.trace.cells).toEqual([{ sheet: 'S', row: 7, column: 1 }]);
    expect((await call('POST', '_rules/rates/try', { table: 'Rate', args: ['basic'] })).json().result).toBe(1);
    const measured = (
      await call('POST', '_rules/rates/try', { table: 'Rate', args: ['basic'], benchmark: true })
    ).json();
    expect(measured.runs).toBeGreaterThan(100);
    expect(measured.perSecond).toBeGreaterThan(0);
    expect(measured.trace).toBeUndefined();

    const book = (await call('GET', '_rules/rates')).json();
    expect(book.tables.map((table) => table.kind)).toEqual(['SmartRules', 'SmartRules', 'Test']);
    // The versions: how many, the properties of each (its own), and a context that chooses it.
    expect(book.tables[0]).toMatchObject({ versions: 2, context: {} });
    expect(book.tables[1]).toMatchObject({
      versions: 2,
      properties: { state: 'NY' },
      own: ['state'],
      context: { usState: 'NY' },
    });
    expect(book.tables[2].versions).toBeUndefined();
    expect(book.tests[0].rows.map((row) => [row.passed, row.cell])).toEqual([
      [true, { sheet: 'S', row: 12, column: 0 }],
      [false, { sheet: 'S', row: 13, column: 0 }],
    ]);
    expect(book.lint).toEqual([]);
    expect(book.coverage.tables.map((entry) => [entry.table, entry.tested])).toEqual([
      ['Rate', true],
      ['Rate', true],
    ]);
    expect(book.analysis.map((report) => report.axes[0].gaps)).toEqual([
      [{ plan: 'not basic' }],
      [{ plan: 'not basic' }],
    ]);
  });

  test('rows of tests written of calls: of the version kept or of the sheets being edited, in a context', async () => {
    const { call } = await setUp();
    await call('POST', '_rules/pricing', { sheets: SHEETS });
    expect((await call('POST', '_rules/pricing/test-case', { table: 'Premium', args: ['premium'] })).json()).toEqual({
      title: 'Test Premium PremiumTest',
      names: ['plan', '_res_'],
      titles: ['plan', 'Expected'],
      cells: ['premium', 200],
      error: null,
    });
    const edited = structuredClone(SHEETS);
    edited[0].rows[5][1] = 250;
    const written = (
      await call('POST', '_rules/pricing/test-case', {
        table: 'Premium',
        args: ['premium'],
        sheets: edited,
        context: { usState: 'NY' },
      })
    ).json();
    expect(written).toMatchObject({ names: ['plan', '_context_.usState', '_res_'], cells: ['premium', 'NY', 250] });
    // (Written into the sheets, the test passes.)
    edited[0].rows.push([null], [written.title], written.names, written.titles, written.cells);
    expect((await call('POST', '_rules/pricing/inspect', { sheets: edited })).json().errors).toEqual([]);
    expect((await call('POST', '_rules/pricing/test-case', { table: 'Nope', args: [] })).statusCode).toBe(404);
  });

  test('books that import books: what they import shown, tries of edited sheets linked to them', async () => {
    const { call } = await setUp();
    await call('POST', '_rules/pricing', { sheets: SHEETS });
    const quotes = [
      {
        name: 'Q',
        rows: [
          ['Method Float Quote(String plan)'],
          ["import { Premium } from 'pricing'"],
          ['return Premium(plan) * 2'],
        ],
      },
    ];
    expect((await call('POST', '_rules/quotes', { sheets: quotes })).statusCode).toBe(201);
    expect((await call('GET', '_rules/quotes')).json().imports).toEqual(['pricing']);
    expect(
      (await call('POST', '_rules/quotes/try', { table: 'Quote', args: ['basic'], sheets: quotes })).json()
    ).toMatchObject({
      result: 200,
    });
    const missing = [{ name: 'Q', rows: [['Method Float Quote()'], ["import { X } from 'nope'"], ['return X()']] }];
    expect((await call('POST', '_rules/quotes/inspect', { sheets: missing })).json().errors).toEqual([
      'No active book nope to import (imported by quotes)',
    ]);
  });

  test('the books that import a book, and what another version of it does to them', async () => {
    const { call } = await setUp();
    await call('POST', '_rules/pricing', { sheets: SHEETS });
    const quotes = [
      {
        name: 'Q',
        rows: [
          ['Method Float Quote(String plan)'],
          ["import { Premium } from 'pricing'"],
          ['return Premium(plan) * 2'],
          [null],
          ['Test Quote QuoteTest', null],
          ['plan', '_res_'],
          ['Plan', 'Quote'],
          ['basic', 200],
        ],
      },
    ];
    await call('POST', '_rules/quotes', { sheets: quotes });
    expect((await call('GET', '_rules/pricing')).json().importedBy).toEqual([{ name: 'quotes', direct: true }]);
    const changed = structuredClone(SHEETS);
    changed[0].rows[4][1] = 150;
    changed[0].rows[9][1] = 150;
    const impact = (await call('POST', '_rules/pricing/impact', { sheets: changed })).json();
    expect(impact.results).toEqual([
      expect.objectContaining({
        name: 'quotes',
        direct: true,
        errors: ['Test QuoteTest failed at row 1. Expected 200 but got 300'],
      }),
    ]);
    expect((await call('POST', '_rules/pricing/impact', { version: 1 })).json().results[0].errors).toEqual([]);
  });

  test('a store that checks the books importing a book: 409 for a version that breaks them, unless breaking', async () => {
    const { call } = await setUp({ checkImporters: true });
    await call('POST', '_rules/pricing', { sheets: SHEETS });
    await call('POST', '_rules/quotes', {
      sheets: [
        {
          name: 'Q',
          rows: [
            ['Method Float Quote(String plan)'],
            ["import { Premium } from 'pricing'"],
            ['return Premium(plan) * 2'],
            [null],
            ['Test Quote QuoteTest', null],
            ['plan', '_res_'],
            ['Plan', 'Quote'],
            ['basic', 200],
          ],
        },
      ],
    });
    const changed = structuredClone(SHEETS);
    changed[0].rows[4][1] = 150;
    changed[0].rows[9][1] = 150;
    const refused = await call('POST', '_rules/pricing', { sheets: changed });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().messages).toEqual(['quotes: Test QuoteTest failed at row 1. Expected 200 but got 300']);
    expect((await call('POST', '_rules/pricing', { sheets: changed, breaking: true })).statusCode).toBe(201);
    expect((await call('PUT', '_rules/pricing/active', { version: 1 })).statusCode).toBe(200);
    expect((await call('PUT', '_rules/pricing/active', { version: 2 })).statusCode).toBe(409);
    expect((await call('PUT', '_rules/pricing/active', { version: 2, breaking: true })).json()).toEqual({
      ok: true,
      version: 2,
    });
  });

  test('workbooks uploaded (base64) and downloaded; books deleted; errors of what is no book', async () => {
    const { call } = await setUp();
    const xlsx = RuleBook.fromSheets(SHEETS).toXlsx();
    const uploaded = await call('POST', '_rules/pricing', { xlsx: xlsx.toString('base64'), fileName: 'pricing.xlsx' });
    expect(uploaded.json()).toMatchObject({ version: 1 });
    const download = await call('GET', '_rules/pricing/xlsx');
    expect(download.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(Buffer.compare(download.rawPayload, xlsx)).toBe(0);
    expect((await call('GET', '_rules/pricing')).json().versions[0].fileName).toBe('pricing.xlsx');
    const broken = await call('POST', '_rules/other', { xlsx: Buffer.from('nothing').toString('base64') });
    expect(broken.statusCode).toBe(400);
    expect((await call('POST', '_rules/other', { nothing: true })).statusCode).toBe(400);
    expect((await call('GET', '_rules/nope')).statusCode).toBe(404);
    expect((await call('DELETE', '_rules/pricing')).json()).toEqual({ ok: true, removed: 1 });
    expect((await call('GET', '_rules')).json().results).toEqual([]);
  });
});
