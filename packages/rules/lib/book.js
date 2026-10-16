// A book of rules: the tables of a workbook (or of their JSON), each a function by its name, all of them in the
// context of the others' expressions with the book's constants and helpers (Fun).
//
//   const book = RuleBook.fromXlsx(fs.readFileSync('pricing.xlsx'));
//   book.fn('Discount')('premium', 40);           // a function of a table
//   book.call('Calculate', { plan: 'basic', age: 30 });
//   const errors = await book.test();             // its Test tables (and Check tables, with check functions)
//   const json = book.toJSON();                   // to keep it (RuleBook.fromJSON(json) gives it back)
//   fs.writeFileSync('out.xlsx', book.toXlsx());
import { readXlsx, writeXlsx, refOf, patchXlsx } from './xlsx.js';
import { blocksOf } from './blocks.js';
import { testCaseOf } from './test-case.js';
import { Fun } from './helpers.js';
import { RulesError, isInteger, isNumber, toValue } from './values.js';
import { choose, isVersion } from './versions.js';
import { analyse } from './analysis.js';
import { compileExpression, isExpression, isProgram, programs, rewriteThis } from './expressions.js';
import { compileOpenL } from './openl/lower.js';
import { messageOf } from './messages.js';
import { parse as parseOpenL } from './openl/parser.js';
import { lintBook, coverageOf } from './lint.js';
import { RulesTable } from './tables/rules.js';
import { SpreadsheetTable } from './tables/spreadsheet.js';
import { TestTable, RunTable } from './tables/test.js';
import { SmartTable } from './tables/smart.js';
import { DecisionTable, isOpenLLayout } from './tables/decision.js';
import { ExternalElementsTable } from './tables/external.js';
import { ConstantsTable, DatatypeTable, MethodTable, CheckTable, TransformTable, DataTable } from './tables/simple.js';

// The language of the formulas of sheets: OpenL Tablets' when a formula is only of it (not JavaScript), or the book
// has tables only OpenL writes (decision tables of its layout, Environment); else JavaScript.
function dialectOf(sheets) {
  for (const sheet of sheets) {
    for (const row of sheet.rows || []) {
      for (const cell of row || []) {
        if (typeof cell !== 'string') continue;
        const text = cell.trim();
        if (/^(Environment|DT)\b/.test(text)) return 'openl';
        if (!text.startsWith('=') || text.length < 2) continue;
        const source = text.slice(1);
        if (isExpression(source)) continue;
        try {
          parseOpenL(source);
          return 'openl';
        } catch {
          // (Neither: an error of the formula, told where it is.)
        }
      }
    }
  }
  for (const sheet of sheets) {
    for (const block of blocksOf(sheet)) {
      const title = String(block.rows[0]?.[0] ?? '').trim();
      if (/^Rules\s/.test(title) && isOpenLLayout(block.rows)) return 'openl';
      // Methods in Java: declarations of its types (int i = 0; List<String> names), none of JavaScript's words.
      if (/^Method\s/.test(title) && !languageOf(propertiesOf(block.rows).properties)) {
        const body = block.rows
          .slice(1)
          .map((row) => row.filter((cell) => cell !== null && cell !== undefined).join(' '))
          .join('\n');
        const java = /\b(int|long|double|float|boolean|char|[A-Z]\w*(<[\w, <>]*>)?(\[\])*)\s+[a-z_]\w*\s*(=|;|:)/;
        if (/\b(const|let|var|function)\b|=>/.test(body)) continue;
        if (java.test(body)) return 'openl';
        // (A body that only OpenL reads: a cast, Java's operators.)
        if (!isProgram(body)) {
          try {
            parseOpenL(body);
            return 'openl';
          } catch {
            // (Neither: told when the method runs.)
          }
        }
      }
    }
  }
  return 'js';
}

// The parameters of a table whose types are datatypes with default values: { index, datatype, list }; null if none.
function fillsOf(table, book) {
  if (!Array.isArray(table.params)) return null;
  const fills = [];
  table.params.forEach((param, i) => {
    // (Methods: names, and their types apart.)
    const type = typeof param === 'string' ? table.paramTypes?.[i] : param.type;
    if (!type || type === 'Nested') return;
    const list = /\[\]$/.test(type);
    const datatype = book.table(type.replace(/\[\]$/, ''));
    if (datatype?.className === 'DatatypeTable' && datatype.hasDefaults) {
      fills.push({ index: param.index ?? i, datatype, list });
    }
  });
  return fills.length ? fills : null;
}

const KINDS = {
  // (The layout of OpenL Tablets, or of the engine this one follows.)
  Rules: (book, rows, dialect) =>
    (dialect ?? book.dialect) === 'openl' || isOpenLLayout(rows) ? new DecisionTable(book) : new RulesTable(book),
  DT: (book) => new DecisionTable(book),
  Conditions: (book) => new ExternalElementsTable(book),
  Returns: (book) => new ExternalElementsTable(book),
  Actions: (book) => new ExternalElementsTable(book),
  Multi: (book) => new RulesTable(book, true),
  Spreadsheet: (book) => new SpreadsheetTable(book),
  Calc: (book) => new SpreadsheetTable(book),
  Datatype: (book) => new DatatypeTable(book),
  Constants: (book) => new ConstantsTable(book),
  Method: (book) => new MethodTable(book),
  Test: (book) => new TestTable(book),
  Check: (book) => new CheckTable(book),
  Transform: (book) => new TransformTable(book),
  Data: (book) => new DataTable(book),
  Run: (book) => new RunTable(book),
  SmartRules: (book) => new SmartTable(book, 'SmartRules'),
  SimpleRules: (book) => new SmartTable(book, 'SimpleRules'),
  SmartLookup: (book) => new SmartTable(book, 'SmartLookup'),
  SimpleLookup: (book) => new SmartTable(book, 'SimpleLookup'),
};

