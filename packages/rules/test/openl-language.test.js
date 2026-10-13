// The language and tables of OpenL Tablets in books of OpenL: their dialect told by their formulas, the language
// (arrays, new, casts, Java's numbers, BEX, statements, safety), OpenL's decision tables, Data and Test tables with
// records and references, versions chosen by fields of arguments, spreadsheets, and Conditions/Returns/Actions.
import { RuleBook } from '../index.js';
import { compileOpenL } from '../lib/openl/lower.js';

const sheet = (rows, merges = []) => [{ name: 'S', rows, merges }];
const run = (source, context = {}) => compileOpenL(source)(context);

describe('the language of OpenL', () => {
  test('array operators, projections, new of datatypes and arrays, casts', () => {
    const book = RuleBook.fromSheets(
      sheet([
        ['Datatype Member', null],
        ['String', 'name'],
        ['Integer', 'age'],
        [null, null],
        ['Spreadsheet SpreadsheetResult People()', null],
        ['Step', 'Value'],
        [
          'Members',
          '= new Member[] {new Member(name = "Ann", age = 17), new Member("Bob", 45), Member(name = "Cid", age = 30)}',
        ],
        ['Adults', '= $Members[select all having age >= 18].name'],
        ['First', '= $Members[(m) select first having m.age > 40].name'],
        ['Ordered', '= $Members[order decreasing by age].name'],
        ['Labels', '= $Members[transform to name + " (" + age + ")"]'],
        ['Groups', '= length($Members[split by age >= 18])'],
        ['Ints', '= (Integer[]) 5'],
      ])
    );
    expect(book.call('People')).toEqual({
      Members: [
        { name: 'Ann', age: 17 },
        { name: 'Bob', age: 45 },
        { name: 'Cid', age: 30 },
      ],
      Adults: ['Bob', 'Cid'],
      First: 'Bob',
      Ordered: ['Bob', 'Cid', 'Ann'],
      Labels: ['Ann (17)', 'Bob (45)', 'Cid (30)'],
      Groups: 2,
      Ints: [5],
    });
    expect(book.dialect).toBe('openl');
  });

  test("Java's numbers: whole division is a double, ints wrap, doubles print with .0, nulls in sums", () => {
    expect(run('10 / 4')).toBe(2.5);
    expect(run('Integer.MAX_VALUE + 1')).toBe(-2147483648);
    expect(run('(byte) 200')).toBe(-56);
    expect(run('"x" + 1.0')).toBe('x1.0');
    expect(run('"x" + 1')).toBe('x1');
    expect(run('Short v = null; v + (short) 2')).toBe(2);
    expect(run('Short v = null; v * (short) 2')).toBeNull();
    expect(String(run('(BigDecimal) 1 / (BigDecimal) 3'))).toBe('0.3333333333333333333333333333333333');
    expect(run('Long.MAX_VALUE')).toBe(2n ** 63n - 1n);
    expect(run('0.1 + 0.2 == 0.3')).toBe(true);
    expect(run('0.1 + 0.2 ==== 0.3')).toBe(false);
    expect(run('-2 ** 2')).toBe(4);
    expect(run('10%')).toBe(0.1);
  });

  test('BEX, texts and their methods, ranges, functions of OpenL, statements', () => {
    expect(run('a is less than b and not (a equals to b)', { a: 1, b: 2 })).toBe(true);
    expect(run('"Ann".toUpperCase() + " " + "Ann".length()')).toBe('ANN 3');
    expect(run('contains(new IntRange("[10; 20)"), 15) && !contains(new IntRange("[10; 20)"), 20)')).toBe(true);
    expect(run('new IntRange("2+").toString()')).toBe('>= 2');
    expect(run('round(2.567, 2) + sum(1, 2, 3) + length(textSplit(",", "a,,b"))')).toBe(2.57 + 6 + 2);
    expect(run('dateDif(toDate("2011-02-01"), toDate("2012-05-01"), "D")')).toBe(455);
    expect(run('int total = 0; for (int i = 1; i <= 4; i++) { if (i == 3) continue; total += i; } return total;')).toBe(
      7
    );
    expect(run('X + Y, where X - 2, Y - X * 10')).toBe(22);
  });

  test('safe: no prototypes, constructors nor endless loops', () => {
    expect(() => run('x.constructor', { x: {} })).toThrow(/constructor cannot be reached/);
    expect(() => run('x.__proto__', { x: {} })).toThrow(/__proto__ cannot be reached/);
    expect(() => run('while (true) { }')).toThrow(expect.objectContaining({ code: 'XUFA_EXPR_ERR_LIMIT' }));
  });
});

