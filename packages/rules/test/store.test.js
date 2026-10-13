// Books kept in a database, in versions, and their routes.
import xufa from '@xufa/http';
import { Database } from '@xufa/orm';
import { RuleBook, RuleStore, rulesPlugin } from '../index.js';

// The .xlsx of a book of premiums by plan, and a test of it (the premium of basic it expects).
function premiums({ basic = 100, expected = basic } = {}) {
  return RuleBook.fromSheets([
    {
      name: 'RULES',
      rows: [
        ['Rules Float Premium(String plan)', null],
        ['C1', 'RET'],
        ['plan', null],
        ['String', 'Float'],
        ['basic', basic],
        ['premium', 200],
        [null, null],
        ['Test Premium PremiumTests', null],
        ['plan', 'RET'],
        ['basic', expected],
      ],
    },
  ]).toXlsx();
}

// The sheets of a book that imports nothing.
const premiumsSheets = () => ({
  sheets: [
    {
      name: 'P',
      rows: [
        ['SimpleRules Double Fee(String plan)', null],
        ['Plan', 'Fee'],
        ['basic', 1],
      ],
    },
  ],
});

async function storeOf(options) {
  const db = new Database({ backend: 'memory' });
  await db.connect();
  const store = new RuleStore(db, options);
  await store.sync();
  return { db, store };
}