const CLASSES = {
  RulesTable: (book, data) => new RulesTable(book, Boolean(data.isMulti)),
  SpreadsheetTable: (book) => new SpreadsheetTable(book),
  DatatypeTable: (book) => new DatatypeTable(book),
  ConstantsTable: (book) => new ConstantsTable(book),
  MethodTable: (book) => new MethodTable(book),
  TestTable: (book) => new TestTable(book),
  CheckTable: (book) => new CheckTable(book),
  TransformTable: (book) => new TransformTable(book),
  SmartTable: (book, data) => new SmartTable(book, data.kind),
  DataTable: (book) => new DataTable(book),
  RunTable: (book) => new RunTable(book),
  DecisionTable: (book) => new DecisionTable(book),
  ExternalElementsTable: (book) => new ExternalElementsTable(book),
};

// The properties of a table (OpenL Tablets): the rows right after its title whose first cell is "properties" (merged
// down them), each a name and a value. { properties, rows } with the rows of the table without them.
function propertiesOf(rows) {
  const properties = {};
  let end = 1;
  while (
    end < rows.length &&
    String(rows[end][0] ?? '')
      .trim()
      .toLowerCase() === 'properties'
  ) {
    const name = String(rows[end][1] ?? '').trim();
    if (name) properties[name] = typedProperty(name, rows[end][2]);
    end += 1;
  }
  return end === 1 ? { properties: null, rows } : { properties, rows: [rows[0], ...rows.slice(end)] };
}

// The language a table says its code is in (properties language or dialect: openl, js), or null.
function languageOf(properties) {
  const value = properties?.language ?? properties?.dialect;
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim().toLowerCase();
  if (text === 'openl') return 'openl';
  if (text === 'js' || text === 'javascript') return 'js';
  throw new RulesError(`The language of a table is openl or js, not "${value}"`, 'XUFA_RULES_ERR_TABLE');
}

// Values of properties: dates as dates, true and false as booleans, the rest as they are.
function typedProperty(name, value) {
  if (value === null || value === undefined) return null;
  if (/Date$/.test(name) && !(value instanceof Date)) return toValue('Date', value);
  if (typeof value === 'string' && /^(true|false)$/i.test(value.trim())) return value.trim().toLowerCase() === 'true';
  // (tags: a list.)
  if (name === 'tags' && typeof value === 'string')
    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  return value;
}

// Properties tables: properties of every table of their sheet (scope Worksheet) or of the book (scope Module).
class PropertiesTable {
  constructor(book) {
    this.book = book;
  }

  get className() {
    return 'PropertiesTable';
  }

  build({ rows, position }) {
    this.position = position;
    this.name =
      String(rows[0][0] ?? '')
        .trim()
        .split(/\s+/)[1] ?? null;
    this.scope = 'Module';
    this.properties = {};
    for (const row of rows.slice(1)) {
      const name = String(row[0] ?? '').trim();
      if (!name) continue;
      if (name === 'scope') this.scope = String(row[1] ?? 'Module').trim();
      else this.properties[name] = typedProperty(name, row[1]);
    }
    return this;
  }

  toJSON() {
    return {
      className: this.className,
      name: this.name,
      scope: this.scope,
      properties: this.properties,
      ...(this.position ? { position: this.position } : {}),
    };
  }

  fromJSON(data) {
    Object.assign(this, {
      name: data.name ?? null,
      scope: data.scope || 'Module',
      properties: data.properties || {},
      position: data.position,
    });
    return this;
  }

  toRows() {
    const cell = (value, style = 'value') => ({ value: value instanceof Date ? value : (value ?? null), style });
    return [
      [cell(`Properties${this.name ? ` ${this.name}` : ''}`, 'title'), cell(null, 'title')],
      [cell('scope', 'header'), cell(this.scope)],
      ...Object.entries(this.properties).map(([name, value]) => [cell(name, 'header'), cell(value)]),
    ];
  }
}

// The properties Properties tables give a table (not its own): those of the book (scope Module) under those of its
// category (Category: its own category, or the name of its sheet) under those of its sheet (Worksheet).
function scopedProperties(scopes, own, sheetName) {
  const of = (name) => scopes.filter((scope) => String(scope.scope ?? 'Module').toLowerCase() === name);
  const category = own?.category ?? sheetName;
  return Object.assign(
    {},
    ...of('module').map((scope) => scope.properties),
    ...of('category')
      .filter((scope) => String(scope.properties.category ?? scope.position?.sheet) === String(category))
      .map((scope) => scope.properties),
    ...of('worksheet')
      .filter((scope) => scope.position && sheetName && scope.position.sheet === sheetName)
      .map((scope) => scope.properties)
  );
}

// The language of a table before it is built (its code is compiled then): its own property, else that of Properties
// tables (of its sheet, its category, the book), else the book's. { dialect, languageFrom }.
function languageFor(book, scopes, own, sheetName) {
  const language = languageOf(own);
  if (language) return { dialect: language, languageFrom: 'property' };
  const scoped = scopes.length ? languageOf(scopedProperties(scopes, own, sheetName)) : null;
  if (scoped) return { dialect: scoped, languageFrom: 'properties' };
  return { dialect: book.dialect, languageFrom: 'book' };
}

// The runtime context of the call running (the versions of the tables it calls are chosen by it).
let running = null;
// The contexts before modifyContext and setContext, for restoreContext.
const replaced = [];

