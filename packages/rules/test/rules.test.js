// Books of rules of an insurer: premiums by plan and age (rules tables), a quote computed in steps (spreadsheet),
// constants, datatypes, methods, transforms, and the tests and checks of the book.
import { RuleBook, readXlsx, writeXlsx, RulesError, Fun } from '../index.js';

// The sheets of the example book (as readXlsx gives them: rows of values, null where empty).
function pricingSheets() {
  return [
    {
      name: 'RULES',
      rows: [
        ['Rules Float BasePremium(String plan, Integer age)', null, null, null, null],
        ['C1', 'HC1', 'RET', null, null],
        ['plan', 'age', null, null, null],
        ['String', 'IntRange', 'Float', null, null],
        [null, '<25', '[25..60)', '>=60', null],
        ['basic', 120, 100, 150, null],
        ['prémium', 220, 180, 260, null],
        [null, null, null, null, null],
        ['Rules String Region(String country)', null, null, null, null],
        ['C1', 'RET', null, null, null],
        ['country', 'RET.toUpperCase()', null, null, null],
        ['String', 'String', null, null, null],
        ['es', 'south', null, null, null],
        ['se', 'north', null, null, null],
        [null, 'other', null, null, null],
        [null, null, null, null, null],
        ['Rules Surcharge(String region, Float base)', null, null, null, null],
        ['C1', 'RET', null, null, null],
        ['region', null, null, null, null],
        ['String', 'Float', null, null, null],
        ['NORTH', '=base * northRate', null, null, null],
        [null, 0, null, null, null],
        [null, null, null, null, null],
        ['Multi Code Covers(String plan)', null, null, null, null],
        ['C1', 'RET', null, null, null],
        ['plan', null, null, null, null],
        ['String', 'Code', null, null, null],
        [null, 'liability', null, null, null],
        ['premium', 'theft', null, null, null],
        ['premium', ' glass ', null, null, null],
      ],
    },
    {
      name: 'SPREADSHEET',
      rows: [
        ['Spreadsheet SpreadsheetResult Quote(Customer customer)', null],
        ['Step', 'Formula'],
        ['base', '= BasePremium(customer.plan, customer.age)'],
        ['region', '= Region(customer.country)'],
        ['surcharge', '= Surcharge($region, $base)'],
        ['total', '= $base + $surcharge;'],
        ['total', '*= customer.years > 3 ? 0.9 : 1'],
        ['this.covers', '= Covers(customer.plan)'],
        [null, 'delete $surcharge'],
      ],
    },
    {
      name: 'OTHERS',
      rows: [
        ['Constants Rates', null, null],
        ['Float', 'northRate', 0.1],
        ['Integer', 'maxAge', 99],
        [null, null, null],
        ['Datatype Customer', null, null],
        ['String', 'plan', 'basic'],
        ['Integer', 'age', null],
        ['String', 'country', null],
        ['Integer', 'years', null],
        [null, null, null],
        ['Method Float Round2(Float value)', null, null],
        ['return Math.round(value * 100) / 100;', null, null],
        [null, null, null],
        ['Transform Letter', null, null],
        ['customer.name', "'@name'", null],
        ['customer.label', "'@`${name} (${plan})`'", null],
        ['by', "'{{company}}'", null],
        ['total', "'@Round2($.total * 1.21)'", null],
        ['note', "'@@not an expression'", null],
      ],
    },
    {
      name: 'TESTS',
      rows: [
        ['Test BasePremium BasePremiumTests', null, null],
        ['plan', 'age', 'RET'],
        ['basic', 30, 100],
        ['premium', 70, 260],
        ['basic', 20, 120],
        [null, null, null],
        ['Test Quote QuoteTests Customer', null, null, null, null, null, null, null],
        ['plan', 'age', 'country', 'years', 'RET.base', 'RET.region', 'RET.total', 'RET.covers'],
        ['basic', '30', 'es', '1', 100, 'SOUTH', 100, 'liability'],
        ['basic', '30', 'se', '5', 100, 'NORTH', 99, 'liability'],
      ],
    },
  ];
}

const pricing = (options) => RuleBook.fromSheets(pricingSheets(), options);

