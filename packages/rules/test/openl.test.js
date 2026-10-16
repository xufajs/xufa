// The tables and conditions of OpenL Tablets: SmartRules, SimpleRules, SmartLookup, SimpleLookup, and their
// conditions (lists, ranges in every form, wildcards), results and Collect.
import { RuleBook } from '../index.js';
import { conditionOf } from '../lib/conditions.js';

const sheet = (rows, merges = []) => [{ name: 'S', rows, merges }];

describe('conditions of OpenL', () => {
  test('ranges in every form, numbers with $ K M B and commas, lists, texts ranges and wildcards', () => {
    const cases = [
      ['[1; 5]', 'Integer', 5, true],
      ['[1; 5)', 'Integer', 5, false],
      ['(1 .. 5)', 'Integer', 1, false],
      ['1 - 5', 'Integer', 3, true],
      ['1-11', 'Integer', 11, true],
      ['1 – 5', 'Integer', 5, true],
      ['1 … 5', 'Integer', 5, false],
      ['<5', 'Integer', 4, true],
      ['>1 <5', 'Integer', 5, false],
      ['5+', 'Integer', 99, true],
      ['5 and more', 'Integer', 5, true],
      ['more than 5', 'Integer', 5, false],
      ['less than 5', 'Integer', 4, true],
      ['$1,500', 'Double', 1500, true],
      ['2K', 'Integer', 2000, true],
      ['[1K; 2M]', 'Double', 1500000, true],
      ['-5 - -1', 'Integer', -3, true],
      ['1,500, 2,000', 'Integer', 2000, true],
      ['US, CA', 'String', 'ca', true],
      ['US, CA', 'String', 'MX', false],
      ['Driver\\, Passenger', 'String', 'Driver, Passenger', true],
      ['Z100-Z105, Z107', 'String', 'Z103', true],
      ['Z100-Z105, Z107', 'String', 'Z106', false],
      ['north-east', 'String', 'north-east', true],
      ['*', 'String', 'anything', true],
      [null, 'Integer', 3, true],
      ['[2024-01-01; 2024-12-31]', 'Date', '2024-06-01', true],
      ['2024-01-01 - 2024-03-01', 'Date', '2024-02-01', true],
      ['>= 2025-01-01', 'Date', new Date('2024-06-01'), false],
      ['true', 'Boolean', true, true],
    ];
    for (const [cell, type, value, expected] of cases) {
      expect([cell, type, value, conditionOf(cell, type)(value)]).toEqual([cell, type, value, expected]);
    }
  });
});