describe('RuleStore', () => {
  test('versions of a book: each tested, the last the active one unless told, the active one compiled once', async () => {
    const { store } = await storeOf();
    expect(
      await store.save('pricing', premiums(), { author: 'ada', comment: 'first', fileName: 'p.xlsx' })
    ).toMatchObject({ version: 1, errors: [] });
    expect(await store.call('pricing', 'Premium', 'basic')).toBe(100);
    const book = await store.book('pricing');
    expect(await store.book('pricing')).toBe(book);
    expect(await store.save('pricing', premiums({ basic: 110 }))).toMatchObject({ version: 2 });
    expect(await store.call('pricing', 'Premium', 'basic')).toBe(110);
    await store.save('pricing', premiums({ basic: 120 }), { activate: false });
    expect(await store.call('pricing', 'Premium', 'basic')).toBe(110);
    expect((await store.versions('pricing')).map(({ version, status }) => [version, status])).toEqual([
      [3, 'inactive'],
      [2, 'active'],
      [1, 'inactive'],
    ]);
    await store.activate('pricing', 3);
    expect(await store.call('pricing', 'Premium', 'basic')).toBe(120);
    expect((await store.book('pricing', { version: 1 })).call('Premium', 'basic')).toBe(100);
    expect(await store.list()).toEqual([
      expect.objectContaining({ name: 'pricing', tenant: null, active: 3, last: 3 }),
    ]);
  });

  test('a book whose tests fail is refused (its messages in .errors), or kept with force', async () => {
    const { store } = await storeOf();
    const failing = premiums({ basic: 100, expected: 999 });
    await expect(store.save('pricing', failing)).rejects.toMatchObject({
      code: 'XUFA_RULES_ERR_TESTS',
      errors: ['Test PremiumTests failed at row 1. Expected 999 but got 100'],
    });
    expect(await store.list()).toEqual([]);
    expect(await store.save('pricing', failing, { force: true })).toMatchObject({
      version: 1,
      errors: [expect.any(String)],
    });
    expect((await store.versions('pricing'))[0].errors).toHaveLength(1);
  });

  test('books of tenants apart; the workbook kept as it came; JSON too; and removed', async () => {
    const { store } = await storeOf();
    const bytes = premiums();
    await store.save('pricing', bytes, { tenant: 'acme' });
    await store.save('pricing', RuleBook.fromXlsx(premiums({ basic: 50 })).toJSON(), { tenant: 'globex' });
    expect((await store.book('pricing', { tenant: 'acme' })).call('Premium', 'basic')).toBe(100);
    expect((await store.book('pricing', { tenant: 'globex' })).call('Premium', 'basic')).toBe(50);
    await expect(store.book('pricing')).rejects.toMatchObject({ code: 'XUFA_RULES_ERR_NOT_FOUND' });
    expect(Buffer.compare(await store.xlsx('pricing', { tenant: 'acme' }), bytes)).toBe(0);
    expect(RuleBook.fromXlsx(await store.xlsx('pricing', { tenant: 'globex' })).call('Premium', 'basic')).toBe(50);
    expect(await store.remove('pricing', { tenant: 'acme' })).toBe(1);
    expect((await store.list()).map((book) => book.tenant)).toEqual(['globex']);
  });

  test('sheets to edit, books of edited sheets inspected and kept (their workbook written of them)', async () => {
    const { store } = await storeOf();
    await store.save('pricing', premiums());
    const { version, sheets } = await store.sheets('pricing');
    expect(version).toBe(1);
    expect(sheets[0].rows[4]).toEqual(['basic', 100]);
    sheets[0].rows[4][1] = 105;
    expect(await store.inspect({ sheets })).toEqual({
      tables: [
        {
          kind: 'Rules',
          language: 'js',
          languageFrom: 'book',
          name: 'Premium',
          position: { sheet: 'RULES', row: 0, column: 0, height: 6, width: 2 },
        },
        { kind: 'Test', name: 'PremiumTests', position: { sheet: 'RULES', row: 7, column: 0, height: 3, width: 2 } },
      ],
      errors: ['Test PremiumTests failed at row 1. Expected 100 but got 105'],
      // (How each row of its tests went, and the gaps and overlaps of its decision tables.)
      tests: [
        expect.objectContaining({
          name: 'PremiumTests',
          rows: [expect.objectContaining({ passed: false, cell: { sheet: 'RULES', row: 9, column: 0 } })],
        }),
      ],
      analysis: [expect.objectContaining({ table: 'Premium', kind: 'Rules' })],
      lint: [],
      coverage: expect.objectContaining({ tests: 1 }),
      imports: [],
    });
    sheets[0].rows[9][1] = 105;
    expect(await store.save('pricing', { sheets }, { comment: 'edited' })).toMatchObject({ version: 2, errors: [] });
    expect(await store.call('pricing', 'Premium', 'basic')).toBe(105);
    expect((await store.sheets('pricing')).sheets[0].rows[4]).toEqual(['basic', 105]);
    const broken = structuredClone(sheets);
    broken[0].rows[5][0] = 'basic';
    expect(await store.inspect({ sheets: broken })).toEqual({
      tables: [],
      errors: ['Error building table at RULES!A1: Duplicated combination at table Premium (variables: plan)'],
      tests: [],
      analysis: [],
      lint: [],
      coverage: null,
      imports: [],
    });
  });

  test('another process sees a new active version after refresh ms', async () => {
    const { db } = await storeOf();
    const first = new RuleStore(db, { model: 'RulesA', refresh: 0 });
    const second = new RuleStore(db, { model: 'RulesB', refresh: 0 });
    await first.save('pricing', premiums());
    expect(await second.call('pricing', 'Premium', 'basic')).toBe(100);
    await first.save('pricing', premiums({ basic: 130 }));
    expect(await second.call('pricing', 'Premium', 'basic')).toBe(130);
  });
});