describe('dialects', () => {
  test('books of JavaScript stay JavaScript (with the functions of OpenL too); a formula only OpenL reads makes OpenL', () => {
    const js = RuleBook.fromSheets(
      sheet([
        ['Method Double Total(Object items)', null],
        ['return Fun.sum(items.map((item) => item.price)) + length("ab")', null],
      ])
    );
    expect(js.dialect).toBe('js');
    expect(js.call('Total', [{ price: 2 }, { price: 3 }])).toBe(7);
    const openl = RuleBook.fromSheets(
      sheet([
        ['Method Integer Count(Integer[] xs)', null],
        ['return length(xs[select all having this > 1]);', null],
      ])
    );
    expect(openl.dialect).toBe('openl');
    expect(openl.call('Count', [1, 2, 3])).toBe(2);
  });
});

describe("OpenL's decision tables", () => {
  test('code, declared parameters, titles; simplified conditions; Rule names and referents; lookups across', () => {
    const book = RuleBook.fromSheets(
      sheet(
        [
          ['Rules String Greeting(Integer hour)', null, null, null],
          ['Rule', 'C1', 'C1', 'RET1'],
          [null, 'min <= hour and hour < max', null, '$Rule + " " + greeting + " (" + $C1.min + ")"'],
          [null, 'Integer min', 'Integer max', 'String greeting'],
          ['Rule', 'From', 'To', 'Greeting'],
          ['R1', 0, 12, 'Good morning'],
          ['R2', 12, 24, 'Good afternoon'],
          [null, null, null, null],
          ['Rules Double Premium(String plan, Integer age)', null, null, null],
          ['C1', 'HC1', 'RET1', null],
          ['plan', 'age', null, null],
          ['String[] plans', 'IntRange ages', 'Double premium', null],
          ['Plan', '<25', '25+', null],
          ['basic, gold', 120, 100, null],
          ['premium', 220, 180, null],
        ],
        [{ top: 1, left: 1, bottom: 1, right: 2 }]
      )
    );
    expect(book.call('Greeting', 9)).toBe('R1 Good morning (0)');
    expect(book.call('Greeting', 15)).toBe('R2 Good afternoon (12)');
    expect(book.call('Premium', 'gold', 30)).toBe(100);
    expect(book.call('Premium', 'premium', 20)).toBe(220);
    expect(book.table('Greeting').className).toBe('DecisionTable');
  });
});

describe('Data and tests of OpenL', () => {
  test('records over rows, references to other tables, transposed tests, context, errors of fields, precision', async () => {
    const book = RuleBook.fromSheets(
      sheet(
        [
          ['Datatype Box', null, null],
          ['String', 'label', null],
          ['String[]', 'items', null],
          [null, null, null],
          ['Datatype Crate', null, null],
          ['String', 'name', null],
          ['Box[]', 'boxes', null],
          [null, null, null],
          ['Data Crate crates', null, null],
          ['name', 'boxes:Box.label', 'boxes:Box.items'],
          ['Name', 'Box', 'Items'],
          ['C1', 'B1', 'a, b'],
          ['C1', 'B2', 'c'],
          ['C2', 'B3', 'd'],
          [null, null, null],
          ['Method Integer CountBoxes(Crate crate)', null, null],
          ['return length(crate.boxes);', null, null],
          [null, null, null],
          ['Test CountBoxes CountBoxesTest', null, null],
          ['crate', '_res_', null],
          ['>crates', null, null],
          ['Crate', 'Boxes', null],
          ['C1', 2, null],
          ['C2', 1, null],
          [null, null, null],
          ['Method Double Third(Integer n)', null, null],
          ['if (n < 0) { error("NEG", "No negatives"); } return n / 3.0;', null, null],
          [null, null, null],
          ['Test Third ThirdTest', null, null],
          ['properties', 'precision', 2],
          ['n', '_res_', '_error_.code'],
          ['N', 'Third', 'Code'],
          [1, 0.33, null],
          [-1, null, 'NEG'],
        ],
        [{ top: 11, left: 0, bottom: 12, right: 0 }]
      )
    );
    expect(book.call('crates')).toEqual([
      {
        name: 'C1',
        boxes: [
          { label: 'B1', items: ['a', 'b'] },
          { label: 'B2', items: ['c'] },
        ],
      },
      { name: 'C2', boxes: [{ label: 'B3', items: ['d'] }] },
    ]);
    expect(await book.test()).toEqual([]);
  });
});