describe('SmartRules and SimpleRules', () => {
  test('titles matched to the parameters by their words; lists, ranges and empty conditions', () => {
    const book = RuleBook.fromSheets(
      sheet([
        ['SmartRules Double Discount(String customerPlan, Integer customerAge)', null, null],
        ['Age', 'Plan', 'Discount'],
        ['<25', 'basic', 0],
        ['25 - 60', 'basic, gold', 0.05],
        [null, 'premium', 0.1],
        ['60+', null, 0.2],
      ])
    );
    expect(book.call('Discount', 'basic', 20)).toBe(0);
    expect(book.call('Discount', 'gold', 30)).toBe(0.05);
    expect(book.call('Discount', 'premium', 70)).toBe(0.1);
    expect(book.call('Discount', 'basic', 70)).toBe(0.2);
    expect(book.call('Discount', 'silver', 30)).toBeUndefined();
  });

  test('fields of a datatype argument, two columns under one title as a range, and expressions as conditions', () => {
    const book = RuleBook.fromSheets(
      sheet(
        [
          ['Datatype Driver', null, null, null],
          ['Integer', 'age', null, null],
          ['String', 'state', null, null],
          [null, null, null, null],
          ['SmartRules String Category(Driver driver)', null, null, null],
          ['Driver Age', null, 'is true?', 'Category'],
          [16, 25, '= driver.state === "CA"', 'young CA'],
          [16, 25, null, 'young'],
          [25, null, null, 'adult'],
        ],
        [{ top: 5, left: 0, bottom: 5, right: 1 }]
      )
    );
    expect(book.call('Category', { age: 20, state: 'CA' })).toBe('young CA');
    expect(book.call('Category', { age: 20, state: 'NY' })).toBe('young');
    expect(book.call('Category', { age: 25, state: 'NY' })).toBe('adult');
  });

  test('the first non-empty of the result columns; an empty result goes on; $RuleId and $Rule', () => {
    const book = RuleBook.fromSheets(
      sheet([
        ['SmartRules String Volume(String coverage, Double history)', null, null, null],
        ['Rule', 'Coverage', 'Volume 1', 'Volume 2'],
        ['medical', 'Medical', '= history > 0 ? "from history" : null', 'by default'],
        ['other', null, null, '= $Rule + " #" + $RuleId'],
      ])
    );
    expect(book.call('Volume', 'Medical', 10)).toBe('from history');
    expect(book.call('Volume', 'Medical', 0)).toBe('by default');
    expect(book.call('Volume', 'Dental', 0)).toBe('other #2');
  });

  test('Collect gives every result; a datatype result is made of the result columns', () => {
    const book = RuleBook.fromSheets(
      sheet([
        ['Datatype Offer', null, null],
        ['String', 'name', null],
        ['Double', 'rate', null],
        [null, null, null],
        ['SmartRules Collect String[] Schemes(String plan)', null, null],
        ['Plan', 'Scheme', null],
        ['basic, gold', 'fixed', null],
        ['gold', 'variable', null],
        [null, 'savings', null],
        [null, null, null],
        ['SmartRules Offer BestOffer(String plan)', null, null],
        ['Plan', 'Offer Name', 'Rate'],
        ['gold', 'Gold offer', '0.05'],
        [null, 'Standard', '0.02'],
      ])
    );
    expect(book.call('Schemes', 'gold')).toEqual(['fixed', 'variable', 'savings']);
    expect(book.call('Schemes', 'premium')).toEqual(['savings']);
    expect(book.call('BestOffer', 'gold')).toEqual({ name: 'Gold offer', rate: 0.05 });
    expect(book.call('BestOffer', 'basic')).toEqual({ name: 'Standard', rate: 0.02 });
  });

  test('SimpleRules: the first columns are the parameters in order', () => {
    const book = RuleBook.fromSheets(
      sheet([
        ['SimpleRules Integer AmPmTo24(Integer ampmHr, String ampm)', null, null],
        ['AM/PM hour', 'AM or PM', '24 hour'],
        [12, 'AM', 0],
        ['1-11', 'AM', '=ampmHr'],
        [12, 'PM', 12],
        ['1-11', 'PM', '=ampmHr + 12'],
      ])
    );
    expect([book.call('AmPmTo24', 12, 'AM'), book.call('AmPmTo24', 7, 'AM'), book.call('AmPmTo24', 7, 'PM')]).toEqual([
      0, 7, 19,
    ]);
  });
});

describe('SmartLookup and SimpleLookup', () => {
  test('one argument down and one across; Test tables of them', async () => {
    const book = RuleBook.fromSheets(
      sheet([
        ['SmartLookup Double Rate(String plan, Integer age)', null, null, null],
        ['Plan / Age', '<25', '25 - 60', '>60'],
        ['basic', 120, 100, 150],
        ['premium, gold', 220, 180, 260],
        [null, null, null, null],
        ['Test Rate RateTests', null, null, null],
        ['plan', 'age', 'RET', null],
        ['gold', 30, 180, null],
        ['basic', 70, 150, null],
      ])
    );
    expect(book.call('Rate', 'basic', 20)).toBe(120);
    expect(book.call('Rate', 'gold', 61)).toBe(260);
    expect(book.call('Rate', 'silver', 61)).toBeUndefined();
    expect(await book.test()).toEqual([]);
  });

  test('the corner says how many arguments run across (its height) and down (its width)', () => {
    const book = RuleBook.fromSheets(
      sheet(
        [
          ['SmartLookup Double CoverageRate(String form, Integer staff, String area)', null, null, null, null],
          ['Coverage Type', '<= 14', '<= 14', '>= 15', '>= 15'],
          [null, 'Low', 'High', 'Low', 'High'],
          ['Basic', 20, 30, 30, 66],
          ['Plus', 35, 60, 60, 99],
        ],
        [
          { top: 1, left: 0, bottom: 2, right: 0 },
          { top: 1, left: 1, bottom: 1, right: 2 },
          { top: 1, left: 3, bottom: 1, right: 4 },
        ]
      )
    );
    expect(book.call('CoverageRate', 'Basic', 10, 'High')).toBe(30);
    expect(book.call('CoverageRate', 'Plus', 20, 'Low')).toBe(60);
  });

  test('SimpleLookup of one argument: every row is a rule', () => {
    const book = RuleBook.fromSheets(
      sheet([
        ['SimpleLookup Integer OneArg(String a)', null],
        ['Text1', 1],
        ['Text2', 2],
      ])
    );
    expect([book.call('OneArg', 'Text1'), book.call('OneArg', 'Text2')]).toEqual([1, 2]);
  });

  test('JSON and workbooks keep them, merges included', async () => {
    const original = RuleBook.fromSheets(
      sheet(
        [
          ['SmartRules String Category(Integer age)', null, null],
          ['Age', null, 'Category'],
          [0, 18, 'minor'],
          [18, null, 'adult'],
        ],
        [{ top: 1, left: 0, bottom: 1, right: 1 }]
      )
    );
    for (const book of [
      RuleBook.fromJSON(JSON.parse(JSON.stringify(original.toJSON()))),
      RuleBook.fromXlsx(original.toXlsx()),
    ]) {
      expect([book.call('Category', 10), book.call('Category', 18)]).toEqual(['minor', 'adult']);
    }
  });
});