// A runtime context as OpenL gives it to rules: getValue(name), setValue(name, value); a copy of the one running.
function contextObjectOf(values) {
  return {
    values,
    getValue: (name) => values[name] ?? null,
    setValue: (name, value) => {
      values[name] = value;
    },
  };
}

// The functions of the runtime context of OpenL (for the calls a rule makes after them, until the rule ends).
const CONTEXT_FUNCTIONS = {
  getContext: () => contextObjectOf({ ...(running ?? {}) }),
  emptyContext: () => contextObjectOf({}),
  modifyContext: (name, value) => {
    replaced.push(running);
    running = { ...(running ?? {}), [name]: value };
  },
  setContext: (context) => {
    replaced.push(running);
    running = { ...(context?.values ?? context ?? {}) };
  },
  restoreContext: () => {
    if (replaced.length) running = replaced.pop();
  },
};
// The version a call runs, and all of its name ($properties, $dispatchingProperties of its expressions).
let dispatching = null;

// The sheets new tables go to when a book is written and they have no place of their own.
const SHEETS = {
  RulesTable: 'RULES',
  DatatypeTable: 'DATATYPES',
  SpreadsheetTable: 'SPREADSHEET',
  MethodTable: 'METHODS',
  ConstantsTable: 'CONSTANTS',
  TestTable: 'TESTS',
  CheckTable: 'CHECKS',
  TransformTable: 'TRANSFORMS',
  SmartTable: 'RULES',
  DecisionTable: 'RULES',
  DataTable: 'DATA',
  RunTable: 'TESTS',
};

const NAMED = new Set([
  'RulesTable',
  'DecisionTable',
  'SmartTable',
  'SpreadsheetTable',
  'MethodTable',
  'TransformTable',
  'DatatypeTable',
]);

class RuleBook {
  // onError(err, info): steps of spreadsheets that fail (they are left, as in the engine this one follows); dialect:
  // 'auto' (told by the sheets), 'openl' or 'js'; tdz: in the bodies of its Methods of JavaScript, a let or const used
  // before its declaration runs is an error (as in JavaScript), not undefined.
  constructor(options = {}) {
    this.options = { ...options };
    this.tables = [];
    this.byName = new Map();
    this.context = null;
    // The language of its formulas: 'openl' or 'js' (told by the option, else by the sheets).
    this.dialect = options.dialect && options.dialect !== 'auto' ? options.dialect : 'js';
  }

  static fromXlsx(bytes, options) {
    return RuleBook.fromSheets(readXlsx(bytes).sheets, options);
  }

  // Sheets of rows of values ({ name, rows, merges? }), as readXlsx gives them.
  static fromSheets(sheets, options) {
    const book = new RuleBook(options);
    const positionOf = (block) => ({
      sheet: block.sheet,
      row: block.row,
      column: block.column,
      height: block.rows.length,
      width: Math.max(...block.rows.map((row) => row.length)),
    });
    // (The Properties tables first: the languages they say are those of the tables of their scope, and a language of
    // the book's scope, Module, is the book's.)
    const blocks = sheets.map((sheet) => blocksOf(sheet));
    const built = new Map();
    for (const block of blocks.flat()) {
      if (String(block.rows[0][0]).trim().split(/\s+/)[0] !== 'Properties') continue;
      built.set(block, new PropertiesTable(book).build({ rows: block.rows, position: positionOf(block) }));
    }
    const scopes = [...built.values()];
    if ((book.options.dialect ?? 'auto') === 'auto') {
      // (Of the sheets whose Properties tables say no language: those that do tell their own tables.)
      const told = (sheet) =>
        languageOf(
          scopedProperties(
            scopes.filter((scope) => /^worksheet$/i.test(scope.scope ?? '')),
            null,
            sheet.name
          )
        );
      book.dialect =
        languageOf(scopedProperties(scopes.filter((scope) => /^module$/i.test(scope.scope ?? 'Module')))) ??
        dialectOf(sheets.filter((sheet) => !told(sheet)));
    }
    for (const sheetBlocks of blocks) {
      for (const block of sheetBlocks) {
        const title = String(block.rows[0][0]).trim();
        const keyword = title.split(/\s+/)[0];
        const make = keyword === 'Properties' ? () => built.get(block) : KINDS[keyword];
        const position = positionOf(block);
        if (!make) {
          book.tables.push(block.rows);
          continue;
        }
        let table;
        try {
          const { properties, rows } =
            keyword === 'Properties' ? { properties: null, rows: block.rows } : propertiesOf(block.rows);
          // (Merges are of the rows as they were: those of the properties rows taken out.)
          const removed = block.rows.length - rows.length;
          const merges = removed
            ? (block.merges || [])
                .filter((m) => m.top === 0 || m.top > removed)
                .map((m) => (m.top === 0 ? m : { ...m, top: m.top - removed, bottom: m.bottom - removed }))
            : block.merges;
          // (Its language: set before it is built, as its code is compiled then.)
          if (keyword === 'Properties') table = built.get(block);
          else {
            const { dialect, languageFrom } = languageFor(book, scopes, properties, position.sheet);
            const made = make(book, rows, dialect);
            made.dialect = dialect;
            made.languageFrom = languageFrom;
            table = made.build({ rows, merges, position });
          }
          if (properties) table.ownProperties = properties;
        } catch (err) {
          // (What was wrong, and where, apart too: reason and cell.)
          const error = new RulesError(
            `Error building table at ${position.sheet}!${cellName(position)}: ${err.message}`,
            err.code
          );
          error.reason = err.message;
          error.cell = { sheet: position.sheet, row: position.row, column: position.column };
          throw error;
        }
        book.add(table);
      }
    }
    return book.ready();
  }