describe('versions, spreadsheets and elements of OpenL', () => {
  test('a field of an argument sets the runtime context; the most specific version; versions by id', () => {
    const book = RuleBook.fromSheets(
      sheet([
        ['Datatype TaxRequest', null, null],
        ['String', 'usState : context', null],
        ['Double', 'amount', null],
        [null, null, null],
        ['SimpleRules Double Rate(String kind)', null, null],
        ['properties', 'state', 'NY, CA, FL'],
        ['Kind', 'Rate', null],
        ['sales', 7, null],
        [null, null, null],
        ['SimpleRules Double Rate(String kind)', null, null],
        ['properties', 'state', 'CA'],
        ['properties', 'id', 'CaliforniaRate'],
        ['Kind', 'Rate', null],
        ['sales', 8, null],
        [null, null, null],
        ['Method Double Tax(TaxRequest request)', null, null],
        ['return request.amount * Rate("sales") / 100;', null, null],
      ])
    );
    expect(book.call('Tax', { usState: 'CA', amount: 100 })).toBe(8);
    expect(book.call('Tax', { usState: 'NY', amount: 100 })).toBe(7);
    expect(book.call('CaliforniaRate', 'sales')).toBe(8);
  });

  test('spreadsheets: $Value$Step, ranges of steps, typed steps, values that name constants; Conditions and Returns', () => {
    const book = RuleBook.fromSheets(
      sheet([
        ['Constants', null, null, null],
        ['Double', 'VAT', 0.2, null],
        [null, null, null, null],
        ['Calc SpreadsheetResult Order(Double price)', null, null, null],
        ['Step', 'Value', null, null],
        ['Net : Double', '= price', null, null],
        ['Tax', '= $Value$Net * VAT', null, null],
        ['Rate', 'VAT', null, null],
        ['Total', '= sum($Net:$Tax)', null, null],
        [null, null, null, null],
        ['Conditions', null, null, null],
        ['Inputs', 'Integer age', null, null],
        ['Expression', 'age >= min', null, null],
        ['Parameter', 'Integer min', null, null],
        ['Title', 'Old Enough', null, null],
        [null, null, null, null],
        ['SmartRules String Access(Integer age)', null, null, null],
        ['Old Enough', 'Access', null, null],
        [18, 'Granted', null, null],
        [null, 'Denied', null, null],
      ])
    );
    expect(book.call('Order', 100)).toEqual({ Net: 100, Tax: 20, Rate: 0.2, Total: 120 });
    expect(book.call('Access', 20)).toBe('Granted');
    expect(book.call('Access', 10)).toBe('Denied');
  });
});