describe('Test tables of OpenL', () => {
  test('_res_, _res_.fields, _description_, _error_, argument paths, and the results of each row', async () => {
    const book = RuleBook.fromSheets(
      sheet([
        ['Datatype Driver', null, null, null],
        ['Integer', 'age', null, null],
        ['String', 'state', null, null],
        [null, null, null, null],
        ['SmartRules Double Premium(Driver driver)', null, null, null],
        ['Driver Age', 'State', 'Premium', null],
        ['<25', 'CA', 300, null],
        ['<25', null, 200, null],
        ['25+', null, 100, null],
        [null, null, null, null],
        ['Spreadsheet SpreadsheetResult Quote(Driver driver)', null, null, null],
        ['Step', 'Formula', null, null],
        ['premium', '= Premium(driver)', null, null],
        ['total', '= $premium * 1.1', null, null],
        [null, null, null, null],
        ['Test Premium PremiumTests', null, null, null],
        ['driver.age', 'driver.state', '_res_', '_description_'],
        ['Age', 'State', 'Premium', 'Description'],
        [20, 'CA', 300, 'young in California'],
        ['40', 'NY', '100', null],
        [20, 'NY', 999, 'wrong on purpose'],
        [null, null, null, null],
        ['Test Quote QuoteTests', null, null, null],
        ['driver.age', '_res_.premium', '_res_.total', null],
        ['Age', 'Premium', 'Total', null],
        [30, 100, 110, null],
      ])
    );
    expect(await book.test()).toEqual([
      'Test PremiumTests failed at row 3 (wrong on purpose). Expected 999 but got 200',
    ]);
    const [premiums, quotes] = book.testResults();
    expect(premiums.rows.map((row) => [row.row, row.passed, row.description])).toEqual([
      [1, true, 'young in California'],
      [2, true, null],
      [3, false, 'wrong on purpose'],
    ]);
    expect(premiums.rows[0]).toMatchObject({ input: [{ age: 20, state: 'CA' }], expected: 300, actual: 300 });
    expect(quotes.rows[0]).toMatchObject({ passed: true, expected: { premium: 100, total: 110 } });
  });

  test('_error_: the row passes when the table fails with that message', async () => {
    const book = RuleBook.fromSheets(
      sheet(
        [
          ['Method Double Ratio(Double a, Double b)', null],
          ['return b === 0 ? error("division by zero") : a / b', null],
          [null, null],
          ['Test Ratio RatioTests', null],
          ['a', 'b', '_res_', '_error_'],
          ['A', 'B', 'Ratio', 'Error'],
          [1, 2, 0.5, null],
          [1, 0, null, 'division by zero'],
        ].map((row) => [...row, null, null].slice(0, 4))
      )
    );
    expect(await book.test()).toEqual([]);
  });
});