describe('rulesPlugin', () => {
  async function appOf(options = {}) {
    const { store } = await storeOf();
    const app = xufa();
    app.register(rulesPlugin, { store, prefix: '/api/rules', ...options });
    await app.ready();
    return { app, store };
  }

  test('upload, list, describe, run, test, download, activate and delete books', async () => {
    const { app } = await appOf();
    const xlsx = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const uploaded = await app.inject({
      method: 'POST',
      url: '/api/rules/pricing?comment=first',
      headers: { 'content-type': xlsx },
      payload: premiums(),
    });
    expect(uploaded.statusCode).toBe(201);
    expect(uploaded.json()).toEqual({ name: 'pricing', version: 1, errors: [] });
    await app.inject({
      method: 'POST',
      url: '/api/rules/pricing',
      headers: { 'content-type': 'application/octet-stream' },
      payload: premiums({ basic: 110 }),
    });
    expect((await app.inject('/api/rules')).json()).toEqual([
      expect.objectContaining({ name: 'pricing', active: 2, last: 2 }),
    ]);
    const described = (await app.inject('/api/rules/pricing')).json();
    expect(described).toMatchObject({ name: 'pricing', version: 2, active: 2 });
    expect(described.versions.map((item) => item.version)).toEqual([2, 1]);
    expect(described.tables).toEqual([
      {
        name: 'Premium',
        kind: 'Rules',
        params: [{ name: 'plan', type: 'String' }],
        position: { sheet: 'RULES', row: 0, column: 0, height: 6, width: 2 },
      },
      {
        name: 'PremiumTests',
        kind: 'Test',
        params: undefined,
        position: { sheet: 'RULES', row: 7, column: 0, height: 3, width: 2 },
      },
    ]);
    expect(
      (await app.inject({ method: 'POST', url: '/api/rules/pricing/run/Premium', payload: { args: ['basic'] } })).json()
    ).toEqual({ result: 110 });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/rules/pricing/run/Premium?version=1',
          payload: { args: ['basic'] },
        })
      ).json()
    ).toEqual({ result: 100 });
    const tested = await app.inject({
      method: 'POST',
      url: '/api/rules/pricing/test',
      headers: { 'content-type': xlsx },
      payload: premiums({ expected: 1 }),
    });
    expect(tested.json()).toEqual({ errors: ['Test PremiumTests failed at row 1. Expected 1 but got 100'] });
    const download = await app.inject('/api/rules/pricing/xlsx?version=1');
    expect(download.headers['content-type']).toBe(xlsx);
    expect(RuleBook.fromXlsx(download.rawPayload).call('Premium', 'basic')).toBe(100);
    expect((await app.inject('/api/rules/pricing/json')).json()[0]).toMatchObject({
      className: 'RulesTable',
      name: 'Premium',
    });
    expect(
      (await app.inject({ method: 'PUT', url: '/api/rules/pricing/active', payload: { version: 1 } })).json()
    ).toEqual({ version: 1 });
    expect(
      (await app.inject({ method: 'POST', url: '/api/rules/pricing/run/Premium', payload: { args: ['basic'] } })).json()
    ).toEqual({ result: 100 });
    expect((await app.inject({ method: 'DELETE', url: '/api/rules/pricing' })).json()).toEqual({ removed: 2 });
    expect((await app.inject('/api/rules/pricing')).statusCode).toBe(404);
  });

  test('failing tests answer 422 with their messages; books that do not build 400; a guard and tenants', async () => {
    const tenants = [];
    const { app, store } = await appOf({
      onRequest: async (request, reply) => {
        if (request.headers.authorization !== 'Bearer ok') return reply.code(401).send({ error: 'no' });
        return undefined;
      },
      tenantOf: (request) => {
        tenants.push(request.headers['x-tenant']);
        return request.headers['x-tenant'];
      },
    });
    const headers = { authorization: 'Bearer ok', 'x-tenant': 'acme', 'content-type': 'application/octet-stream' };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/rules/pricing',
          headers: { ...headers, authorization: 'x' },
          payload: premiums(),
        })
      ).statusCode
    ).toBe(401);
    const failing = await app.inject({
      method: 'POST',
      url: '/api/rules/pricing',
      headers,
      payload: premiums({ expected: 2 }),
    });
    expect(failing.statusCode).toBe(422);
    expect(failing.json()).toMatchObject({
      error: 'XUFA_RULES_ERR_TESTS',
      errors: ['Test PremiumTests failed at row 1. Expected 2 but got 100'],
    });
    const broken = await app.inject({
      method: 'POST',
      url: '/api/rules/pricing',
      headers,
      payload: Buffer.from('not a workbook'),
    });
    expect(broken.statusCode).toBe(400);
    expect(broken.json().error).toBe('XUFA_RULES_ERR_ZIP');
    expect(
      (await app.inject({ method: 'POST', url: '/api/rules/pricing', headers, payload: premiums() })).statusCode
    ).toBe(201);
    expect((await store.list({ tenant: 'acme' })).map((book) => book.name)).toEqual(['pricing']);
    expect(tenants).toContain('acme');
  });

  describe('books that import books', () => {
    // A book of discounts and a rate (pricing), and one of quotes whose Method imports them.
    const pricing = (gold = 0.1) => ({
      sheets: [
        {
          name: 'PRICING',
          rows: [
            ['SmartRules Double Discount(String plan)', null],
            ['Plan', 'Discount'],
            ['basic', 0],
            ['gold', gold],
            [null, null],
            ['Constants Rates', null, null],
            ['Double', 'vat', 0.2],
          ],
        },
      ],
    });
    const quotes = (expected = 108) => ({
      sheets: [
        {
          name: 'QUOTES',
          rows: [
            ['Method Double Quote(String plan, Double base)'],
            ["import { Discount, vat } from 'pricing'"],
            ['import * as all from "pricing"'],
            ['return base * (1 - Discount(plan)) * (1 + all.vat * 0 + vat)'],
            [null],
            ['Test Quote QuoteTest', null, null],
            ['plan', 'base', '_res_'],
            ['Plan', 'Base', 'Quote'],
            ['gold', 100, expected],
          ],
        },
      ],
    });

    test('a book uses the tables of the active version of another, of its tenant; a new version of it is seen', async () => {
      const { store } = await storeOf({ refresh: 0 });
      await store.save('pricing', pricing());
      expect(await store.save('quotes', quotes())).toMatchObject({ version: 1, errors: [] });
      expect(await store.call('quotes', 'Quote', 'gold', 100)).toBeCloseTo(108);
      expect((await store.book('quotes')).imports()).toEqual(['pricing']);
      // (A new active version of pricing: quotes takes it.)
      await store.save('pricing', pricing(0.5));
      expect(await store.call('quotes', 'Quote', 'gold', 100)).toBeCloseTo(60);
      // (Of another tenant: its own pricing, or none.)
      await expect(store.save('quotes', quotes(), { tenant: 'acme' })).rejects.toThrow(
        /No active book pricing to import/
      );
      await store.save('pricing', pricing(0), { tenant: 'acme' });
      expect(await store.save('quotes', quotes(120), { tenant: 'acme' })).toMatchObject({ errors: [] });
      expect(await (await store.book('quotes', { tenant: 'acme' })).call('Quote', 'gold', 100)).toBeCloseTo(120);
    });

    test('inspected with what it imports; books importing each other refused', async () => {
      const { store } = await storeOf();
      await store.save('pricing', pricing());
      const inspected = await store.inspect(quotes(), { name: 'quotes' });
      expect([inspected.imports, inspected.errors]).toEqual([['pricing'], []]);
      const importing = (name, other) => ({
        sheets: [
          {
            name: 'S',
            rows: [[`Method Double ${name}One()`], [`import { ${other}One } from '${other}'`], ['return 1']],
          },
        ],
      });
      await store.save('a', importing('a', 'b'), { force: true }).catch(() => null);
      await expect(store.save('b', importing('b', 'a'))).rejects.toThrow(
        /No active book a to import|Books import each other/
      );
      const cycle = await store.inspect(importing('a', 'a'), { name: 'a' });
      expect(cycle.errors).toEqual(['Books import each other: a → a']);
    });

    test('the books that import a book, directly or through others; what another version of it does to them', async () => {
      const { store } = await storeOf({ refresh: 0 });
      await store.save('pricing', pricing());
      await store.save('quotes', quotes());
      const reports = {
        sheets: [
          {
            name: 'R',
            rows: [
              ['Method Double Gold()'],
              ["import { Quote } from 'quotes'"],
              ["return Quote('gold', 100)"],
              [null],
              ['Test Gold GoldTest', null],
              ['_res_', null],
              ['Gold', null],
              [108, null],
            ],
          },
        ],
      };
      await store.save('reports', reports);
      await store.save('other', premiumsSheets());
      expect((await store.dependents('pricing')).map(({ name, direct }) => [name, direct])).toEqual([
        ['quotes', true],
        ['reports', false],
      ]);
      expect(await store.dependents('reports')).toEqual([]);
      // (A version of pricing that changes gold: the tests of quotes and of reports fail with it.)
      await store.save('pricing', pricing(0.5), { activate: false });
      const broken = await store.impact('pricing', { version: 2 });
      expect(broken.map(({ name, errors }) => [name, errors.length])).toEqual([
        ['quotes', 1],
        ['reports', 1],
      ]);
      expect(broken[0].errors[0]).toMatch(/QuoteTest failed at row 1/);
      // (One that keeps it, given as a book being saved: nothing breaks; the books in use are not touched.)
      expect((await store.impact('pricing', { input: pricing() })).every(({ errors }) => !errors.length)).toBe(true);
      expect(await store.call('quotes', 'Quote', 'gold', 100)).toBeCloseTo(108);
    });

    test('checkImporters: a version that breaks the books importing it is not made active, unless forced', async () => {
      const { store } = await storeOf({ refresh: 0, checkImporters: true });
      await store.save('pricing', pricing());
      await store.save('quotes', quotes());
      // (Saved as the active one: refused, nothing kept.)
      const refused = await store.save('pricing', pricing(0.5)).catch((err) => err);
      expect([refused.code, refused.breaks.map((item) => item.name)]).toEqual(['XUFA_RULES_ERR_BREAKS', ['quotes']]);
      expect(refused.message).toBe('The new active version of pricing breaks the books that import it: quotes');
      expect(refused.errors[0]).toMatch(/^quotes: Test QuoteTest failed at row 1/);
      expect((await store.versions('pricing')).length).toBe(1);
      // (Kept without being made active: allowed; made active later: refused, then forced.)
      expect(await store.save('pricing', pricing(0.5), { activate: false })).toMatchObject({ version: 2 });
      await expect(store.activate('pricing', 2)).rejects.toMatchObject({ code: 'XUFA_RULES_ERR_BREAKS' });
      expect(await store.call('quotes', 'Quote', 'gold', 100)).toBeCloseTo(108);
      expect(await store.activate('pricing', 2, { breaking: true })).toBe(2);
      expect(await store.call('quotes', 'Quote', 'gold', 100)).toBeCloseTo(60);
      // (A version that breaks nothing, and force.)
      expect(await store.activate('pricing', 1)).toBe(1);
      expect(await store.save('pricing', pricing(0.7), { force: true })).toMatchObject({ version: 3 });
      // (Without the option: as before, nothing refused.)
      const { store: open } = await storeOf();
      await open.save('pricing', pricing());
      await open.save('quotes', quotes());
      expect(await open.save('pricing', pricing(0.5))).toMatchObject({ version: 2 });
    });

    test('without a store: the books a book imports given to it; an export it lacks is an error', () => {
      const book = RuleBook.fromSheets(quotes().sheets, {
        modules: { pricing: RuleBook.fromSheets(pricing().sheets) },
      });
      expect(book.call('Quote', 'basic', 10)).toBeCloseTo(12);
      const wrong = RuleBook.fromSheets(
        [{ name: 'S', rows: [['Method Double F()'], ["import { Nope } from 'pricing'"], ['return Nope()']] }],
        { modules: { pricing: RuleBook.fromSheets(pricing().sheets) } }
      );
      expect(() => wrong.call('F')).toThrow(/The module does not export Nope/);
    });

    test('tdz: of every book of the store, a let or const of a Method used before its declaration is an error', async () => {
      // (rate read before its line: undefined by default, so the total is NaN; with tdz, an error at that line.)
      const sheets = () => [
        {
          name: 'M',
          rows: [
            ['Method Double Total(Double base)'],
            ['const total = base * rate;'],
            ['const rate = 1.21;'],
            ['return total;'],
          ],
        },
      ];
      const { store: open } = await storeOf();
      await open.save('totals', { sheets: sheets() });
      expect(await open.call('totals', 'Total', 100)).toBeNaN();
      const { store } = await storeOf({ tdz: true });
      await store.save('totals', { sheets: sheets() });
      await expect(store.call('totals', 'Total', 100)).rejects.toThrow(/rate is used before its declaration/);
      // (A book given made, without the option: the store's copy of it has it; the book given is not changed.)
      const made = RuleBook.fromSheets(sheets());
      await store.save('made', made);
      await expect(store.call('made', 'Total', 100)).rejects.toThrow(/rate is used before its declaration/);
      expect(made.options.tdz).toBeUndefined();
      expect(made.call('Total', 100)).toBeNaN();
      // (Without a store: the option of the book. Code in order runs as always.)
      expect(() => RuleBook.fromSheets(sheets(), { tdz: true }).call('Total', 100)).toThrow(/rate is used before/);
      const fixed = [{ name: 'M', rows: [['Method Double Total(Double base)'], ['const rate = 1.21;'], ['return base * rate;']] }];
      await store.save('fixed', { sheets: fixed });
      expect(await store.call('fixed', 'Total', 100)).toBeCloseTo(121);
    });
  });
});