  // The JSON of toJSON() (and of the engine this one follows: the same format).
  static fromJSON(json, options) {
    const book = new RuleBook(options);
    const scopes = json
      .filter((data) => data && !Array.isArray(data) && data.className === 'PropertiesTable')
      .map((data) => new PropertiesTable(book).fromJSON(data));
    const modules = scopes.filter((scope) => /^module$/i.test(scope.scope ?? 'Module'));
    const stated = languageOf(scopedProperties(modules));
    if (stated && (book.options.dialect ?? 'auto') === 'auto') book.dialect = stated;
    for (const data of json) {
      if (!data || Array.isArray(data) || !data.className) {
        book.tables.push(data);
        continue;
      }
      const make =
        data.className === 'PropertiesTable' ? (owner) => new PropertiesTable(owner) : CLASSES[data.className];
      if (!make) throw new RulesError(`Unknown table ${data.className} (name: '${data.name ?? 'unknown'}')`);
      try {
        const made = make(book, data);
        if (data.className !== 'PropertiesTable') {
          const { dialect, languageFrom } = languageFor(book, scopes, data.properties, data.position?.sheet);
          made.dialect = dialect;
          made.languageFrom = languageFrom;
        }
        const table = made.fromJSON(data);
        if (data.properties && data.className !== 'PropertiesTable') table.ownProperties = data.properties;
        book.add(table);
      } catch (err) {
        throw new RulesError(
          `Error restoring table (className: ${data.className}, name: '${data.name ?? 'unknown'}'): ${err.message}`,
          err.code
        );
      }
    }
    return book.ready();
  }

  add(table) {
    // (Elements of Conditions, Returns and Actions tables: by their titles, for SmartRules.)
    if (table.className === 'ExternalElementsTable') {
      this.externals ??= new Map();
      for (const element of table.elements) this.externals.set(element.title, { table, element });
    }
    if (NAMED.has(table.className) || ['TestTable', 'RunTable', 'CheckTable', 'DataTable'].includes(table.className)) {
      const key =
        table.className === 'TestTable' || table.className === 'RunTable'
          ? `test:${table.name}`
          : table.className === 'CheckTable'
            ? `check:${table.name}`
            : table.name;
      const known = this.byName.get(key);
      // (Types and rules are of their own names, as in OpenL: a datatype of the name of a rule is kept apart.)
      if (known && (known.className === 'DatatypeTable') !== (table.className === 'DatatypeTable')) {
        const [datatype, rule] = known.className === 'DatatypeTable' ? [known, table] : [table, known];
        (this.types ??= new Map()).set(key, datatype);
        this.byName.set(key, rule);
        this.tables.push(table);
        return table;
      }
      if (known) {
        // Versions of a table: the same name, each with the properties of where it applies.
        if (NAMED.has(table.className) && (isVersion(table) || isVersion(known) || this.versions?.has(key))) {
          this.versions ??= new Map();
          if (!this.versions.has(key)) this.versions.set(key, [known]);
          this.versions.get(key).push(table);
        } else throw new RulesError(`Table ${table.name} was already defined`);
      } else this.byName.set(key, table);
      // (A version with an id: called by its id too.)
      const id = table.ownProperties?.id;
      if (id && !this.byName.has(String(id))) {
        this.byName.set(String(id), table);
        (this.aliases ??= new Map()).set(String(id), table);
      }
    }
    this.tables.push(table);
    return table;
  }

  // Whether objects given to a table set the runtime context (fields of their datatypes mapped to it).
  setsContext(table) {
    this.contextFrom(table, []);
    return Boolean(this.mapped?.get(table));
  }

  // The runtime context its arguments set (the fields of datatypes mapped to it: usState : context), or null.
  contextFrom(table, args) {
    if (!table || !Array.isArray(table.params)) return null;
    this.mapped ??= new WeakMap();
    let mapped = this.mapped.get(table);
    if (mapped === undefined) {
      mapped = [];
      table.params.forEach((param, i) => {
        const type = typeof param === 'string' ? table.paramTypes?.[i] : param.type;
        const datatype = type ? this.table(String(type).replace(/\[\]$/, '')) : null;
        if (datatype?.className !== 'DatatypeTable') return;
        const fields = Object.values(datatype.params).filter((field) => field.context);
        if (fields.length) mapped.push({ index: param.index ?? i, fields });
      });
      if (!mapped.length) mapped = null;
      this.mapped.set(table, mapped);
    }
    if (!mapped) return null;
    let context = null;
    for (const { index, fields } of mapped) {
      const value = args[index];
      if (!value || typeof value !== 'object') continue;
      for (const field of fields) {
        const set = value[field.name];
        if (set !== null && set !== undefined && set !== '') (context ??= {})[field.context] = set;
      }
    }
    return context;
  }

  // The properties of every table: its own over those of its sheet over those of the book (Properties tables).
  inheritProperties() {
    for (const table of this.tables)
      if (table && !Array.isArray(table) && table.ownProperties) table.properties = table.ownProperties;
    const scopes = this.tables.filter((table) => table?.className === 'PropertiesTable');
    if (!scopes.length) return;
    // Scopes: Module (every table), Category (the tables of a category: their own, or the name of their sheet), and
    // Worksheet (the tables of its sheet); a table's own properties over its sheet's over its category's over the book's.
    for (const table of this.tables) {
      if (!table || Array.isArray(table) || table.className === 'PropertiesTable') continue;
      const own = table.ownProperties || {};
      const merged = { ...scopedProperties(scopes, own, table.position?.sheet), ...own };
      if (Object.keys(merged).length) table.properties = merged;
    }
  }