describe('Spreadsheets of OpenL', () => {
  test('columns and rows: $Column$Row, $Row and $Column, ranges, types, any order; RETURN of a typed result', () => {
    const book = RuleBook.fromSheets(
      sheet([
        ['Spreadsheet SpreadsheetResult Plan(Double rate)', null, null, null],
        ['Step', 'Year1', 'Year2', 'Total : Double'],
        ['Premium', 100, '= $Year1 * (1 + rate)', '= $Year1 + $Year2'],
        ['Tax', '= $Premium * 0.1', '= $Premium * 0.1', '= Fun.sum($Year1:$Year2)'],
        ['Net', '= $Premium - $Tax', '= $Year2$Premium - $Year2$Tax', '= $Total$Premium - $Total$Tax'],
        [null, null, null, null],
        ['Spreadsheet Double Net(Double rate)', null, null],
        ['Step', 'Value', 'Note'],
        ['Base', '= $RETURN * 0 + 100', 'any order'],
        ['RETURN', '= Plan(rate).Net.Total', null],
      ])
    );
    const plan = book.call('Plan', 0.1);
    expect(plan.Premium.Year1).toBe(100);
    expect(plan.Premium.Year2).toBeCloseTo(110);
    expect(plan.Premium.Total).toBeCloseTo(210);
    expect(plan.Tax.Total).toBeCloseTo(21);
    expect(plan.Net.Total).toBeCloseTo(189);
    expect(book.call('Net', 0.1)).toBeCloseTo(189);
  });

  test('two columns stay steps in order (+= and repeated names), and a scalar type gives the last value', () => {
    const book = RuleBook.fromSheets(
      sheet([
        ['Spreadsheet Double Total(Double base)', null],
        ['Step', 'Formula'],
        ['total', '= base'],
        ['total', '+= 10'],
        ['total', '*= 2'],
      ])
    );
    expect(book.call('Total', 5)).toBe(30);
  });

  test('a cycle is told to onError and the cell is undefined; grids survive JSON and workbooks', () => {
    const errors = [];
    const rows = [
      ['Spreadsheet SpreadsheetResult Loop(Double x)', null, null],
      ['Step', 'A', 'B'],
      ['One', '= $B', '= $A'],
      ['Two', '= x', 2],
    ];
    const book = RuleBook.fromSheets(sheet(rows), { onError: (err) => errors.push(err.message) });
    expect(book.call('Loop', 1)).toEqual({ One: { A: undefined, B: undefined }, Two: { A: 1, B: 2 } });
    expect(errors[0]).toMatch(/refers to itself/);
    for (const copy of [
      RuleBook.fromJSON(JSON.parse(JSON.stringify(book.toJSON()))),
      RuleBook.fromXlsx(book.toXlsx()),
    ]) {
      expect(copy.call('Loop', 3).Two).toEqual({ A: 3, B: 2 });
    }
  });
});