describe('languages by table', () => {
  const mixed = () =>
    RuleBook.fromSheets(
      sheet([
        ['Method Object Label(Integer n)', null, null],
        ['properties', 'language', 'openl'],
        ['return "n = " + n * 1.0;', null, null],
        [null, null, null],
        ['Method Object Plain(n)', null, null],
        ['properties', 'language', 'js'],
        ['return "n = " + n * 1.0;', null, null],
        [null, null, null],
        ['Method Object Either(n)', null, null],
        ['return "n = " + n * 1.0;', null, null],
        [null, null, null],
        ['Method Object Count(list)', null, null],
        ['let total = 0', null, null],
        ['for (const item of list) total += item', null, null],
        ['return total', null, null],
        [null, null, null],
        ['Method Integer Twice(Integer n)', null, null],
        ['int result = n * 2;', null, null],
        ['return result;', null, null],
        [null, null, null],
        ['SimpleRules Double Rate(String kind)', null, null],
        ['properties', 'language', 'js'],
        ['properties', 'state', 'CA'],
        ['Kind', 'Rate', null],
        ['sales', 8, null],
      ])
    );

  test("each table in its language: by its property, by what only one language reads, else the book's", () => {
    const book = mixed();
    expect(book.call('Label', 2)).toBe('n = 2.0'); // (OpenL: a double is written with .0)
    expect(book.call('Plain', 2)).toBe('n = 2'); // (JavaScript)
    expect(book.call('Either', 2)).toBe('n = 2.0'); // (both read it: the book's, OpenL by Twice)
    expect(book.call('Count', [1, 2, 3])).toBe(6); // (statements of JavaScript)
    expect(book.call('Twice', 4)).toBe(8); // (Java's declarations: OpenL)
    expect(['Label', 'Plain', 'Count', 'Twice', 'Rate'].map((name) => book.table(name).dialect)).toEqual([
      'openl',
      'js',
      'js',
      'openl',
      'js',
    ]);
    expect([book.dialect, book.table('Count').languageFrom, book.table('Twice').languageFrom]).toEqual([
      'openl',
      'code',
      'book',
    ]);
    // (The language is no dimension of versions.)
    expect(book.withContext({ usState: 'CA' }).call('Rate', 'sales')).toBe(8);
  });

  test('kept by the JSON and the sheets of the book; a language that is none is an error', () => {
    const again = RuleBook.fromJSON(mixed().toJSON());
    expect(again.call('Label', 2)).toBe('n = 2.0');
    const workbook = RuleBook.fromXlsx(mixed().toXlsx());
    expect([workbook.call('Label', 2), workbook.call('Plain', 2)]).toEqual(['n = 2.0', 'n = 2']);
    const wrong = sheet([
      ['Method Object A(n)', null, null],
      ['properties', 'language', 'python'],
      ['return n', null, null],
    ]);
    expect(() => RuleBook.fromSheets(wrong)).toThrow(/openl or js, not "python"/);
  });
});