describe('rules tables', () => {
  test('the cell of the row and column whose conditions the values meet; texts without accents', () => {
    const book = pricing();
    expect(book.call('BasePremium', 'basic', 30)).toBe(100);
    expect(book.call('BasePremium', 'basic', 24)).toBe(120);
    expect(book.call('BasePremium', 'basic', 60)).toBe(150);
    expect(book.call('BasePremium', 'prémium', 30)).toBe(180);
    expect(book.call('BasePremium', 'premium', 30)).toBe(180);
    expect(book.call('BasePremium', 'gold', 30)).toBeUndefined();
    expect(book.fn('BasePremium')('premium', 61)).toBe(260);
  });

  test('empty conditions take any value; RET scripts; =cells see the parameters and the constants', () => {
    const book = pricing();
    expect(book.call('Region', 'es')).toBe('SOUTH');
    expect(book.call('Region', 'fr')).toBe('OTHER');
    expect(book.call('Surcharge', 'NORTH', 200)).toBeCloseTo(20);
    expect(book.call('Surcharge', 'SOUTH', 200)).toBe(0);
  });

  test('Multi tables give every result that matches, once', () => {
    const book = pricing();
    expect(book.call('Covers', 'basic')).toEqual(['liability']);
    expect(book.call('Covers', 'premium')).toEqual(['liability', 'theft', 'glass']);
  });

  test('Nested parameters make the result an object of their keys', () => {
    const book = RuleBook.fromSheets([
      {
        name: 'S',
        rows: [
          ['Rules Limits(String plan)', null, null],
          ['C1', 'HC1', 'RET'],
          ['plan', 'cover', null],
          ['String', 'Nested', 'Integer'],
          [null, 'theft', 'glass'],
          ['basic', 1000, 200],
          ['premium', 5000, 800],
        ],
      },
    ]);
    expect(book.call('Limits', 'premium')).toEqual({ theft: 5000, glass: 800 });
  });

  test('a book refuses repeated combinations and names, and says where', () => {
    const repeated = [
      {
        name: 'S',
        rows: [
          ['Rules A(String x)', null],
          ['C1', 'RET'],
          ['x', null],
          ['String', 'String'],
          ['a', '1'],
          ['a', '2'],
        ],
      },
    ];
    expect(() => RuleBook.fromSheets(repeated)).toThrow(/S!A1: Duplicated combination at table A/);
    const twice = [
      {
        name: 'S',
        rows: [
          ['Constants C', null, null],
          ['Integer', 'n', 1],
          [null, null, null],
          ['Method X()', null, null],
          ['return 1', null, null],
          [null, null, null],
          ['Method X()', null, null],
          ['return 2', null, null],
        ],
      },
    ];
    expect(() => RuleBook.fromSheets(twice)).toThrow('Table X was already defined');
    expect(() =>
      RuleBook.fromSheets([
        {
          name: 'S',
          rows: [
            ['Rules A(String x)', null],
            ['C1', 'RET'],
            ['y', null],
            ['String', 'String'],
          ],
        },
      ])
    ).toThrow('Param not found: y at Rule A');
  });
});

describe('spreadsheets', () => {
  test('steps in order: $refs, operators, paths of the result, delete; tables and methods by name', () => {
    const book = pricing();
    const quote = book.call('Quote', { plan: 'basic', age: 30, country: 'se', years: 5 });
    expect(quote).toEqual({ base: 100, region: 'NORTH', total: 99, covers: ['liability'] });
  });

  test('a step that gives undefined is reported in errors; one that throws is told to onError', () => {
    const errors = [];
    const book = RuleBook.fromSheets(
      [
        {
          name: 'S',
          rows: [
            ['Spreadsheet R Calc(Object input)', null],
            ['Step', 'Formula'],
            ['a', '= input.missing'],
            ['b', '= input.list.map(x => x * 2)'],
            ['c', 'not a formula'],
          ],
        },
      ],
      { onError: (err, info) => errors.push([err.code, info.table]) }
    );
    const result = book.call('Calc', { list: [1, 2] });
    expect(result.b).toEqual([2, 4]);
    expect(result.errors).toEqual(['Spreadsheet formula for "a" seems to be wrong']);
    expect(errors).toEqual([['XUFA_RULES_ERR_TABLE', 'Calc']]);
  });

  test('return rows give the result', () => {
    const book = RuleBook.fromSheets([
      {
        name: 'S',
        rows: [
          ['Spreadsheet R Calc(Object input)', null],
          ['Step', 'Formula'],
          ['x', '= input.n * 2'],
          [null, 'return { doubled: $x, ok: this.x > 1 }'],
        ],
      },
    ]);
    expect(book.call('Calc', { n: 2 })).toEqual({ doubled: 4, ok: true });
  });
});