describe('versions by business dimensions, properties, Data and Run tables', () => {
  // Premiums of an insurer: the general one, one for New York and California (more specific), and dates.
  const versioned = () =>
    RuleBook.fromSheets(
      sheet(
        [
          ['SmartRules Double Premium(String plan)', null, null],
          ['Plan', 'Premium', null],
          ['basic', 100, null],
          [null, null, null],
          ['SmartRules Double Premium(String plan)', null, null],
          ['properties', 'state', 'NY, CA'],
          ['Plan', 'Premium', null],
          ['basic', 120, null],
          [null, null, null],
          ['SmartRules Double Fee(String plan)', null, null],
          ['properties', 'effectiveDate', '2026-01-01'],
          ['properties', 'expirationDate', '2026-12-31'],
          ['Plan', 'Fee', null],
          ['basic', 10, null],
          [null, null, null],
          ['SmartRules Double Fee(String plan)', null, null],
          ['properties', 'effectiveDate', '2027-01-01'],
          ['Plan', 'Fee', null],
          ['basic', 12, null],
          [null, null, null],
          ['SmartRules Double Total(String plan)', null, null],
          ['properties', 'failOnMiss', 'true'],
          ['Plan', 'Total', null],
          ['basic', '= Premium(plan) + Fee(plan)', null],
        ],
        [{ top: 10, left: 0, bottom: 11, right: 0 }]
      )
    );

  test('the version of the runtime context: the most specific, by date; failOnMiss', () => {
    const book = versioned();
    const in2026 = { currentDate: new Date('2026-06-01') };
    expect(book.withContext({ ...in2026, usState: 'NY' }).call('Premium', 'basic')).toBe(120);
    expect(book.withContext({ ...in2026, usState: 'TX' }).call('Premium', 'basic')).toBe(100);
    expect(book.withContext(in2026).call('Fee', 'basic')).toBe(10);
    expect(book.withContext({ currentDate: new Date('2027-03-01') }).call('Fee', 'basic')).toBe(12);
    // A table calls the versions of the context of the call.
    expect(book.withContext({ ...in2026, usState: 'CA' }).call('Total', 'basic')).toBe(130);
    expect(() => book.withContext(in2026).call('Total', 'gold')).toThrow(
      expect.objectContaining({ code: 'XUFA_RULES_ERR_MISS' })
    );
    expect(() => book.withContext({ currentDate: new Date('2025-06-01') }).call('Fee', 'basic')).toThrow(
      expect.objectContaining({ code: 'XUFA_RULES_ERR_NO_VERSION' })
    );
  });

  test('two versions as specific as each other are ambiguous; Properties tables give properties to a sheet', () => {
    const book = RuleBook.fromSheets([
      {
        name: 'A',
        rows: [
          ['Properties', null],
          ['scope', 'Worksheet'],
          ['lob', 'auto'],
          [null, null],
          ['SimpleRules Double Rate(String plan)', null],
          ['Plan', 'Rate'],
          ['basic', 1],
        ],
      },
      {
        name: 'B',
        rows: [
          ['SimpleRules Double Rate(String plan)', null],
          ['properties', 'lob'],
          ['Plan', 'Rate'],
          ['basic', 2],
        ],
      },
    ]);
    book.tables[2].ownProperties = { lob: 'auto' };
    const again = RuleBook.fromJSON(book.toJSON());
    expect(() => again.withContext({ lob: 'auto' }).call('Rate', 'basic')).toThrow(
      expect.objectContaining({ code: 'XUFA_RULES_ERR_AMBIGUOUS' })
    );
    expect(again.table('Rate').properties).toEqual({ lob: 'auto' });
  });

  test('versions survive JSON and workbooks (their properties rows written back)', () => {
    const book = versioned();
    for (const copy of [
      RuleBook.fromJSON(JSON.parse(JSON.stringify(book.toJSON()))),
      RuleBook.fromXlsx(book.toXlsx()),
    ]) {
      expect(copy.withContext({ currentDate: new Date('2026-06-01'), usState: 'NY' }).call('Total', 'basic')).toBe(130);
    }
  });

  test('Data tables are lists of records (or values) of every expression; Run tables run each row', () => {
    const book = RuleBook.fromSheets(
      sheet([
        ['Datatype Car', null, null],
        ['String', 'make', null],
        ['Double', 'price', null],
        [null, null, null],
        ['Data Car cars', null, null],
        ['make', 'price', null],
        ['Make', 'Price', null],
        ['Volvo', '45000', null],
        ['Seat', 20000, null],
        [null, null, null],
        ['Data Integer limits', null, null],
        ['this', null, null],
        ['Limit', null, null],
        [100, null, null],
        [200, null, null],
        [null, null, null],
        ['Method Double Cheapest()', null, null],
        ['return Math.min(...cars.map((car) => car.price))', null, null],
        [null, null, null],
        ['Method Double Price(String make)', null, null],
        ['return cars.find((car) => car.make === make)?.price', null, null],
        [null, null, null],
        ['Run Price PriceRuns', null, null],
        ['make', null, null],
        ['Make', null, null],
        ['Seat', null, null],
        ['Tesla', null, null],
      ])
    );
    expect(book.call('cars')).toEqual([
      { make: 'Volvo', price: 45000 },
      { make: 'Seat', price: 20000 },
    ]);
    expect(book.call('limits')).toEqual([100, 200]);
    expect(book.call('Cheapest')).toBe(20000);
    const [runs] = book.testResults();
    expect(runs.kind).toBe('Run');
    expect(runs.rows.map((row) => [row.input, row.actual, row.passed])).toEqual([
      [['Seat'], 20000, true],
      [['Tesla'], null, true],
    ]);
  });
});

describe('traces', () => {
  const book = () =>
    RuleBook.fromSheets(
      sheet([
        ['SmartRules Double Premium(String plan)', null, null],
        ['Plan', 'Premium', null],
        ['basic', 100, null],
        [null, null, null],
        ['SmartRules Double Premium(String plan)', null, null],
        ['properties', 'state', 'NY, CA'],
        ['Plan', 'Premium', null],
        ['gold', 150, null],
        ['basic', 120, null],
        [null, null, null],
        ['Rules Double Fee(String plan)', null, null],
        ['C1', 'RET', null],
        ['plan', null, null],
        ['String', 'Float', null],
        ['basic', 10, null],
        [null, null, null],
        ['SmartRules Double Total(String plan)', null, null],
        ['Plan', 'Total', null],
        ['basic', '= Premium(plan) + Fee(plan)', null],
        ['gold', '= error("no gold")', null],
      ])
    );

  test('the calls of a call, their results, the version chosen and the cells that gave each result', () => {
    const rules = book();
    const trace = rules.trace('Total', ['basic'], { usState: 'NY' });
    expect(trace).toMatchObject({
      table: 'Total',
      kind: 'SmartRules',
      result: 130,
      cells: [{ sheet: 'S', row: 18, column: 1 }],
    });
    expect(trace.children.map(({ table, result, cells, version }) => ({ table, result, cells, version }))).toEqual([
      { table: 'Premium', result: 120, cells: [{ sheet: 'S', row: 8, column: 1 }], version: { state: 'NY, CA' } },
      { table: 'Fee', result: 10, cells: [{ sheet: 'S', row: 14, column: 1 }], version: undefined },
    ]);
    // Without a state in the context, the general version (it restricts nothing the context does not tell).
    expect(rules.trace('Total', ['basic']).children[0]).toMatchObject({ result: 100, cells: [{ row: 2 }] });
    // Errors are in their nodes; tracing leaves the book as it was.
    expect(rules.trace('Total', ['gold'])).toMatchObject({ error: expect.stringContaining('no gold') });
    expect(rules.tracer).toBeNull();
    expect(rules.call('Total', 'basic')).toBe(110);
  });
});