describe('the check of code both languages read', () => {
  const book = (rows, options) => RuleBook.fromSheets(sheet(rows), options);
  const methods = [
    ['Method Object Label(Integer n)', null, null],
    ['properties', 'language', 'openl'],
    ['return "n = " + n * 1.0;', null, null],
    [null, null, null],
    ['Method Object Either(n)', null, null],
    ['return "n = " + n * 1.0;', null, null],
    [null, null, null],
    ['Method Object Same(n)', null, null],
    ['return n;', null, null],
    [null, null, null],
    ['Method Object Sum(list)', null, null],
    ['let total = 0', null, null],
    ['for (const item of list) total += item', null, null],
    ['return total', null, null],
    [null, null, null],
    ['Method Object Grow(n)', null, null],
    ['n = n + 1;', null, null],
    ['return n;', null, null],
  ];
  const ambiguous = (lint) => lint.filter((issue) => issue.code === 'ambiguous-language');

  test("in a book of both languages: tables of the book's language whose code both read and compute differently", () => {
    const issues = ambiguous(book(methods).lint());
    expect(issues.map((issue) => [issue.table, issue.cell])).toEqual([
      ['Either', { sheet: 'S', row: 5, column: 0 }],
      ['Grow', { sheet: 'S', row: 16, column: 0 }],
    ]);
    expect(issues[0].message).toMatch(
      /runs as JavaScript, the book's language; say its language with a row properties \| language \| js/
    );
    // (The row that says it, under the title: what editors add.)
    expect(issues[0].fix).toEqual({ sheet: 'S', row: 5, column: 0, width: 1, cells: ['properties', 'language', 'js'] });
  });

  test('not in books of one language, nor when the book was given its language', () => {
    expect(ambiguous(book(methods.slice(4)).lint())).toEqual([]);
    expect(ambiguous(book(methods, { dialect: 'js' }).lint())).toEqual([]);
  });

  // The rows of a sheet fix written in: whole rows inserted, their cells from its column.
  const applied = (rows, fix) => {
    const next = rows.map((row) => [...row]);
    next.splice(fix.row, 0, ...fix.rows.map((cells) => [...Array(fix.column).fill(null), ...cells]));
    return next;
  };
  const calls = (rows) =>
    ['Label', 'Either', 'Same', 'Sum', 'Grow'].map((name) => book(rows).call(name, name === 'Sum' ? [1, 2] : 2));

  test('the language of the whole sheet: a Properties table of scope Worksheet at its top, for every table of it', () => {
    const [either, grow] = ambiguous(book(methods).lint());
    expect(either.sheetFix).toEqual({
      sheet: 'S',
      row: 0,
      column: 0,
      rows: [
        ['Properties', null],
        ['scope', 'Worksheet'],
        ['language', 'js'],
        [null, null],
      ],
    });
    expect(grow.sheetFix).toEqual(either.sheetFix);
    // (Written in: no warning left, and every table computes as before.)
    const fixed = applied(methods, either.sheetFix);
    expect(ambiguous(book(fixed).lint())).toEqual([]);
    expect(calls(fixed)).toEqual(calls(methods));
    expect(book(fixed).table('Either').languageFrom).toBe('properties');
  });

  test('a row language | js at the end of the Properties table of the sheet that has one', () => {
    const scoped = [
      ['Properties', null, null],
      ['scope', 'Worksheet', null],
      ['version', '1', null],
      [null, null, null],
    ];
    const rows = [...scoped, ...methods];
    const [either] = ambiguous(book(rows).lint());
    expect(either.sheetFix).toEqual({
      sheet: 'S',
      row: 3,
      column: 0,
      rows: [['language', 'js']],
    });
    const fixed = applied(rows, either.sheetFix);
    expect(fixed.slice(0, 5)).toEqual([
      ['Properties', null, null],
      ['scope', 'Worksheet', null],
      ['version', '1', null],
      ['language', 'js'],
      [null, null, null],
    ]);
    expect(ambiguous(book(fixed).lint())).toEqual([]);
    expect(calls(fixed)).toEqual(calls(rows));
  });

  test('a new one at the top when a table beside that Properties table goes on past it', () => {
    const scoped = [
      ['Properties', null, null, null, 'Constants Rates', null, null],
      ['scope', 'Worksheet', null, null, 'Float', 'vat', 0.21],
      [null, null, null, null, 'Float', 'fee', 1.5],
      [null, null, null, null, null, null, null],
    ];
    const rows = [...scoped, ...methods];
    const [either] = ambiguous(book(rows).lint());
    expect([either.sheetFix.row, either.sheetFix.rows.length]).toEqual([0, 4]);
    const fixed = applied(rows, either.sheetFix);
    expect(ambiguous(book(fixed).lint())).toEqual([]);
    expect(calls(fixed)).toEqual(calls(rows));
    expect(book(fixed).constantOf('fee')).toBe(1.5);
  });

  test('none when the sheet has a table that a Properties table gives the other language', () => {
    const rows = [
      ...methods,
      [null, null, null],
      ['Method Object Priced(n)', null, null],
      ['properties', 'category', 'prices'],
      ['return n;', null, null],
    ];
    const prices = {
      name: 'P',
      rows: [
        ['Properties', null],
        ['scope', 'Category'],
        ['category', 'prices'],
        ['language', 'openl'],
      ],
    };
    const both = RuleBook.fromSheets([...sheet(rows), prices]);
    expect(both.table('Priced')).toMatchObject({ dialect: 'openl', languageFrom: 'properties' });
    const issues = ambiguous(both.lint());
    expect(issues.length).toBe(2);
    expect(issues.every((issue) => issue.fix && !issue.sheetFix)).toBe(true);
  });
});