describe('constants, datatypes, methods and transforms', () => {
  test('constants and methods of expressions are names of every expression', () => {
    const book = pricing();
    expect(book.context.northRate).toBe(0.1);
    expect(book.call('Round2', 1.234)).toBe(1.23);
    expect(book.table('Customer').params.plan).toEqual({ name: 'plan', type: 'String', defValue: 'basic' });
  });

  test('methods (option): functions values have as methods in the code of the book, its formulas and programs', () => {
    const sheets = [
      {
        name: 'S',
        rows: [
          ['Method Number Total(list)', null],
          ['return list.sum() + list.twice().length;', null],
          [null, null],
          ['Method Number Mean(list)', null],
          ['list.sum() / list.length', null],
        ],
      },
    ];
    const methods = { sum: (list) => list.reduce((a, b) => a + b, 0), twice: (value) => [value, value] };
    const book = RuleBook.fromSheets(sheets, { methods });
    expect(book.call('Total', [1, 2, 3])).toBe(8);
    expect(book.call('Mean', [2, 4])).toBe(3);
    // (Copies from its JSON with the option: the same.)
    expect(RuleBook.fromJSON(book.toJSON(), { methods }).call('Total', [5])).toBe(7);
    // Without it, the values have no such methods (lenient: undefined, as calls of what is not a function).
    expect(RuleBook.fromSheets(sheets).call('Mean', [2, 4])).toBeNaN();
  });

  test('methods of statements run as programs of @xufa/expression: as safe as formulas, with a limit of steps', () => {
    const sheets = [
      {
        name: 'S',
        rows: [
          ['Method Number Sum(list)', null],
          ['let total = 0;', null],
          ['for (const n of list) total += n * factor;', null],
          ['return total;', null],
          [null, null],
          ['Constants C', null],
          ['Integer', 'factor'],
          [null, null],
        ],
      },
    ];
    sheets[0].rows[6].push(2);
    sheets[0].rows.push(
      ['Method Object Label(person)', null],
      ['label = person.name;', null],
      ['if (person.vip) { label += " (VIP)" }', null],
      ['label', null],
      [null, null],
      ['Method Object Forever(x)', null],
      ['while (true) { x++ }', null]
    );
    const book = RuleBook.fromSheets(sheets);
    expect(book.call('Sum', [1, 2, 3])).toBe(12);
    // (No return: the value of the last statement, as in the engine this one follows.)
    expect(book.call('Label', { name: 'Ada', vip: true })).toBe('Ada (VIP)');
    expect(() => book.call('Forever', 1)).toThrow(expect.objectContaining({ code: 'XUFA_EXPR_ERR_LIMIT' }));
    const escape = [
      ['Method Object Escape(x)', null],
      ['const f = [].map.constructor;', null],
      ['return f("return process")();', null],
    ];
    expect(() => RuleBook.fromSheets([{ name: 'S', rows: escape }])).toThrow(/constructor cannot be reached/);
  });

  test("transforms: '@' expressions of the input, '@@' texts, templates of the context, and __apply__ pipes", () => {
    const book = pricing();
    expect(book.call('Letter', { name: 'Ada', plan: 'basic', total: 100 }, { company: 'Acme' })).toEqual({
      customer: { name: 'Ada', label: 'Ada (basic)' },
      by: 'Acme',
      total: 121,
      note: '@not an expression',
    });
    const piped = RuleBook.fromJSON([
      {
        className: 'TransformTable',
        name: 'T',
        template: { a: '@x', b: '@x', __apply__: [{ pipe: ['double'], paths: ['b'] }] },
      },
    ]);
    expect(piped.call('T', { x: 2 }, { double: (n) => n * 2 })).toEqual({ a: 2, b: 4 });
  });

  test('Fun has the helpers of the books', () => {
    expect(Fun.mean([1, 2, 3])).toBe(2);
    expect(Fun.median(3, 1, 2, 4)).toBe(2.5);
    expect(Fun.sortSeveral([3, 1, 2], ['c', 'a', 'b'])).toEqual([
      [1, 2, 3],
      ['a', 'b', 'c'],
    ]);
    expect(Fun.addToNested({}, ['a,b', 'x', [1, 2]])).toEqual({ a: { x: [1, 2] }, b: { x: [1, 2] } });
    expect(Fun.map([1, 2])((n) => n + 1)).toEqual([2, 3]);
    expect(Fun.allowIndexes(['a', 'b', 'c'], [0, 2])).toEqual(['a', 'c']);
  });
});