describe('gaps and overlaps', () => {
  test('the cases that no rule meets, that several do, and the rules that never win', () => {
    const book = RuleBook.fromSheets(
      sheet([
        ['SmartRules Double Discount(String customerPlan, Integer customerAge)', null, null],
        ['Age', 'Plan', 'Discount'],
        ['<25', 'basic', 0],
        ['25 - 60', 'basic, gold', 0.05],
        [null, 'premium', 0.1],
        ['60+', null, 0.2],
        ['30', 'gold', 0.07],
        [null, null, null],
        ['Rules Float BasePremium(String plan, Integer age)', null, null, null, null],
        ['C1', 'HC1', 'RET', null, null],
        ['plan', 'age', null, null, null],
        ['String', 'IntRange', 'Float', null, null],
        [null, '<25', '[25..60)', '>=65', null],
        ['basic', 120, 100, 150, null],
        ['premium', 220, 180, 260, null],
        [null, null, null, null, null],
        ['SmartLookup Double Rate(String region, Integer year)', null, null],
        ['Region', 2025, 2026],
        ['north', 1, 2],
        ['south', 3, null],
      ])
    );
    const [discount] = book.analyze('Discount');
    const [rules] = discount.axes;
    expect(rules.dimensions).toEqual(['customerAge', 'customerPlan']);
    expect(rules.gaps).toContainEqual({ customerAge: '<25', customerPlan: 'gold' });
    // (Merged into ranges, as conditions write them.)
    expect(rules.gaps).toContainEqual({ customerAge: '<60', customerPlan: 'not basic, gold, premium' });
    expect(rules.gapCount).toBe(6);
    expect(rules.overlaps).toContainEqual({
      rules: [2, 4],
      count: 2,
      example: { customerAge: 60, customerPlan: 'basic' },
    });
    expect(rules.shadowed).toEqual([5]);
    expect(rules.rules[4].cell).toEqual({ sheet: 'S', row: 6, column: 0 });

    const [premium] = book.analyze('BasePremium');
    expect(premium.axes.map((axis) => [axis.axis, axis.gaps])).toEqual([
      ['rows', [{ plan: 'not basic, premium' }]],
      ['columns', [{ age: '[60..65)' }]],
    ]);

    const [rate] = book.analyze('Rate');
    expect(rate.axes[1].gaps).toEqual([{ year: '<2025' }, { year: '>2026' }]);
    expect(rate.holes).toEqual([{ row: 2, column: 2, cell: { sheet: 'S', row: 19, column: 2 } }]);
    expect(book.analyze().map((item) => item.table)).toEqual(['Discount', 'BasePremium', 'Rate']);
  });
});