describe('languages of Properties tables', () => {
  const code = (name) => [
    [`Method Object ${name}(n)`, null, null],
    ['return "n = " + n * 1.0;', null, null],
  ];
  const scope = (scopeName, language) => [
    ['Properties', null, null],
    ['scope', scopeName, null],
    ['language', language, null],
  ];
  const blank = [[null, null, null]];

  test("of a sheet (Worksheet), of a category, of the book (Module, the language of the book); a table's own over them", () => {
    const book = RuleBook.fromSheets([
      { name: 'JAVA', rows: [...scope('Worksheet', 'openl'), ...blank, ...code('Sheet')] },
      {
        name: 'MAIN',
        rows: [
          ...scope('Module', 'js'),
          ...blank,
          ...code('Plain'),
          ...blank,
          ['Method Object Own(n)', null, null],
          ['properties', 'language', 'openl'],
          ['return "n = " + n * 1.0;', null, null],
        ],
      },
      { name: 'PRICES', rows: [...scope('Category', 'openl'), ...blank, ...code('Category')] },
    ]);
    expect(book.dialect).toBe('js');
    expect(
      ['Sheet', 'Plain', 'Own', 'Category'].map((name) => [book.call(name, 2), book.table(name).languageFrom])
    ).toEqual([
      ['n = 2.0', 'properties'],
      ['n = 2', 'properties'],
      ['n = 2.0', 'property'],
      ['n = 2.0', 'properties'],
    ]);
    // (Kept by the JSON of the book; no warning of code both languages read: their language was said.)
    const again = RuleBook.fromJSON(book.toJSON());
    expect(['Sheet', 'Plain', 'Own', 'Category'].map((name) => again.call(name, 2))).toEqual([
      'n = 2.0',
      'n = 2',
      'n = 2.0',
      'n = 2.0',
    ]);
    expect(book.lint().filter((issue) => issue.code === 'ambiguous-language')).toEqual([]);
  });

  test('a sheet that says its language does not tell the language of the book', () => {
    const book = RuleBook.fromSheets([
      {
        name: 'JAVA',
        rows: [
          ...scope('Worksheet', 'openl'),
          ...blank,
          ['Method Integer Twice(Integer n)', null, null],
          ['int r = n * 2; return r;', null, null],
        ],
      },
      { name: 'MAIN', rows: code('Plain') },
    ]);
    expect([book.dialect, book.call('Twice', 2), book.call('Plain', 2)]).toEqual(['js', 4, 'n = 2']);
  });
});