describe('tests and checks of a book', () => {
  test('passing tests give no messages; failing ones say the row, the expected and the actual', async () => {
    expect(await pricing().test()).toEqual([]);
    const sheets = pricingSheets();
    sheets[3].rows[2] = ['basic', 30, 999];
    sheets[3].rows[9] = ['basic', '30', 'se', '5', 100, 'NORTH', 90, 'liability'];
    expect(await RuleBook.fromSheets(sheets).test()).toEqual([
      'Test BasePremiumTests failed at row 1. Expected 999 but got 100',
      'Test QuoteTests failed at row 2.Expected object with property "total" equal to "90" but got "99"',
    ]);
  });

  test('check functions get every value a table can give', async () => {
    const sheets = pricingSheets();
    sheets[2].rows.push([null, null, null], ['Check Codes', null, null], ['Covers', null, null]);
    const seen = [];
    const errors = await RuleBook.fromSheets(sheets).test({
      checks: {
        Codes: async (values, table) => {
          seen.push(table, ...values);
          return values.filter((code) => code === 'theft').map((code) => `Unknown code ${code}`);
        },
      },
    });
    expect(seen).toEqual(['Covers', 'liability', 'theft', 'glass']);
    expect(errors).toEqual(['Unknown code theft']);
    expect(await RuleBook.fromSheets(sheets).test()).toEqual(['Check function for Check Table "Codes" not found']);
  });
});

describe('tests written of calls', () => {
  const sheet = (rows) => [{ name: 'S', rows }];
  const TABLES = [
    ['SmartRules Double Discount(String plan, Integer age)', null, null],
    ['Plan', 'Age', 'Discount'],
    ['basic', '<25', 0],
    ['gold', '25+', 0.05],
    [null, null, null],
    ['Spreadsheet SpreadsheetResult Quote(Double base)', null],
    ['Step', 'Formula'],
    ['net', '= base * 0.9'],
    ['total', '= $net * 2'],
    [null, null, null],
    ['Datatype Customer', null],
    ['String', 'plan'],
    ['Integer', 'age'],
    [null, null, null],
    ['Method Integer Score(Customer[] customers)'],
    ['return customers.length'],
    [null, null, null],
    ['Method Double Fails(Integer n)'],
    ['if (n > 2) error("too big"); return n'],
    [null, null, null],
    ['Method String[] Tags(Integer n)'],
    ['return ["a, b", "c"]'],
    [null, null, null],
    ['SmartRules Double Fee(String plan)', null],
    ['properties', 'usState', 'NY'],
    ['Plan', 'Fee'],
    ['basic', 10],
    [null, null, null],
    ['SmartRules Double Fee(String plan)', null],
    ['properties', 'usState', 'CA'],
    ['Plan', 'Fee'],
    ['basic', 20],
  ];

  test('a row of each call: arguments, fields of objects, the context, the result, an error; and it passes', async () => {
    const rows = [...TABLES];
    let book = RuleBook.fromSheets(sheet(rows));
    const cases = [
      ['Discount', ['gold', 30], undefined, ['plan', 'age', '_res_'], ['gold', 30, 0.05]],
      ['Quote', [100], undefined, ['base', '_res_.net', '_res_.total'], [100, 90, 180]],
      [
        'Score',
        [[{ plan: 'x', age: 20 }]],
        undefined,
        ['customers[0].plan', 'customers[0].age', '_res_'],
        ['x', 20, 1],
      ],
      ['Fails', [5], undefined, ['n', '_error_'], [5, 'too big']],
      ['Tags', [1], undefined, ['n', '_res_'], [1, 'a\\, b, c']],
      ['Fee', ['basic'], { usState: 'CA' }, ['plan', '_context_.usState', '_res_'], ['basic', 'CA', 20]],
    ];
    for (const [name, args, context, names, cells] of cases) {
      const written = book.testCase(name, args, { context });
      expect([name, written.names, written.cells]).toEqual([name, names, cells]);
      expect(written.titles.at(-1)).toMatch(/^(Expected|Error)/);
      rows.push([null], [written.title], written.names, written.titles, written.cells);
      book = RuleBook.fromSheets(sheet(rows));
    }
    // (Each a new table of a name no table has: DiscountTest, then DiscountTest2.)
    expect(book.testCase('Discount', ['basic', 20]).title).toBe('Test Discount DiscountTest2');
    expect(book.testResults().map((test) => [test.name, test.rows.every((row) => row.passed)])).toEqual([
      ['DiscountTest', true],
      ['QuoteTest', true],
      ['ScoreTest', true],
      ['FailsTest', true],
      ['TagsTest', true],
      ['FeeTest', true],
    ]);
    expect(() => book.testCase('Nope')).toThrow(expect.objectContaining({ code: 'XUFA_RULES_ERR_NOT_FOUND' }));
  });
});