describe('checks of formulas and what the tests reach', () => {
  const book = () =>
    RuleBook.fromSheets(
      sheet([
        ['Constants Rates', null, null],
        ['Float', 'vat', 0.21],
        [null, null, null],
        ['Spreadsheet SpreadsheetResult Quote(Double base, String plan)', null, null],
        ['Step', 'Formula', null],
        ['net', '= base * (1 - Discount(plan))', null],
        ['total', '= $net * (1 + vat) + $fee', null],
        ['fee', '= Fun.meen([1, 2]) + Discount(plan, 1, 2)', null],
        ['tax', '= vatt * $net + vat(1)', null],
        [null, null, null],
        ['SimpleRules Double Discount(String plan)', null, null],
        ['Plan', 'Discount', null],
        ['basic', 0.1, null],
        ['gold', '= plna === "gold" ? 0.2 : 0', null],
        [null, null, null],
        ['Spreadsheet Double Grid(Double x)', null, null],
        ['Step', 'A', 'B'],
        ['One', '= $B$Two + x', 1],
        ['Two', '= y', '= $A$One'],
        [null, null, null],
        ['Method Double Twice(Double x)', null, null],
        ['return x * 2 + Math.roud(x)', null, null],
        [null, null, null],
        ['Test Discount DiscountTest', null, null],
        ['plan', '_res_', null],
        ['Plan', 'Discount', null],
        ['basic', 0.1, null],
      ])
    );

  test('names of nothing, steps read before they are computed, members, arguments, calls of no table, cycles', () => {
    const issues = book()
      .lint()
      .map(({ table, code, cell, name }) => [table, code, name, `${cell.row},${cell.column}`]);
    expect(issues).toEqual([
      ['Quote', 'not-yet', '$fee', '6,1'],
      ['Quote', 'arity', 'Discount', '7,1'],
      ['Quote', 'unknown-member', 'Fun.meen', '7,1'],
      ['Quote', 'unknown-name', 'vatt', '8,1'],
      ['Quote', 'not-callable', 'vat', '8,1'],
      ['Discount', 'unknown-name', 'plna', '13,1'],
      ['Grid', 'unknown-name', 'y', '18,1'],
      ['Grid', 'cycle', '$A$One', '17,1'],
      ['Twice', 'unknown-member', 'Math.roud', '21,0'],
    ]);
  });

  test('the tables and rules no test reaches', () => {
    const { tests, tables } = book().coverage();
    expect(tests).toBe(1);
    expect(tables.map(({ table, tested }) => [table, tested])).toEqual([
      ['Quote', false],
      ['Discount', true],
      ['Grid', false],
      ['Twice', false],
    ]);
    expect(tables[1].rules).toEqual({
      total: 2,
      covered: 1,
      missed: [{ axis: 'rules', id: 2, cell: { sheet: 'S', row: 13, column: 0 } }],
    });
  });

  test('where a rule for a gap goes: a row after the rules, a column after a lookup, the cells of each condition', () => {
    const rules = RuleBook.fromSheets(
      sheet([
        ['SmartRules Double Discount(String plan, Integer age)', null, null],
        ['Plan', 'Age', 'Discount'],
        ['basic', '<25', 0],
        [null, null, null],
        ['SmartLookup Double Rate(String region, Integer year)', null, null],
        ['Region', 2025, 2026],
        ['north', 1, 2],
      ])
    );
    const [discount, rate] = rules.analyze();
    expect(discount.axes[0].add).toEqual({
      row: 3,
      cells: [
        { column: 0, lists: true, ranges: true },
        { column: 1, lists: true, ranges: true },
      ],
      focus: { column: 2 },
    });
    expect(rate.axes[1].add).toEqual({ column: 3, cells: [{ row: 5, lists: true, ranges: true }], focus: { row: 6 } });
  });
});