  // Runs a table by its name in the runtime context of the call (or a new one): its version for that context, and
  // failOnMiss (an error instead of undefined).
  dispatch(name, args, context) {
    const outer = running;
    running = context ?? running ?? { currentDate: new Date() };
    // (Fields of the arguments mapped to the runtime context: set for this call and the calls it makes.)
    const set = this.contextFrom(this.versions?.get(name)?.[0] ?? this.table(name), args);
    if (set) running = { ...running, ...set };
    // A trace: a node of this call under the call that makes it.
    const tracer = this.tracer;
    let node = null;
    if (tracer) {
      node = { table: name, kind: null, args, result: undefined, error: null, cells: [], children: [] };
      tracer.at(-1).children.push(node);
      tracer.push(node);
    }
    try {
      const versions = this.versions?.get(name);
      const table = versions ? choose(name, versions, running) : this.table(name);
      if (!table || typeof table.call !== 'function') {
        throw new RulesError(`No table ${name} to run`, 'XUFA_RULES_ERR_NOT_FOUND');
      }
      if (node) {
        node.kind = table.kind ?? table.className.replace(/Table$/, '');
        node.position = table.position ?? null;
        if (versions) node.version = table.properties ?? null;
      }
      // ($properties and $dispatchingProperties in its expressions: of the version chosen, and of all of them.)
      const outerDispatch = dispatching;
      // (category: the name of the sheet, unless a property says it.)
      const propertiesOf = (one) => ({ category: one.position?.sheet ?? null, ...(one.properties ?? {}) });
      dispatching = { properties: propertiesOf(table), all: (versions ?? [table]).map(propertiesOf) };
      let result;
      try {
        result = table.call(...this.argumentsOf(table, args));
      } finally {
        dispatching = outerDispatch;
      }
      if (node) node.result = result;
      const failOnMiss = table.properties?.failOnMiss;
      if (result === undefined && (failOnMiss === true || String(failOnMiss).toLowerCase() === 'true')) {
        throw new RulesError(`No rule of ${name} matches ${JSON.stringify(args)}`, 'XUFA_RULES_ERR_MISS');
      }
      return result;
    } catch (err) {
      if (node) node.error = err.message;
      throw err;
    } finally {
      running = outer;
      if (node) tracer.pop();
    }
  }

  // The cells of the sheet that gave the result of the table running (decision tables tell them, while tracing).
  noteMatch(cells) {
    if (this.tracer) this.tracer.at(-1).cells.push(...cells);
  }

  // How a call goes: { table, kind, position, args, result, error, cells (that gave its result), version (its
  // properties, of versions), children (the tables it called, the same) }. context: the runtime context.
  // The gaps and overlaps of the decision tables (of a name: its versions), each { table, kind, position, properties,
  // collect, axes: [{ axis, dimensions, rules, cases, truncated, partial, gaps, gapCount, overlaps, shadowed, never }] }.
  analyze(name) {
    return this.tables
      .filter((table) => table && !Array.isArray(table) && (name === undefined || table.name === name))
      .map(analyse)
      .filter(Boolean);
  }

  // The checks of its formulas (what its tests do not tell): each { table, kind, cell, code (unknown-name, not-yet,
  // unknown-member, arity, not-callable, cycle), name, message }.
  lint() {
    return lintBook(this);
  }

  // What its tests run: { tests, tables: [{ table, kind, position, tested, rules: { total, covered, missed } }] }.
  coverage() {
    return coverageOf(this);
  }

  trace(name, args = [], context) {
    const root = { children: [] };
    this.tracer = [root];
    try {
      this.dispatch(name, args, context ? { currentDate: new Date(), ...context } : undefined);
    } catch {
      // (In the node, as its error.)
    } finally {
      this.tracer = null;
    }
    return root.children[0];
  }

  // A row of a Test table of a call as it goes now: { title, names, titles, cells, result, error } (see test-case.js).
  testCase(name, args = [], options = {}) {
    return testCaseOf(this, name, args, options);
  }

  // The books (or objects of exports) the programs of this one import, by name: what `import { Rate } from 'pricing'`
  // of a Method takes. A store links them (its active versions, of the tenant); options.modules gives them too.
  get modules() {
    this.linked ??= new Map(Object.entries(this.options.modules ?? {}));
    return this.linked;
  }

  // What the programs of the book import: the resolver of their imports (a book: its exports; an object: itself).
  get resolveModule() {
    this.resolver ??= (name) => {
      const found = this.modules.get(name);
      if (found === undefined) return undefined;
      return found instanceof RuleBook ? found.exports() : found;
    };
    return this.resolver;
  }

  // The names of the books its programs (Methods of JavaScript) import.
  imports() {
    const names = new Set();
    for (const table of this.tables) {
      if (table?.className !== 'MethodTable' || table.dialect === 'openl') continue;
      try {
        for (const name of programs.imports(rewriteThis(String(table.body)))) names.add(name);
      } catch {
        // (A body that is no program of JavaScript: it imports nothing.)
      }
    }
    return [...names];
  }

  // What the book exports to the programs that import it: its tables (rules, spreadsheets, methods: functions; data
  // and constants: values; datatypes and Properties tables), frozen.
  exports() {
    if (this.exported) return this.exported;
    const own = Object.create(null);
    const hidden = new Set(['Fun', 'msg', ...Object.keys(CONTEXT_FUNCTIONS)]);
    for (const key of Object.keys(this.context)) {
      if (!hidden.has(key)) Object.defineProperty(own, key, Object.getOwnPropertyDescriptor(this.context, key));
    }
    this.exported = Object.freeze(own);
    return this.exported;
  }