describe('JSON and workbooks', () => {
  test('a book from its JSON runs and tests the same', async () => {
    const json = JSON.parse(JSON.stringify(pricing().toJSON()));
    const book = RuleBook.fromJSON(json);
    expect(book.call('BasePremium', 'premium', 61)).toBe(260);
    expect(book.call('Quote', { plan: 'basic', age: 30, country: 'se', years: 5 }).total).toBe(99);
    expect(await book.test()).toEqual([]);
  });

  test('a book written to .xlsx and read back runs and tests the same', async () => {
    const bytes = pricing().toXlsx();
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    const book = RuleBook.fromXlsx(bytes);
    expect(book.call('Covers', 'premium')).toEqual(['liability', 'theft', 'glass']);
    expect(book.call('Letter', { name: 'Ada', plan: 'basic', total: 100 }).customer.label).toBe('Ada (basic)');
    expect(await book.test()).toEqual([]);
    expect(readXlsx(bytes).sheets.map((sheet) => sheet.name)).toEqual(['RULES', 'SPREADSHEET', 'OTHERS', 'TESTS']);
  });

  test('readXlsx: texts, numbers, booleans, dates and merged ranges of a workbook', () => {
    const date = new Date(Date.UTC(2026, 0, 31));
    const bytes = writeXlsx({
      sheets: [
        {
          name: 'Data',
          rows: [
            [{ value: 'Title', style: 'title' }, null],
            ['á & <b>', 2.5],
            [true, date],
            ['', 'line\nbreak'],
          ],
          merges: [{ top: 0, left: 0, bottom: 0, right: 1 }],
        },
      ],
    });
    const [sheet] = readXlsx(bytes).sheets;
    expect(sheet.rows).toEqual([
      ['Title', null],
      ['á & <b>', 2.5],
      [true, date],
      ['', 'line\nbreak'],
    ]);
    expect(sheet.merges).toEqual([{ top: 0, left: 0, bottom: 0, right: 1 }]);
    expect(() => readXlsx(Buffer.from('not a zip'))).toThrow(expect.objectContaining({ code: 'XUFA_RULES_ERR_ZIP' }));
  });
});

describe('safety', () => {
  test('expressions of cells cannot reach the process: the step is left, told to onError, and test() says it', async () => {
    const sheets = [
      {
        name: 'S',
        rows: [
          ['Spreadsheet R Calc(Object input)', null],
          ['Step', 'Formula'],
          ['a', '= input.constructor.constructor("return process")()'],
          ['b', '= 2'],
        ],
      },
    ];
    const errors = [];
    const book = RuleBook.fromSheets(sheets, { onError: (err) => errors.push(err.code) });
    expect(book.call('Calc', {})).toEqual({ b: 2 });
    expect(errors).toEqual(['XUFA_RULES_ERR_EXPRESSION']);
    expect(await book.test()).toEqual([
      expect.stringMatching(/^Spreadsheet Calc, step 1 \(a\): constructor cannot be reached/),
    ]);
    expect(() =>
      RuleBook.fromSheets([
        {
          name: 'S',
          rows: [
            ['Method M()', null],
            ['return process.exit(1)', null],
          ],
        },
      ]).call('M')
    ).not.toThrow();
  });

  test('errors are RulesError with codes', () => {
    expect(() => pricing().call('Nope')).toThrow(RulesError);
    expect(() => pricing().call('Nope')).toThrow(expect.objectContaining({ code: 'XUFA_RULES_ERR_NOT_FOUND' }));
  });
});