describe('default values of datatypes', () => {
  test('the fields that Data records, SmartRules results and the inputs of tests do not give', async () => {
    const book = RuleBook.fromSheets(
      sheet([
        ['Datatype Policy', null, null],
        ['String', 'plan', 'basic'],
        ['Integer', 'years', '1'],
        ['Boolean', 'renewable', 'true'],
        [null, null, null],
        ['Data Policy policies', null, null],
        ['plan', 'years', null],
        ['Plan', 'Years', null],
        ['gold', 3, null],
        [null, 5, null],
        [null, null, null],
        ['SmartRules Policy Offer(String region)', null, null],
        ['Region', 'Plan', null],
        ['north', 'gold', null],
        [null, null, null],
        ['Spreadsheet SpreadsheetResult Quote(Policy policy)', null, null],
        ['Step', 'Formula', null],
        ['label', '= `${policy.plan} ${policy.years} ${policy.renewable}`', null],
        [null, null, null],
        ['Test Quote QuoteTests Policy', null, null],
        ['plan', 'years', 'RET.label'],
        ['gold', null, 'gold 1 true'],
        [null, 4, 'basic 4 true'],
        [null, null, null],
        ['Test Quote QuoteOpenL', null, null],
        ['policy.years', '_res_.label', null],
        ['Years', 'Label', null],
        [2, 'basic 2 true', null],
      ])
    );
    expect(book.call('policies')).toEqual([
      { plan: 'gold', years: 3, renewable: true },
      { plan: 'basic', years: 5, renewable: true },
    ]);
    expect(book.call('Offer', 'north')).toEqual({ plan: 'gold', years: 1, renewable: true });
    expect(await book.test()).toEqual([]);
    // Arguments of calls: a copy takes the defaults (the application's object is not changed); one that lacks none
    // is given as it is.
    const policy = { plan: 'gold' };
    expect(book.call('Quote', policy)).toEqual({ label: 'gold 1 true' });
    expect(policy).toEqual({ plan: 'gold' });
    expect(book.call('Quote', { plan: 'gold', years: 0, renewable: false })).toEqual({ label: 'gold 0 false' });
  });

  test('lists of a datatype, arguments of calls from expressions, and versions', () => {
    const book = RuleBook.fromSheets(
      sheet([
        ['Datatype Item', null, null],
        ['String', 'name', null],
        ['Integer', 'quantity', '1'],
        [null, null, null],
        ['Spreadsheet Double Count(Item[] items)', null, null],
        ['Step', 'Formula', null],
        ['RETURN', '= Fun.sum(items.map((item) => item.quantity))', null],
        [null, null, null],
        ['Spreadsheet Double One(Item item)', null, null],
        ['Step', 'Formula', null],
        ['RETURN', '= item.quantity', null],
        [null, null, null],
        ['Method Double Twice()', null, null],
        ['return One({ name: "a" }) * 2', null, null],
      ])
    );
    expect(book.call('Count', [{ name: 'a' }, { name: 'b', quantity: 3 }])).toBe(4);
    expect(book.call('Twice')).toBe(2);
    expect(book.withContext({ lob: 'x' }).call('One', { name: 'a' })).toBe(1);
  });

  test('nested datatypes, at any depth: objects and lists of them filled, none made; datatypes of themselves', () => {
    const book = RuleBook.fromSheets(
      sheet([
        ['Datatype Address', null, null],
        ['String', 'country', 'ES'],
        ['String', 'city', null],
        [null, null, null],
        ['Datatype Driver', null, null],
        ['String', 'name', null],
        ['Address', 'address', null],
        ['Address[]', 'previous', null],
        ['Driver', 'mentor', null],
        [null, null, null],
        ['Spreadsheet SpreadsheetResult Show(Driver driver)', null, null],
        ['Step', 'Formula', null],
        ['country', '= driver.address?.country', null],
        ['previous', '= (driver.previous ?? []).map((address) => address.country)', null],
        ['mentor', '= driver.mentor?.address?.country', null],
        [null, null, null],
        ['Method Driver Same(Driver driver)', null, null],
        ['return driver', null, null],
      ])
    );
    const driver = {
      name: 'Ada',
      address: { city: 'Madrid' },
      previous: [{ city: 'Lyon', country: 'FR' }, { city: 'Vigo' }],
      mentor: { name: 'Bo', address: { city: 'Porto' } },
    };
    expect(book.call('Show', driver)).toEqual({ country: 'ES', previous: ['FR', 'ES'], mentor: 'ES' });
    // The application's objects are not changed; an object without the nested one gets none.
    expect(driver.address).toEqual({ city: 'Madrid' });
    expect(driver.previous[1]).toEqual({ city: 'Vigo' });
    expect(book.call('Show', { name: 'Cy' })).toMatchObject({ country: undefined, previous: [], mentor: undefined });
    // An object in itself is filled once.
    const loop = { name: 'Di', address: { city: 'Faro' } };
    loop.mentor = loop;
    expect(book.call('Show', loop)).toMatchObject({ country: 'ES', mentor: 'ES' });
    const copy = book.call('Same', loop);
    expect(copy).not.toBe(loop);
    expect(copy.mentor).toBe(copy);
    // An object that lacks nothing is given as it is.
    const full = { name: 'Ed', address: { country: 'PT' }, previous: [] };
    expect(book.call('Same', full)).toBe(full);
    // Methods keep the types of their parameters (in workbooks written back and in their JSON).
    const sheets = RuleBook.fromJSON(JSON.parse(JSON.stringify(book.toJSON()))).toSheets();
    const titles = sheets.flatMap((one) => one.rows.map((row) => row[0]?.value ?? row[0]));
    expect(titles).toContain('Method Driver Same(Driver driver)');
    expect(RuleBook.fromXlsx(book.toXlsx()).call('Same', { name: 'Fy' })).toMatchObject({ name: 'Fy' });
  });

  test('a default value that is no value of its type is a message of the tests', async () => {
    const book = RuleBook.fromSheets(
      sheet([
        ['Datatype Policy', null, null],
        ['Integer', 'years', 'many'],
      ])
    );
    expect(await book.test()).toEqual(['Datatype Policy, the default value of years: Invalid Integer many']);
  });
});