  // The book in a runtime context: { call, fn } choosing the versions of tables by it (currentDate, lob, usState...).
  withContext(context) {
    const runtime = { currentDate: new Date(), ...context };
    return {
      call: (name, ...args) => this.dispatch(name, args, runtime),
      fn:
        (name) =>
        (...args) =>
          this.dispatch(name, args, runtime),
    };
  }

  // The context of every expression: Fun, the constants, and each table by name (a function, a datatype as itself).
  ready() {
    this.inheritProperties();
    // (Whether some table is of OpenL: their calls see the fields of their arguments named alone.)
    this.hasOpenL =
      this.dialect === 'openl' ||
      this.tables.some((table) => table && !Array.isArray(table) && table.dialect === 'openl');
    const context = Object.create(null);
    context.Fun = Fun;
    // (Those of the runtime context of OpenL, under the names of the book's tables.)
    Object.assign(context, CONTEXT_FUNCTIONS);
    // msg(code, arguments...): a text of the messages of the book, in the locale of the runtime context.
    const { messages } = this.options;
    context.msg = (code, ...args) => messageOf(messages, running?.locale, code, args);
    for (const table of this.tables) {
      if (Array.isArray(table) || !table) continue;
      if (table.className === 'ConstantsTable') {
        for (const param of table.params) {
          if (param.formula === undefined) context[param.name] = param.value;
          else {
            const value = this.compileFor(
              table,
              param.formula,
              `Constants, ${param.name}`
            )(Object.assign(Object.create(null), context));
            context[param.name] = param.type ? toValue(param.type, value) : value;
          }
        }
      } else if (table.className === 'PropertiesTable' && table.name) {
        // (A Properties table of a name: its properties, PreciseCategory.precision.)
        context[table.name] = Object.freeze({ ...table.properties });
      } else if (table.className === 'DatatypeTable') {
        // (A datatype of the name of a rule: the rule's is the name.)
        if (this.byName.get(table.name) === table) context[table.name] = table;
      } else if (table.className === 'DataTable') {
        // (Its records, made when an expression first reads them: their types may be of datatypes after it.)
        Object.defineProperty(context, table.name, { get: () => table.records, enumerable: true });
      } else if (NAMED.has(table.className)) {
        const { name } = table;
        // (Versions: the one of the runtime context of the call.)
        context[name] =
          this.versions?.has(name) || table.properties || this.setsContext(table)
            ? (...args) => this.dispatch(name, args)
            : (...args) => (this.tracer ? this.dispatch(name, args) : table.call(...this.argumentsOf(table, args)));
      }
    }
    // (Versions called by their id.)
    for (const id of this.aliases?.keys() ?? [])
      if (!(id in context)) context[id] = (...args) => this.dispatch(id, args);
    this.context = Object.freeze(context);
    return this;
  }

  // The function of a formula (context) => value, in the language of the book: JavaScript's (the expressions of
  // @xufa/expression), or OpenL Tablets' (types: the static types of its names; names: those with spaces it may use).
  // A formula that only the other language reads is compiled in that one. dialect: of the table (else the book's).
  compile(source, where, { types, names, dialect } = {}) {
    const openl = (dialect ?? this.dialect) === 'openl';
    const inOpenL = () => compileOpenL(String(source), { book: this, where, types, names });
    const inJs = () => compileExpression(source, where, this.options.methods);
    const [first, second] = openl ? [inOpenL, inJs] : [inJs, inOpenL];
    try {
      return first();
    } catch (err) {
      if (err.code !== 'XUFA_RULES_ERR_EXPRESSION') throw err;
      try {
        return second();
      } catch {
        throw err;
      }
    }
  }

  // The function of a formula of a table, in the language of the table.
  compileFor(table, source, where, options = {}) {
    return this.compile(source, where, { ...options, dialect: table?.dialect });
  }

  // The context of an evaluation: the book's, and these values over it.
  // The value of a constant of the book named by a text (cells of tests and data can name them), or undefined.
  constantOf(name) {
    if (typeof name !== 'string') return undefined;
    if (!this.constants) {
      this.constants = new Map();
      for (const table of this.tables) {
        if (table?.className !== 'ConstantsTable') continue;
        for (const param of table.params) this.constants.set(param.name, () => this.context[param.name]);
      }
    }
    const get = this.constants.get(name.trim());
    return get ? get() : undefined;
  }

  // The record of a reference to a Data table (>table, >table.field column) for a key; an error when there is none.
  lookup(reference, key) {
    const table = this.table(reference.table);
    if (!table || typeof table.find !== 'function') {
      throw new RulesError(`No Data table ${reference.table} to refer to`, 'XUFA_RULES_ERR_NOT_FOUND');
    }
    const found = table.find(key, { column: reference.column, field: reference.field });
    if (found === null) throw new RulesError(`No ${key} in ${reference.table}`, 'XUFA_RULES_ERR_NOT_FOUND');
    return found;
  }

  contextWith(values) {
    const context = Object.create(this.context);
    // (In books of OpenL, a field of an argument can be named alone when nothing else has the name: BEX's
    // uniqueness of scope, effectiveDate for policy.effectiveDate.)
    if (values && (this.hasOpenL ?? this.dialect === 'openl')) {
      const records = Object.values(values).filter(
        (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)
      );
      if (records.length) Object.defineProperty(context, '$$records', { value: records, enumerable: false });
    }
    if (dispatching) {
      context.$properties = dispatching.properties;
      context.$dispatchingProperties = dispatching.all;
    }
    if (values) for (const key of Object.keys(values)) context[key] = values[key];
    return context;
  }

