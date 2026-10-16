# @xufa/rules

Business rules in workbooks of Excel, run as functions: decision tables, calculations in steps, constants, datatypes,
methods, transforms, and the tests that check them, written by the people who know the rules, in the tool they know.
Expressions in cells are [@xufa/expression](../expression): safe, compiled once. Workbooks are read and written with no
other dependency.

```js
import fs from 'node:fs';
import { RuleBook } from '@xufa/rules';

const book = RuleBook.fromXlsx(fs.readFileSync('pricing.xlsx'));
book.call('BasePremium', 'basic', 30); // 100
book.call('Quote', { plan: 'basic', age: 30, country: 'se', years: 5 }); // { base: 100, total: 99, covers: ['liability'] }
await book.test(); // [] when every Test table passes

const json = book.toJSON(); // to keep it in a database: RuleBook.fromJSON(json) gives it back
fs.writeFileSync('pricing-copy.xlsx', book.toXlsx());
```

## Tables

A table is a block of cells apart from the others by empty rows and columns, anywhere in any sheet; its first cell says
what it is. A book is every table of every sheet; each table is a function of the book by its name, and every
expression of the book sees the others, its constants and `Fun` (helpers).

### Expressions

Cells `= expression`, scripts of `RET`, steps of spreadsheets, conditions in columns titled `true`, methods and
`'@expression'` of transforms are expressions of [@xufa/expression](../expression): JavaScript without statements or
assignments (`?.`, `??`, template literals, arrow functions, `list.map(...)`), compiled once and safe. A member of
`null` is `undefined`. Every expression sees the tables (functions), constants, Data records, datatypes, `Fun` (`sum`,
`mean`, `median`, `max`, `min`, `sort`, `first`, `last`, `concat`, `flat`, `zip`, `zipObj`, `clamp`, `map`, `filter`,
`some`, `every`, `none`, `allowIndexes`, `addToNested`...), `error(message)` and the globals (`Math`, `JSON`,
`Number`, `String`...); and, by place, the parameters, `RET`, `$RuleId` and `$Rule`, `$step` of spreadsheets,
`$Column$Row` of grids. The docs page has the full list.

### Rules: decision tables

```
Rules Float BasePremium(String plan, Integer age)
C1       | HC1       | RET
plan     | age       |
String   | IntRange  | Float
         | <25       | [25..60)  | >=60
basic    | 120       | 100       | 150
premium  | 220       | 180       | 260
```

- The title says the type of the result, the name and the parameters.
- The row of positions puts each parameter in a column of conditions (`C1`, `C2`...: one condition a row) or in a row of
  them (`HC1`, `HC2`...: one a column, at the top). `RET` is the result; the cell under it can be a script of the
  result (`RET.toUpperCase()`).
- Conditions: a value (`String`, `Integer`, `Float`, `Double`: texts compared without accents), `<`, `<=`, `>`, `>=`
  and ranges `[a..b]`, `(a..b)`, `[a..b)` (`IntRange`, `FloatRange`, `DoubleRange`); an empty condition takes any value.
- The result is the cell of the first row and column whose conditions the values meet (`undefined` when none), as the
  type of the result says (`Integer`, `Float`, `Double`, `Boolean`, `Date`, `String`, `Code`, `Codes`: a list of lines
  or of what commas separate). A cell `=expression` is computed, with the book's names and the parameters.
- `Multi` tables (`Multi Code Covers(String plan)`) give every result that matches, once each.
- `Nested` parameters (declared in the header only, not in the title) make the result an object: their conditions are
  the keys of the path of each matching cell.

### Spreadsheet: calculations in steps

```
Spreadsheet SpreadsheetResult Quote(Customer customer)
Step         | Formula
base         | = BasePremium(customer.plan, customer.age)
region       | = Region(customer.country)
total        | = $base + Surcharge($region, $base)
total        | *= customer.years > 3 ? 0.9 : 1
this.covers  | = Covers(customer.plan)
             | delete $region
```

Each step is a value of the result, and `$name` for the steps after it; `+=`, `-=`, `*=`, `/=`, `%=` work on its value;
`this.path` (or `.path`) is a path in the result; `return expression` (without a name) is the result; `delete $name`
takes a value out. A step that gives `undefined` adds a message to `result.errors`; a step that fails is left (and told
to `onError`).