describe('OpenL as its own examples compute it', () => {
  test('comparisons, Java numbers, casts and literals', () => {
    expect([run('1 <== 2'), run('2 <== 2'), run('2 >=== 2')]).toEqual([true, false, true]);
    expect([run('a string< "abc"', { a: null }), run('a >= b', { a: null, b: null })]).toEqual([true, true]);
    expect([run('5L == new BigDecimal("5.0")'), run('4.3f == 4.3'), run('null + true')]).toEqual([
      true,
      true,
      'nulltrue',
    ]);
    expect([run('(byte) 100 + (byte) 100'), run("'a' + 'b'"), run('-(short) -32768')]).toEqual([-56, 195, -32768]);
    expect([run('(long) 1e19'), run('(int) 3.4e80'), run('(double) 1.1f ==== 1.1')]).toEqual([
      2n ** 63n - 1n,
      2147483647,
      true,
    ]);
    expect([run('0.07% ==== 0.0007'), run('((Object) ((float) 2 / (float) 3)).getClass().getSimpleName()')]).toEqual([
      true,
      'Float',
    ]);
    expect([run('IntRange r = 5; r.contains(5) && !r.contains(6)'), run('abs(Integer.MIN_VALUE)')]).toEqual([
      true,
      -2147483648,
    ]);
  });

  test('functions: sums, rounding, formats, dates, java.time', () => {
    expect([run('sum(1, 2, 3.5)'), run('sum(new Integer[][] {{1, 2}, {3}})')]).toEqual([6.5, [3, 3]]);
    expect([
      run('round(0.7 * 0.75, 2)'),
      run('round(5000000000.6, DOWN)'),
      run('Integer r = null; round(2.561, 2, r)'),
    ]).toEqual([0.53, 2147483647, 2.57]);
    expect([
      run('toString(12000, "#0E0")'),
      run('toString(-1, "000;neg 0")'),
      run('toString(0.03, "0‰")'),
      run(`toString(3, "'#'0'%'")`),
    ]).toEqual(['1.2E4', 'neg 001', '30‰', '#3%']);
    expect(run('toString(new BigInteger("85070591730234615847396907784232501249"), "#,######")')).toBe(
      '85,070591,730234,615847,396907,784232,501249'
    );
    expect([
      run('monthDiff(Date(2024, 3, 1), Date(2024, 1, 31))'),
      run('dateDif(Date(1900, 1, 1), Date(1894, 6, 25), "M")'),
    ]).toEqual([1, -66]);
    expect([
      run('dateDif(Date(2012, 2, 1), Date(2012, 3, 1), "YF")').toFixed(4),
      run('isLeap(1900)'),
      run('like("a   b", "a b")'),
    ]).toEqual(['0.0792', false, true]);
    expect([run('length(java.util.List.of(1, 2, 3))'), run('toLocale("de-DE").getCountry()')]).toEqual([3, 'DE']);
  });

  test('tables: transposed SmartRules, matrix Data, typed spreadsheets, lists across columns, messages, the runtime context', async () => {
    const book = RuleBook.fromSheets(
      sheet([
        ['SmartRules Double Discount(String customerType, Integer orders)', null, null, null],
        ['Customer Type', 'New', 'Regular', 'Regular'],
        ['Orders', null, '< 10', '10+'],
        ['Discount', 0, 0.05, 0.1],
        [null, null, null, null],
        ['Datatype Team', null, null, null],
        ['String', 'name', null, null],
        ['String[]', 'members', null, null],
        [null, null, null, null],
        ['Datatype Department', null, null, null],
        ['String', 'name', null, null],
        ['Team[]', 'teams', null, null],
        [null, null, null, null],
        ['Data Department departments', null, null, null],
        ['name', 'teams.name', 'teams.members', null],
        ['Department', 'Team', 'Member', null],
        ['Sales', 'North', 'Ann', null],
        [null, null, 'Bob', null],
        [null, 'South', 'Carl', null],
        ['IT', 'Core', 'Dina', null],
        [null, null, null, null],
        ['Datatype Totals', null, null, null],
        ['Double', 'net', null, null],
        ['Double', 'tax', null, null],
        [null, null, null, null],
        ['Spreadsheet Totals Order(Double price)', null, null, null],
        ['Step', 'Value', null, null],
        ['Net', '= price', null, null],
        ['Tax', '= price * 0.2', null, null],
        [null, null, null, null],
        ['Method String Greeting(String name)', null, null, null],
        ['return msg("greeting", name);', null, null, null],
        [null, null, null, null],
        ['Method String Switched()', null, null, null],
        [
          'modifyContext("locale", "fr"); String text = Greeting("Ann"); restoreContext(); return text;',
          null,
          null,
          null,
        ],
      ]),
      { messages: { '': { greeting: 'Hello, {0}!' }, fr: { greeting: 'Bonjour, {0} !' } } }
    );
    expect([
      book.call('Discount', 'New', 1),
      book.call('Discount', 'Regular', 3),
      book.call('Discount', 'Regular', 25),
    ]).toEqual([0, 0.05, 0.1]);
    expect(book.call('departments')).toEqual([
      {
        name: 'Sales',
        teams: [
          { name: 'North', members: ['Ann', 'Bob'] },
          { name: 'South', members: ['Carl'] },
        ],
      },
      { name: 'IT', teams: [{ name: 'Core', members: ['Dina'] }] },
    ]);
    expect(book.call('Order', 100)).toEqual({ net: 100, tax: 20 });
    expect([
      book.call('Greeting', 'Ann'),
      book.withContext({ locale: 'fr-CA' }).call('Greeting', 'Ann'),
      book.call('Switched'),
    ]).toEqual(['Hello, Ann!', 'Bonjour, Ann !', 'Bonjour, Ann !']);
  });

  test('java.time values of cells and defaults, written as Java writes them', () => {
    const book = RuleBook.fromSheets(
      sheet([
        ['Datatype TimeValues', null, null],
        ['LocalDate', 'usDay', '03/31/2017'],
        ['LocalTime', 'usTime', '09:30 PM'],
        ['LocalDateTime', 'usDayTime', '9/20/2019 10:50 AM'],
        ['ZonedDateTime', 'usZoned', '10/10/2019 10:15 AM America/Los_Angeles'],
        ['Instant', 'usInstant', '10/10/2019 10:15 AM America/Los_Angeles'],
        [null, null, null],
        ['Spreadsheet SpreadsheetResult Texts()', null, null],
        ['Step', 'Value', null],
        ['Values', '= new TimeValues()', null],
        ['Day', '= $Values.usDay.toString() + " " + $Values.usDay.getDayOfWeek().toString()', null],
        ['Time', '= $Values.usTime.toString()', null],
        ['DayTime', '= $Values.usDayTime.toString()', null],
        ['Zoned', '= $Values.usZoned.toString()', null],
        ['Instant', '= $Values.usInstant.toString()', null],
      ])
    );
    const { Day, Time, DayTime, Zoned, Instant } = book.call('Texts');
    expect([Day, Time, DayTime, Zoned, Instant]).toEqual([
      '2017-03-31 FRIDAY',
      '21:30',
      '2019-09-20T10:50',
      '2019-10-10T10:15-07:00[America/Los_Angeles]',
      '2019-10-10T17:15:00Z',
    ]);
  });
});