  reportError(err, info) {
    if (this.options.onError) this.options.onError(err, info);
  }

  table(name) {
    return this.byName.get(name);
  }

  get names() {
    return this.tables
      .filter((table) => table && NAMED.has(table.className) && table.className !== 'DatatypeTable')
      .map((table) => table.name);
  }

  fn(name) {
    const table = this.table(name);
    if (!table || typeof table.call !== 'function')
      throw new RulesError(`No table ${name} to run`, 'XUFA_RULES_ERR_NOT_FOUND');
    if (!this.versions?.has(name) && !table.properties && !this.setsContext(table) && !this.aliases?.has(name))
      return (...args) => table.call(...this.argumentsOf(table, args));
    return (...args) => this.dispatch(name, args);
  }

  call(name, ...args) {
    return this.fn(name)(...args);
  }

  // The arguments of a call of a table: those of a datatype with default values (or lists of them) are copied with
  // the fields they lack; the others, and the objects that lack none, are given as they are.
  argumentsOf(table, args) {
    this.fills ??= new WeakMap();
    let fills = this.fills.get(table);
    if (fills === undefined) {
      fills = fillsOf(table, this);
      this.fills.set(table, fills);
    }
    if (!fills) return args;
    let result = args;
    for (const { index, datatype, list } of fills) {
      const value = args[index];
      let filled;
      if (list && Array.isArray(value)) {
        const items = value.map((item) => datatype.filled(item));
        filled = items.some((item, i) => item !== value[i]) ? items : value;
      } else filled = datatype.filled(value);
      if (filled === value) continue;
      if (result === args) result = [...args];
      result[index] = filled;
    }
    return result;
  }

  checkReturns() {
    const errors = [];
    for (const table of this.tables) {
      if (table?.className !== 'RulesTable') continue;
      const type = table.returnParam?.type;
      if (!['Integer', 'Float', 'Double'].includes(type)) continue;
      for (const value of table.matrix.flat()) {
        if (value === null || value === '' || value === undefined) continue;
        // (A formula gives a value of its own.)
        if (typeof value === 'string' && value.trim().startsWith('=')) continue;
        if (type === 'Integer' && !isInteger(value)) {
          errors.push(`Table ${table.name} has return type Integer but it contains non-integer values`);
          break;
        }
        if (!isNumber(value)) {
          errors.push(`Table ${table.name} has return type ${type} but it contains non-float values (e.g.: ${value})`);
          break;
        }
      }
    }
    return errors;
  }

  checkParams() {
    const errors = [];
    for (const table of this.tables) {
      if (table?.className !== 'RulesTable') continue;
      // A parameter that is no condition is wrong unless a formula (=cell, script of RET) uses it.
      const formulas = [
        table.returnParam?.script ?? '',
        ...table.matrix.flat().filter((value) => typeof value === 'string' && value.trim().startsWith('=')),
      ];
      const uses = (name) =>
        formulas.some((formula) => {
          let at = formula.indexOf(name);
          while (at !== -1) {
            const before = formula[at - 1] ?? ' ';
            const after = formula[at + name.length] ?? ' ';
            if (!/[\w$.]/.test(before) && !/[\w$]/.test(after)) return true;
            at = formula.indexOf(name, at + 1);
          }
          return false;
        });
      for (const param of table.params) {
        if (param.position) continue;
        if (uses(param.name)) continue;
        errors.push(`Table ${table.name} has argument ${param.name} without a header`);
      }
    }
    return errors;
  }

  // The messages of what is wrong: results of the wrong type, parameters without a header, expressions that do not
  // compile (=cells, steps, transforms), the rows of Test tables
  // that fail, and what check functions say of the values of the tables Check tables name (checks: { [check name]:
  // async (values, tableName, checkName) => [messages] }).
  async test({ checks = {} } = {}) {
    const errors = [...this.checkReturns(), ...this.checkParams()];
    for (const table of this.tables) if (typeof table?.validate === 'function') errors.push(...table.validate());
    for (const table of this.tables) if (table?.className === 'TestTable') errors.push(...table.run());
    for (const table of this.tables) {
      if (table?.className !== 'CheckTable') continue;
      const check = checks[table.name];
      if (!check) {
        errors.push(`Check function for Check Table "${table.name}" not found`);
        continue;
      }
      for (const [i, name] of table.tableNames.entries()) {
        const target = this.table(name);
        if (!target || typeof target.allResults !== 'function') {
          errors.push(`Table ${name} from Check Table ${table.name} not found`);
          continue;
        }
        errors.push(...((await check(target.allResults(table.routes[i]), target.name, table.name)) || []));
      }
    }
    return errors;
  }

  // The rows of every Test table: [{ name, table, position, rows: [{ row, description, input, expected, actual,
  // passed, message(s), error }] }].
  testResults() {
    return this.tables
      .filter((table) => table?.className === 'TestTable' || table?.className === 'RunTable')
      .map((table) => {
        // (The cell of each row in the sheet: below the title, its properties and its header rows.)
        const { position } = table;
        const first =
          (position?.row ?? 0) +
          (table.ownProperties ? Object.keys(table.ownProperties).length : 0) +
          (table.openl ? 3 : 2);
        return {
          name: table.name,
          kind: table.className === 'RunTable' ? 'Run' : 'Test',
          table: table.refTableName,
          position: position ?? null,
          rows: table.results().map((result) =>
            result.row
              ? {
                  ...result,
                  cell: {
                    sheet: position?.sheet ?? null,
                    row: first + result.row - 1,
                    column: position?.column ?? 0,
                  },
                }
              : result
          ),
        };
      });
  }