### Others

```
Constants Rates            Datatype Customer        Method Float Round2(Float value)
Float   | vat  | 0.21      String  | plan | basic   return Math.round(value * 100) / 100
Integer | days | 30        Integer | age  |

Test BasePremium BasePremiumTests       Check Codes          Transform Letter
plan    | age | RET                     Covers | (route)     customer.name | '@name'
basic   | 30  | 100                                          total         | '@Round2($.total * 1.21)'
                                                             by            | '{{company}}'
```

- **Constants**: typed values, names of every expression.
- **Datatype**: the fields of an input or a result, a type and a name each (their types convert the values of tests
  and Data tables); a third column is the default value of the field. Objects the book makes take the defaults of
  the fields they lack (Data records, results of SmartRules, the inputs of tests), and so do arguments of calls of a
  datatype (or a list of one): a copy of the object takes them, the application's object is not changed. Objects of
  datatypes in their fields (at any depth, lists too) are filled the same; missing ones are not made, and an object
  that lacks nothing is given as it is.
- **Method**: a function whose body is an expression (`return ...`) or statements of JavaScript (variables, `if`,
  loops, functions), run as a program of [@xufa/expression](../expression#programs): as safe as every formula, with a
  limit of steps. Without a `return`, its value is that of its last statement.
- **Test**: rows of parameters and the result each must give (the last column, or `RET.path` columns of objects);
  `Test Quote QuoteTests Customer` types the inputs of a spreadsheet by a datatype.
- **Check**: tables (and a route in their results) whose every possible value goes to a check function of the
  application: `book.test({ checks: { Codes: async (values, table) => [messages] } })`.
- **Transform**: an object made of another: texts `'@expression'` are computed (the input's fields by name, the
  context's names over them, the input as `$`), `'@@...'` is a text starting with `@`, other texts are templates of the
  context (`{{name}}`, `{{#items}}...{{/#}}`); `__apply__` pipes functions of the context over the result.

### Tables of OpenL Tablets

```
SmartRules Double Discount(String plan, Integer age)     SmartLookup Double Rate(String region, Integer year)
Plan        | Age     | Discount                         Region | 2026 | 2027
basic       | <25     | 0                                north  | 1.1  | 1.2
basic, gold | 25 - 60 | 0.05                             south  | 1    | 1.05
            | 60+     | 0.1
```

- **SmartRules**: the titles of the columns are matched to the parameters (and the fields of datatype parameters) by
  their words; the columns after them are results (the first that is not empty; a datatype result takes its fields
  from their titles). **SimpleRules**: the columns are the parameters in order. `SmartRules Double[]` (or `Collect`)
  gives the results of every rule met; an empty result goes on to the next rule. `$RuleId` and `$Rule` (a `Rule`
  column) are in the expressions of a rule. Two columns under one merged title are a range (from, to).
- **SmartLookup** / **SimpleLookup**: the first parameters go down (rows), the others across (titles); a merged corner
  says how many go each way.
- Conditions: lists (`basic, gold`; `\,` for a comma in a value), `*` or empty (any), and ranges as OpenL writes them:
  `<25`, `>=18`, `25 - 60`, `25..60`, `[25; 60)`, `60+`, `25 and more`, `less than 60`, `$1K - 5M`, `1,000.50`, dates
  (`2026-01-01 .. 2026-12-31`) and texts (`A1 - A10`).
- **Data**: `Data Customer customers` is a list of records (a row of fields, a row of titles, the values), typed by a
  datatype; `Data Integer limits` with a `this` column is a list of values. Every expression sees it by its name.
- **Test** of OpenL: columns of the parameters (`customer.age` for fields), `_res_` (or `_res_.field`) the result
  expected, `_error_` the message of an error expected, `_description_`. **Run**: the rows run, nothing expected.
- **Spreadsheet** grids: more than one column of values makes the steps a grid of cells, `$Column$Row` each (computed
  as they are read; `$Name` alone the cell of that row in its column, or of that column in its row); `$A:$C` a range; `Step : Double` types a cell. A spreadsheet whose
  type is no `SpreadsheetResult` gives its `RETURN` row (or its last value).
- **Properties**: rows `properties | name | value` under a title, or `Properties` tables (`scope`: `Module` or
  `Worksheet`) for the tables of a sheet or of the book.

- **Rules** (decision tables of OpenL): `C1`, `HC1` (across), `MC1`, `A1`, `RET1`, `CRET1` columns over rows of code,
  declared parameters (`Integer min`, `IntRange ages`, `String[] plans`) and titles; a code that is only a parameter
  name is a simplified condition (`plan` with `basic, gold`), `$C1.min` and `$Expr.C1` the cells of a rule, `Rule`
  its name. Transposed tables are read too.
- **Conditions**, **Returns** and **Actions** tables: elements (inputs, expression, parameters, title) that SmartRules
  name by their titles.
- **Data** records: field paths (`a.b`, `a[1].b`, `list:Type.field`, `this`, `_PK_`), records over the rows merged in
  their first column, references to other tables (`>customers`, `>customers.name column`); **Test** tables take
  them, transposed or not, with `_context_.state` columns, `_res_.path` results, `_error_.field` and a `precision`.
- **Versions** also by `$properties` / `$dispatchingProperties`, by fields of arguments mapped to the context
  (`String usState : context`), and by `id` (a version called by its own name). Rules change the runtime context of
  the calls they make with `getContext()`, `modifyContext(name, value)`, `setContext(context)`, `emptyContext()` and
  `restoreContext()`.
- SmartRules written in columns (their titles down the first column) are read so. Data tables of lists of objects
  (`teams.name`, `teams.members`) take a record over its rows: a blank first cell, or the same key again, goes on with
  it; fields of `List` and `Map` types are arrays and Maps.
- A spreadsheet of a datatype (`Spreadsheet FinancialData Check(...)`) gives an object of it, its fields the steps of
  their names.
- **Messages**: `msg(code, arguments...)` gives a text of the `messages` of the book in the locale of the runtime
  context (`locale`: `fr-CA` takes `fr_CA`, then `fr`, then the default), its `{0}`, `{1}` replaced as Java's
  MessageFormat writes them. `parseProperties` reads the `.properties` files of OpenL's `i18n` folders:
  `RuleBook.fromXlsx(bytes, { messages: { '': parseProperties(text), fr: parseProperties(frenchText) } })`.
- Values of `LocalDate`, `LocalTime`, `LocalDateTime`, `ZonedDateTime` and `Instant` of their ISO or US texts
  (`03/31/2017`, `09:30 PM`, `10/10/2019 10:15 AM America/Los_Angeles`), written as Java writes them.

#### The language of OpenL

A book whose formulas are of OpenL (or whose tables only OpenL has) is a book of OpenL (`book.dialect` is `'openl'`,
or `RuleBook.fromSheets(sheets, { dialect: 'openl' })`): its expressions, cells and Method bodies are OpenL's language.
They are parsed as OpenL and lowered to programs of [@xufa/expression](../expression#programs), which runs them as it
runs every formula of JavaScript (the same checks, the same limit of steps); what OpenL does as Java are functions
those programs call:

- Java's numbers: `int` wraps, `10 / 4` is `2.5`, `long` is a `BigInt`, `BigDecimal` a decimal of 34 digits,
  `"x" + 1.0` is `x1.0`; nulls count as 0 in `+` and `-` and make `*` and `/` null; `==` compares doubles within
  their ulps (`====` exactly); casts (`(byte) 200`, `(Integer[]) 5`).
- Arrays: `items[select all having price > 10]`, `select first`, `order by` / `order decreasing by`, `split by`,
  `transform to` (and `@` forms), `(item) select ...` naming the element; `items.name` projects a field;
  `new Type[] { ... }`, `new Type(field = value)`.
- Business phrases (`a is less than b`, `x equals to y`, `age of the person`), `X + Y, where X - 2, Y - X * 10`,
  and statements: variables, `if`, `for`, `while`, `break`, `continue`, `return` (loops have a limit of steps).
- About 150 functions of OpenL (`sum`, `round(value, 2, HALF_UP)`, `dateDif`, `textSplit`, `contains`, `like`...),
  ranges (`new IntRange("[10; 20)")`), dates and some statics of Java (`Integer.MAX_VALUE`, `Math.abs`). Books of
  JavaScript see these functions too, as globals under their own names.
- Methods of texts, numbers, dates and lists are allow-listed; `constructor`, `__proto__` and the like cannot be read.

Each table can be in its own language: one book can have methods of OpenL and methods of JavaScript.

```
Method Double Total(Order order)
properties | language | js
return order.lines.reduce((sum, line) => sum + line.price, 0);
```

A table's language is its property `language` (or `dialect`: `openl` or `js`); else that of a Properties table of its
sheet (`scope` Worksheet), of its category (Category) or of the book (Module, which is then the language of the book);
without them, the language its code is in when only one of them reads it (`int total = 0;` is OpenL, `let total = 0`
JavaScript); else the book's (told by its sheets but those whose Properties tables say a language). Code that both
read gives different results in each (`"x" + 1.0`, a null in a sum, `0.1 + 0.2 == 0.3`), so a table that must keep
its results says its language. `book.table(name).dialect` is the language of a table, `languageFrom` what told it
(`property`, `properties`, `code`, `book`); `language` is no dimension of versions.

```
Properties
scope    | Worksheet
language | openl
```

The test suites of OpenL's own examples run in `tools/openl-compat` (the workbooks are fetched, not kept here: they
are LGPL): 722 of their 743 rows give OpenL's results. The others need what is not supported: deprecated tables of
OpenL (ColumnMatch, TBasic, Table Part), classes of Java (Environment tables) and years past those of JavaScript's
dates (275760).

## Versions by business dimensions

Tables of the same name whose properties tell where each applies (`effectiveDate`, `expirationDate`, `startRequestDate`,
`endRequestDate`, `lob`, `state`, `country`, `region`... or any other) are versions of one table: the runtime context
of a call chooses one, as OpenL Tablets does.

```js
book.withContext({ currentDate: new Date('2026-06-01'), usState: 'NY' }).call('Premium', 'basic');
```

Only what the context tells is compared; a table without a property applies to every value of it. Of those that apply,
the most specific wins (`origin`: `Deviation` over `Base`), then the one that restricts fewer dimensions the context
does not tell; two as specific are an error (`XUFA_RULES_ERR_AMBIGUOUS`), and none another (`XUFA_RULES_ERR_NO_VERSION`).
Tables called by a table run in the context of its call. `active: false` takes a version out; `failOnMiss: true` makes
a table that no rule meets an error (`XUFA_RULES_ERR_MISS`) instead of `undefined`.

## Traces, gaps and overlaps

```js
book.trace('Total', ['basic'], { usState: 'NY' });
// { table: 'Total', kind: 'SmartRules', args, result: 130, cells: [{ sheet, row, column }], children: [
//   { table: 'Premium', result: 120, version: { state: 'NY, CA' }, cells, children: [] }, ... ] }
book.analyze('Discount');
// [{ table: 'Discount', axes: [{ dimensions: ['plan', 'age'], gaps: [{ plan: 'gold', age: '<25' }],
//    overlaps: [{ rules: [2, 4], example: { plan: 'basic', age: 60 } }], shadowed: [5], never: [] }] }]
book.testResults(); // each row of each Test and Run table: { passed, expected, actual, message, cell }
book.testCase('Discount', ['gold', 30], { context: { usState: 'NY' } });
// { title: 'Test Discount DiscountTest', names: ['plan', 'age', '_context_.usState', '_res_'],
//   titles: ['plan', 'age', '_context_.usState', 'Expected'], cells: ['gold', 30, 'NY', 0.05], error: null }
```

`trace()` gives the tree of the calls of a call: what each table got and gave, the version chosen and the cells of the
sheet that gave each result. `analyze()` tries every case of the decision tables (conditions only change at their
values and the ends of their ranges, so one value of each interval stands for all of it): the values of no rule (gaps,
merged into ranges as conditions write them), the values of several (overlaps: the first wins), the rules that never
win (`shadowed` by those before them, or that no value meets) and the empty cells of lookups. Conditions written as
expressions are taken as met (`partial`). Each axis also says where a rule for a gap goes (`add`: the new row or column
and the cell of each condition), which the editor of the admin uses to add one. `testCase()` writes a call as it goes
now as a row of a Test table (its title, the names of its columns, their titles and its cells): a column for each
argument (and for each field of those that are objects: `customer.age`, `lines[0].qty`), `_context_` fields, and `_res_`
(or a column for each field of a result that is an object: `_res_.total`), or `_error_` of a call that fails. Its title
names a test no table of the book has. The editor of the admin writes the tests of its tries with it.

## Checks of formulas and coverage

```js
book.lint();
// [{ table: 'Quote', code: 'unknown-name', name: 'vatt', cell: { sheet, row, column },
//    message: 'vatt is no name of the book, its parameters or its steps' }, ...]
book.coverage(); // { tests: 3, tables: [{ table: 'Discount', tested: true, rules: { total: 5, covered: 4, missed } }] }
```

Expressions are lenient (a name of nothing is `undefined`), so a typo gives a wrong result, not an error. `lint()`
checks every formula of spreadsheets (steps and grids), methods and rules: names that nothing defines
(`unknown-name`), steps read before they are computed (`not-yet`), members helpers and globals do not have
(`Fun.meen`: `unknown-member`), tables called with other arguments than they take (`arity`), calls of constants or
Data (`not-callable`) and cells of a grid that refer to themselves through others (`cycle`); in a book of both
languages (told by its sheets), the tables that run in the book's language code that both read and compute differently
(`ambiguous-language`: nulls in sums, `"x" + 1.0`, `==`), to say their language; its `fix` is the row that says it,
to add under the title of the table, and its `sheetFix` the rows that say it for the whole sheet (a row
`language` at the end of its Properties table of scope Worksheet, or a new one at its top; whole rows inserted), given
only when that changes no other table of the sheet (the admin adds either with a click). The names of methods of statements
are not checked. `coverage()` runs the tests with a trace: the tables no test runs, and the rules of decision tables that
no test reaches.

## Tests of a book

`await book.test({ checks })` gives the messages of what is wrong (`[]` when nothing is): results of the wrong type,
parameters without a header that no formula uses, expressions that do not compile (with the table and cell), rows of
Test tables that fail (`Test QuoteTests failed at row 2.Expected object with property "total" equal to "90" but got
"99"`), and what check functions say. Use it before a book replaces another.

## Safety

Expressions read their context and compute: they cannot assign, reach prototypes, constructors, `process` or modules
(`input.constructor.constructor(...)` is refused). The bodies of methods, of JavaScript or of OpenL, run on the same
engine, as its programs: their variables are their own, they change only plain objects and arrays, and loops and calls
have a limit of steps. A book is data, never code.
Tables refuse repeated combinations of conditions (but in `Multi` tables), repeated names and parameters that are not in
the title, saying where (`RULES!A24: Duplicated combination at table Covers`).

## Workbooks

The workbooks are read and written by [@xufa/xlsx](../xlsx) (its `readXlsx`, `writeXlsx` and `patchXlsx` are exported
here too, their errors as `RulesError`). `readXlsx(bytes)` gives `{ sheets: [{ name, rows, merges }] }`: rows of values
from A1 (texts, numbers, booleans, dates of cells of a date format, the last result of formulas). `writeXlsx({ sheets })`
writes sheets of values or `{ value, style }` (`title`, `header`, `value`, or a style of its own), merged ranges and
widths of columns. `book.toXlsx()` writes each table at its place (new tables in a sheet of their kind).

To change a workbook people keep editing, without losing what the book does not read (styles, comments, other sheets),
patch it: `patchXlsx(bytes, sheet, { C7: 0.5 })` sets those cells and nothing else (a merged range whose cells get
different values is split; a cell that loses its formula takes the calculation chain with it).
`book.applyMatrix(bytes, 'Premium', matrix)` writes the cells of a table's matrix that change, the book read from those
bytes. `blocksOf(sheet)` gives the blocks of a sheet as books find their tables, in the sheet's order. An error building
a table says where (`message`), and keeps what was wrong (`reason`) and its first cell (`cell`) apart.

## Books of the engine this one follows

The layouts of the tables, the JSON of `toJSON()` (`className`, `params`, `matrix`, `lines`...) and the messages of
tests are those of the engine this one was made after (itself made to replace OpenL Tablets), so its books and their
JSON load as they are. What changes: texts are normalized on both sides of a comparison; parameters are names of the
`=` cells and scripts; Multi tables may repeat combinations; a trailing `;` of a formula is dropped and `this` is the
result of a spreadsheet; methods of statements run as programs of @xufa/expression (no `this`, classes nor
destructuring).

## Books in a database

`RuleStore` keeps books in a database of [@xufa/orm](../orm) (any backend), by name and tenant, in versions: each is
tested before it is kept (refused when its tests fail, unless `force`), one is the active one, and the workbook it came
from is kept as it came.

```js
import { RuleStore, rulesPlugin } from '@xufa/rules';

const rules = new RuleStore(db, { checks: { Codes: checkCodes }, bookOptions: { dialect: 'auto' } });
await rules.sync(); // its table (db.sync() and migrations make it too)

await rules.save('pricing', xlsxBytes, { author: 'ada', comment: 'new rates' }); // { version: 2, errors: [] }
await rules.call('pricing', 'Quote', customer);
const book = await rules.book('pricing', { tenant: 'acme', version: 1 });
await rules.activate('pricing', 1); // back to an older version
```

Books are compiled once a version in each process; the active version is asked again after `refresh` ms (2000), so a
new one reaches every process (and machine) in that time.

With `new RuleStore(db, { tdz: true })`, a `let` or `const` in a Method of JavaScript that is used before its
declaration runs is an error (`rate is used before its declaration`, with its line and column), as in JavaScript. By
default it is `undefined`, so `const total = base * rate; const rate = 1.21;` gives `NaN` instead of failing, and the
book's tests may not notice. The option applies to every book of the store, also to books given to it already made (on
a copy; the book given is not changed). Without a store, `RuleBook` takes the same `tdz` option. Code that declares
its names before using them runs as always; formulas of OpenL are not affected.

`RuleBook.fromSheets(sheets, { methods })` (or a store's `bookOptions`) gives the values of the book's JavaScript
functions as methods: with `methods` of [@xufa/fun](../fun), `prices.sum()` and `doc.getAtPath('a.b')` work in its
formulas and Methods (`methods` of [@xufa/expression](../expression)).

Books import books: a Method of JavaScript takes the tables of another book by its name, and the store links the
active version of it (of the same tenant) before the book runs, is tested or is inspected, and again each time it is
loaded (a new active version of the imported book is taken). Books importing each other, and books of no active
version, are refused. Without a store, `RuleBook.fromSheets(sheets, { modules: { pricing: pricingBook } })`.

```js
// Method Double Quote(String plan, Double base), in the book quotes:
import { Discount, vat } from 'pricing';
return base * (1 - Discount(plan)) * (1 + vat);
```

What a book exports (`book.exports()`): its rules, spreadsheets and methods as functions (run in the runtime context of
the call), its constants and data as values. `book.imports()` lists the books it imports; `store.dependents(name)` the books that import one (directly, or through
others), and `store.impact(name, { version })` (or `{ input }`, a book being saved) runs their tests with another
version of it, on copies: what making it the active one would break. With `new RuleStore(db, { checkImporters: true })`
such a version does not become the active one: `save()` and `activate()` refuse it (`XUFA_RULES_ERR_BREAKS`, with
`.errors` and `.breaks`; 409 in the routes), unless `force` or `breaking: true` (`?breaking=true`).

`rulesPlugin` gives them routes (`app.rules` is the store): `GET /` the books, `GET /:name` its versions and tables,
`GET /:name/xlsx` and `/:name/json` (`?version`), `POST /:name` a new version (the bytes of a .xlsx, or its JSON:
`?activate=false`, `?force=true`, `?comment`; 422 with the messages when its tests fail), `POST /:name/test` the tests of
a book sent (not kept) or of the active one, `POST /:name/run/:table` (`{ args }`), `PUT /:name/active` (`{ version }`)
and `DELETE /:name`.

```js
app.register(rulesPlugin, {
  store: rules,
  prefix: '/api/rules',
  onRequest: app.auth.guard('rules.change'),
  tenantOf: (request) => request.tenantId,
});
```