  toJSON() {
    return this.tables.map((table) => {
      if (Array.isArray(table) || !table) return table;
      const json = table.toJSON();
      return table.ownProperties ? { ...json, properties: table.ownProperties } : json;
    });
  }

  // The sheets of the book: each table where it was (its sheet, its row), new ones under the others of their sheet.
  toSheets() {
    const sheets = new Map();
    const sheetOf = (name) => {
      if (!sheets.has(name)) sheets.set(name, { name, rows: [], merges: [], widths: [], next: 1 });
      return sheets.get(name);
    };
    const placed = [];
    for (const table of this.tables) {
      if (!table || Array.isArray(table)) continue;
      const rows = table.toRows();
      // Its own properties: rows after its title, "properties" in the first cell.
      if (table.ownProperties) {
        const width = Math.max(3, ...rows.map((row) => row.length));
        const props = Object.entries(table.ownProperties).map(([name, value]) => [
          { value: 'properties', style: 'header' },
          { value: name, style: 'header' },
          { value: value ?? null, style: 'value' },
          ...Array.from({ length: width - 3 }, () => ({ value: null, style: 'value' })),
        ]);
        rows.splice(1, 0, ...props);
      }
      const position = table.position;
      const sheet = sheetOf(position?.sheet ?? SHEETS[table.className] ?? 'RULES');
      placed.push({ table, rows, sheet, position });
    }
    // First the tables with their place, then the others under them, a row apart.
    placed.sort((a, b) => Number(!a.position) - Number(!b.position));
    for (const { table, rows, sheet, position } of placed) {
      let top = position ? position.row : sheet.next;
      const left = position ? position.column : 1;
      const height = rows.length;
      const width = Math.max(...rows.map((row) => row.length));
      if (!position || overlaps(sheet, top, left, height, width)) top = sheet.next;
      rows.forEach((row, r) => {
        const target = (sheet.rows[top + r] ??= []);
        row.forEach((cell, c) => {
          target[left + c] = cell;
        });
      });
      sheet.merges.push({ top, left, bottom: top, right: left + Math.max(width - 1, 0) });
      // (The merges inside a table say what its cells mean: ranges of two columns, the corner of a lookup.)
      // (Below the rows of its properties, merged down the first column.)
      const shift = table.ownProperties ? Object.keys(table.ownProperties).length : 0;
      if (shift > 1) sheet.merges.push({ top: top + 1, left, bottom: top + shift, right: left });
      for (const m of table.merges || []) {
        if (m.top === 0) continue;
        sheet.merges.push({
          top: top + shift + m.top,
          left: left + m.left,
          bottom: top + shift + m.bottom,
          right: left + m.right,
        });
      }
      sheet.next = Math.max(sheet.next, top + height + 1);
      (sheet.areas ??= []).push({ top, left, bottom: top + height - 1, right: left + width - 1 });
      for (let c = 0; c < width; c += 1) sheet.widths[left + c] = Math.max(sheet.widths[left + c] ?? 12, 18);
    }
    return [...sheets.values()].map(({ name, rows, merges, widths }) => ({
      name,
      rows: Array.from({ length: rows.length }, (_, r) => rows[r] ?? []),
      merges,
      widths,
    }));
  }

  toXlsx() {
    const sheets = this.toSheets();
    return writeXlsx({ sheets: sheets.length ? sheets : [{ name: 'RULES', rows: [] }] });
  }

  // The workbook of the book (its bytes) with the matrix of a table changed in place: the cells that change, and
  // nothing else of the workbook (patchXlsx). The book must have been read from that workbook (its tables know their
  // place) and the matrix be of the same size.
  applyMatrix(bytes, name, matrix) {
    const table = this.byName.get(name);
    if (!table) throw new RulesError(`Table ${name} not found`, 'XUFA_RULES_ERR_TABLE');
    if (!table.matrix || typeof table.sheetCell !== 'function') {
      throw new RulesError(`Table ${name} does not have a matrix`, 'XUFA_RULES_ERR_TABLE');
    }
    if (matrix.length !== table.matrix.length || matrix[0]?.length !== table.matrix[0]?.length) {
      throw new RulesError(`Matrix size does not match table ${name} size`, 'XUFA_RULES_ERR_TABLE');
    }
    const first = table.sheetCell(0, 0);
    if (!first.sheet) {
      throw new RulesError(
        `Table ${name} has no place in a sheet: read the book from its workbook`,
        'XUFA_RULES_ERR_TABLE'
      );
    }
    const whole = new Map();
    const changed = new Map();
    matrix.forEach((line, i) =>
      line.forEach((value, j) => {
        const ref = refOf(first.row + i, first.column + j);
        whole.set(ref, value);
        const old = table.matrix[i][j];
        const same = old instanceof Date && value instanceof Date ? old.getTime() === value.getTime() : old === value;
        if (!same) changed.set(ref, value);
      })
    );
    return changed.size ? patchXlsx(bytes, first.sheet, changed, { whole }) : Buffer.from(bytes);
  }
}

function overlaps(sheet, top, left, height, width) {
  return (sheet.areas || []).some(
    (area) =>
      top <= area.bottom + 1 &&
      top + height - 1 >= area.top - 1 &&
      left <= area.right + 1 &&
      left + width - 1 >= area.left - 1
  );
}

function cellName({ row, column }) {
  let name = '';
  for (let n = column + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return `${name}${row + 1}`;
}

export { RuleBook };
