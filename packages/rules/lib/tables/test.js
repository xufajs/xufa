// Test tables: rows of values of the parameters of a table and the result each must give.
//
//   Test Discount DiscountTests                Test Calculate QuoteTests Customer   <- Datatype of the input fields
//   plan    | age | (result)                   plan  | age | RET.total | RET.base   <- RET.path: a value of the result
//   basic   | 30  | 0.05                       basic | 30  | 95        | 100
//
// Rules tables take the values as their parameters (by name), spreadsheets one object of them (typed as the datatype
// says), methods their parameters in order. The result is the last column, or the RET.path columns. Failures are
// messages, as the engine this one follows writes them.
import { toValue } from '../values.js';
import { transpose } from './decision.js';
import { valueOfType } from '../typed.js';
import { member } from '../openl/runtime.js';
import { RecordReader } from '../records.js';
import { fieldTypeOf } from './simple.js';

// (The type of the record of a case of a test: its fields are the parameters of the table.)
const CASE = '#case';

const text = (value) => (value === null || value === undefined ? '' : String(value).trim());
const isObject = (value) => Object.prototype.toString.call(value) === '[object Object]';
const isEmpty = (value) =>
  value === null ||
  value === undefined ||
  (Array.isArray(value) && value.length === 0) ||
  (typeof value === 'string' && value.trim() === '');

function convert(value, type) {
  switch (type?.toLowerCase()) {
    case 'number':
    case 'float':
    case 'integer':
    case 'double':
      return Number(value);
    case 'boolean':
      return value === 'true' || value === true;
    case 'date':
      return new Date(value);
    case 'string':
      return value === null || value === undefined ? value : String(value);
    case 'arraynumber':
      if (Array.isArray(value)) return value.map(Number);
      return typeof value === 'string'
        ? value
            .split(/\r?[\n,]/)
            .map((item) => Number(item.trim()))
            .filter((n) => !Number.isNaN(n))
        : [];
    case 'arraystring':
      if (Array.isArray(value)) return value.map(String);
      return typeof value === 'string' ? value.split(/\r?[\n,]/).map((item) => item.trim()) : [];
    default:
      return value;
  }
}

// A value in a message: JSON, BigInts and decimals as their digits.
const shown = (value) =>
  JSON.stringify(value, (key, item) => (typeof item === 'bigint' ? Number(item) : item)) ?? String(value);

const SPECIAL = /^_(res|error|description|context)_/;
// Whether the rows of a test of OpenL are transposed: _res_ (or _error_...) down the first column, not across.
function isTransposedTest(rows) {
  const across = (rows[1] || []).slice(1).some((cell) => SPECIAL.test(text(cell)));
  if (across) return false;
  const down = rows.slice(2).some((row) => SPECIAL.test(text(row[0])));
  return down || (rows.length === 2 && SPECIAL.test(text(rows[1]?.[0])));
}

function setPath(target, path, value) {
  const keys = path.split('.');
  let node = target;
  for (const key of keys.slice(0, -1)) {
    if (!isObject(node[key])) node[key] = {};
    node = node[key];
  }
  node[keys[keys.length - 1]] = value;
}

const arrayEquals = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);

// A value of a cell as a type says (numbers of texts, booleans, dates; others as they are).
function typed(value, type) {
  if (isEmpty(value)) return value === '' ? null : value;
  const name = String(type || '').toLowerCase();
  if (['integer', 'int', 'long', 'double', 'float', 'number', 'bigdecimal'].includes(name)) {
    return typeof value === 'number' ? value : Number(value);
  }
  if (name === 'boolean') return value === true || /^(true|yes)$/i.test(String(value));
  if (name === 'string') return String(value);
  if (name === 'date') return value instanceof Date ? value : new Date(value);
  return value;
}

const listOf = (value) =>
  Array.isArray(value)
    ? value
    : String(value)
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);

// Equal values: numbers within a billionth (sums of decimals), dates by time, lists and objects by their values.
function sameValue(expected, actual) {
  // (BigIntegers and BigDecimals of OpenL's code: compared as their numbers.)
  // (Decimals against the text of their digits.)
  if (
    actual &&
    typeof actual === 'object' &&
    typeof actual.toNumber === 'function' &&
    typeof expected === 'string' &&
    /^-?\d*\.?\d+$/.test(expected.trim())
  ) {
    return actual.toString() === expected.trim() || actual.toNumber() === Number(expected);
  }
  // (One value against an array of one.)
  if (Array.isArray(actual) && actual.length === 1 && (typeof expected === 'number' || typeof expected === 'boolean'))
    return sameValue(expected, actual[0]);
  // (Exact longs and BigIntegers against the text of their digits.)
  if (typeof actual === 'bigint' && typeof expected === 'string' && /^-?\d+$/.test(expected.trim()))
    return actual === BigInt(expected.trim());
  if (typeof actual === 'bigint') actual = Number(actual);
  if (actual && typeof actual === 'object' && typeof actual.toNumber === 'function') actual = actual.toNumber();
  // (An array expected as the text of a list: "Bob, Cid", "1, , 3" with an empty element.)
  if (Array.isArray(actual) && typeof expected === 'string') {
    const items = expected.split(/(?<!\\),/).map((item) => item.trim().replace(/\\,/g, ','));
    return (
      items.length === actual.length &&
      items.every((item, i) =>
        item === '' ? actual[i] === null || actual[i] === undefined || actual[i] === '' : sameValue(item, actual[i])
      )
    );
  }
  if (expected === null && (actual === undefined || actual === '')) return true;
  if (typeof expected === 'number' && typeof actual === 'number') {
    if (expected === actual) return true;
    return Math.abs(expected - actual) <= 1e-9 * Math.max(1, Math.abs(expected), Math.abs(actual));
  }
  if (typeof expected === 'number' && typeof actual === 'string') return sameValue(expected, Number(actual));
  if (expected instanceof Date || actual instanceof Date) {
    return new Date(expected).getTime() === new Date(actual).getTime();
  }
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      expected.length === actual.length &&
      expected.every((item, i) => sameValue(item, actual[i]))
    );
  }
  if (isObject(expected)) return isObject(actual) && subsetDifferences(expected, actual).length === 0;
  if (typeof expected === 'string' && typeof actual !== 'string' && actual !== null && actual !== undefined) {
    // ("2960.0" against 2960: numbers.)
    if (typeof actual === 'number' && expected.trim() !== '' && !Number.isNaN(Number(expected))) {
      // (A float against the text OpenL writes of it: 3.4028235E38.)
      if (Math.fround(actual) === actual && Math.fround(Number(expected)) === actual) return true;
      return sameValue(Number(expected), actual);
    }
    return expected === String(actual);
  }
  // (Texts without the spaces around them.)
  if (typeof expected === 'string' && typeof actual === 'string') return expected.trim() === actual.trim();
  return expected === actual;
}

// The fields an expectation names that the result has otherwise (the result may have more).
function subsetDifferences(expected, actual, path = '', found = []) {
  for (const [key, value] of Object.entries(expected)) {
    const at = path ? `${path}.${key}` : key;
    const got = actual === null || actual === undefined ? undefined : actual[key];
    if (isObject(value) && isObject(got)) subsetDifferences(value, got, at, found);
    else if (!sameValue(value, got)) found.push({ path: at, expected: value, actual: got });
  }
  return found;
}

// Up to 3 differences of two values, their paths.
function differences(expected, actual, path, found = []) {
  if (expected === actual || found.length >= 3) return found;
  if (isObject(expected) && isObject(actual)) {
    for (const key of Object.keys(expected)) {
      const at = path ? `${path}.${key}` : key;
      if (!(key in actual)) found.push({ path: at, expected: expected[key], actual: undefined });
      else differences(expected[key], actual[key], at, found);
      if (found.length >= 3) return found;
    }
    for (const key of Object.keys(actual)) {
      if (!(key in expected))
        found.push({ path: path ? `${path}.${key}` : key, expected: undefined, actual: actual[key] });
      if (found.length >= 3) return found;
    }
    return found;
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    expected.forEach((value, i) => {
      if (value !== actual[i]) differences(value, actual[i], path ? `${path}[${i}]` : `[${i}]`, found);
    });
    return found;
  }
  found.push({ path: path || '0', expected, actual });
  return found;
}

const comparable = (value) => {
  if (isEmpty(value)) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(',').map((item) => item.trim());
  return [value];
};

// The messages of the differences of a result of a spreadsheet: every key of both compared.
function compareResult(name, row, actual, expected, path, errors) {
  const at = path || '0';
  const message = (a, b) =>
    `Test ${name} failed at row ${row + 1}.Expected object with property "${at}" equal to "${b}" but got "${a}"`;
  if (isObject(actual) && isObject(expected)) {
    for (const key of new Set([...Object.keys(actual), ...Object.keys(expected)])) {
      compareResult(name, row, actual[key], expected[key], path ? `${path}.${key}` : key, errors);
    }
  } else if (isObject(actual) && Object.keys(actual).length) {
    compareResult(name, row, actual, {}, path, errors);
  } else if (isObject(expected) && Object.keys(expected).length) {
    compareResult(name, row, {}, expected, path, errors);
  } else if (Array.isArray(actual) || Array.isArray(expected)) {
    const a = comparable(actual);
    const b = comparable(expected);
    if (!arrayEquals(a, b)) errors.push(message(a, b));
  } else {
    const a = isEmpty(actual) ? '' : actual;
    const b = isEmpty(expected) ? '' : expected;
    if (a !== b) errors.push(message(a, b));
  }
}

class TestTable {
  static kind = 'Test';

  constructor(book) {
    this.book = book;
  }

  get className() {
    return 'TestTable';
  }

  build({ rows, merges = [], position }) {
    this.position = position;
    [, this.refTableName, this.name, this.dataType] = text(rows[0][0]).split(/\s+/);
    // A test of OpenL written transposed (its names down the first column, a case each column after the titles).
    this.transposed = isTransposedTest(rows);
    if (this.transposed) ({ rows, merges } = transpose(rows, merges));
    this.paramNames = (rows[1] || []).map(text);
    // The tests of OpenL Tablets: _res_ (or _res_.path), _description_ and _error_ columns, a row of references to
    // Data tables (>table) perhaps, and a row of titles.
    this.openl = this.paramNames.some((name) => /^_(res|error|description)_/.test(name));
    const references = this.openl && (rows[2] || []).some((cell) => text(cell).startsWith('>'));
    this.references = references ? rows[2].map((cell) => text(cell) || null) : [];
    this.titles = this.openl ? (rows[references ? 3 : 2] || []).map(text) : null;
    const start = this.openl ? (references ? 4 : 3) : 2;
    this.data = rows.slice(start);
    this.merges = merges
      .filter((merge) => (merge.top === 1 && merge.right > merge.left) || merge.top >= start)
      .map((merge) =>
        merge.top === 1
          ? { ...merge, headerRow: true }
          : { ...merge, top: merge.top - start, bottom: merge.bottom - start }
      );
    return this;
  }

  // The cases of a test of OpenL: a group of rows each (its first column merged over them), its arguments read as
  // records (paths, lists of objects over rows, references to Data tables).
  openlCases(table) {
    const params = table.params.map((param, i) =>
      typeof param === 'string' ? { name: param, type: table.paramTypes?.[i] ?? null } : param
    );
    const types = Object.fromEntries(params.map((param) => [param.name, param.type]));
    const reader = new RecordReader({
      fields: this.paramNames.map((name) => (/^_(res|error|description|context)_/.test(name) ? null : name)),
      references: this.references ?? [],
      rows: this.data,
      merges: this.merges ?? [],
      typeOf: (type, field) => (type === CASE ? (types[field] ?? null) : fieldTypeOf(this.book, type, field)),
      resolve: (reference, key) => this.book.lookup(reference, key),
      constant: (name) => this.book.constantOf(name),
    });
    const records = reader.records(CASE);
    // (Rows of nothing but expectations: cases too.)
    const groups =
      reader.groups.length || !this.data.length ? reader.groups : this.data.map((_, r) => ({ from: r, to: r + 1 }));
    return groups.map((group, i) => ({ group, record: records[i] ?? {}, params }));
  }

  // The arguments of a row of a test of OpenL: a column for each argument, or for paths in it (policy.driver.age).
  openlInput(table, row) {
    // (Methods: names, and their types apart.)
    const params = table.params.map((param, i) =>
      typeof param === 'string' ? { name: param, type: table.paramTypes?.[i] ?? null } : param
    );
    return params.map((param) => {
      let value;
      this.paramNames.forEach((name, i) => {
        if (name === param.name) value = valueOfType(row[i], param.type);
        else if (name.startsWith(`${param.name}.`)) {
          if (value === undefined || value === null || typeof value !== 'object') value = {};
          const path = name.slice(param.name.length + 1);
          const field = this.book.table(param.type)?.params?.[path.split('.')[0]];
          setPath(value, path, valueOfType(row[i], field?.type));
        }
      });
      // (An object of a datatype: the fields the row does not give take their default values.)
      const datatype = this.book.table(param.type);
      if (value && typeof value === 'object' && typeof datatype?.withDefaults === 'function')
        datatype.withDefaults(value);
      return value;
    });
  }

  // { value } or { fields } a row of a test of OpenL expects (fields: of _res_.path columns), or undefined (none).
  // The path in a result of a field a test expects: $Column$Row of a spreadsheet (the row of a spreadsheet of steps,
  // its row and column of a grid), $Step : Type without its type, a.b of others.
  resultPath(table, field) {
    const plain = field.replace(/\s*:\s*[\w.<>[\], ]+$/, '');
    // (Its first segment a step or a cell of the spreadsheet; the rest read in what it is: [1].$Value$Premium.)
    const at = plain.search(/[.[]/);
    const head = at === -1 ? plain : plain.slice(0, at);
    const tail = at === -1 ? '' : plain.slice(at);
    const cell = /^\$([^$]+)\$(.+)$/.exec(head);
    if (cell && table.className === 'SpreadsheetTable')
      return `${table.grid ? `${cell[2]}.${cell[1]}` : cell[2]}${tail}`;
    return `${head.replace(/^\$/, '')}${tail}`;
  }

  // The fields a test expects that the result has otherwise: each path read in the result as OpenL reads it (fields,
  // $Column$Row cells of results of spreadsheets, [i] elements), compared to its precision (decimals) if it has one.
  pathDifferences(table, paths, actual) {
    const found = [];
    for (const { path, value, precision } of paths) {
      const steps = this.resultPath(table, path)
        .split(/\.(?![^[]*\])/)
        .flatMap((part) => {
          const index = /^(.*?)\[(\d+)\]$/.exec(part);
          return index ? [index[1], Number(index[2])].filter((step) => step !== '') : [part];
        });
      let got = actual;
      for (const step of steps) {
        if (got === null || got === undefined) break;
        got =
          typeof step === 'number' ? (Array.isArray(got) ? got[step] : undefined) : (member(got, step) ?? undefined);
      }
      let same;
      if (precision !== null && typeof got === 'number' && !isEmpty(value) && !Number.isNaN(Number(value))) {
        same = Math.abs(Number(value) - got) <= 0.5 * 10 ** -precision + 1e-12;
      } else same = sameValue(isEmpty(value) ? null : value, got);
      if (!same) found.push({ path, expected: isEmpty(value) ? null : value, actual: got });
    }
    return found;
  }

  openlExpected(table, original) {
    // (Cells naming constants of the book: their values.)
    const row = original.map((cell) => this.book.constantOf(cell) ?? cell);
    const type = table.returnParam ? table.returnParam.type : String(table.type || '');
    let expected;
    this.paramNames.forEach((name, i) => {
      if (isEmpty(row[i])) return;
      if (name === '_res_' || /^_res_\s*\(\d+\)$/.test(name)) {
        const precise = /\((\d+)\)$/.exec(name);
        expected = {
          value: /\[\]$/.test(type) || table.collect ? listOf(row[i]) : typed(row[i], type),
          precision: precise ? Number(precise[1]) : null,
        };
      } else if (name.startsWith('_res_.')) {
        expected ??= { fields: {}, paths: [] };
        expected.fields ??= {};
        expected.paths ??= [];
        // (Name (2): compared to 2 decimals.)
        const precise = /\s*\((\d+)\)\s*$/.exec(name);
        const field = precise ? name.slice(6, precise.index) : name.slice(6);
        expected.paths.push({ path: field, value: row[i], precision: precise ? Number(precise[1]) : null });
        setPath(expected.fields, this.resultPath(table, field), row[i]);
      }
    });
    return expected;
  }

  openlRow(table, row, i, record, params) {
    const at = (name) => {
      const index = this.paramNames.indexOf(name);
      return index === -1 ? null : row[index];
    };
    const description = at('_description_');
    const error = at('_error_');
    // _error_.code, _error_.message, _error_.field...: the fields of the error expected.
    const errorFields = this.paramNames
      .map((name, index) => (name.startsWith('_error_.') && !isEmpty(row[index]) ? [name.slice(8), row[index]] : null))
      .filter(Boolean);
    const input = record
      ? params.map((param) => {
          const value = record[param.name] ?? null;
          // (An object of a datatype: the fields the row does not give take their default values.)
          const datatype = this.book.table(param.type);
          if (value && typeof value === 'object' && typeof datatype?.withDefaults === 'function')
            datatype.withDefaults(value);
          return value;
        })
      : this.openlInput(table, row);
    const expected = this.openlExpected(table, row);
    const result = {
      row: i + 1,
      description: isEmpty(description) ? null : String(description),
      input,
      expected: expected ? (expected.fields ?? expected.value) : null,
    };
    const where = `Test ${this.name} failed at row ${i + 1}${result.description ? ` (${result.description})` : ''}`;
    // The runtime context of the case: _context_.usState, _context_.currentDate... columns.
    let context;
    this.paramNames.forEach((name, i) => {
      if (!name.startsWith('_context_.') || isEmpty(row[i])) return;
      const key = name.slice(10);
      context ??= { currentDate: new Date() };
      context[key] = /date$/i.test(key) ? valueOfType(row[i], 'Date') : row[i];
    });
    let actual;
    try {
      actual = this.book.dispatch(this.refTableName, input, context);
    } catch (err) {
      if (!isEmpty(error) && String(err.message).includes(String(error))) {
        return { ...result, passed: true, actual: null, error: err.message };
      }
      if (errorFields.length && errorFields.every(([field, value]) => sameValue(value, err.body?.[field]))) {
        return { ...result, passed: true, actual: null, error: err.message };
      }
      return { ...result, passed: false, actual: null, error: err.message, message: `${where}: ${err.message}` };
    }
    result.actual = actual === undefined ? null : actual;
    if (!isEmpty(error)) {
      return {
        ...result,
        passed: false,
        message: `${where}. Expected the error "${error}" but got ${shown(result.actual)}`,
      };
    }
    if (!expected) return { ...result, passed: true };
    // (The precision of the test, a property of it: decimals, or tens and hundreds when negative.)
    const precision = expected.precision ?? this.properties?.precision ?? this.ownProperties?.precision ?? null;
    const found = expected.paths
      ? this.pathDifferences(table, expected.paths, actual)
      : precision !== null && precision !== undefined && typeof (actual?.toNumber?.() ?? actual) === 'number'
        ? Math.abs(Number(expected.value) - Number(actual?.toNumber?.() ?? actual)) <=
          0.5 * 10 ** -Number(precision) + 1e-9
          ? []
          : [{ path: '', expected: expected.value, actual }]
        : sameValue(expected.value, actual)
          ? []
          : [{ path: '', expected: expected.value, actual }];
    if (!found.length) return { ...result, passed: true };
    return {
      ...result,
      passed: false,
      message: found
        .map(
          (one) =>
            `${where}. Expected ${one.path ? `${one.path} ` : ''}${shown(one.expected)} but got ${shown(one.actual)}`
        )
        .join('\n'),
    };
  }

  inputOf(table, row, types, datatype) {
    const names = this.paramNames;
    if (['RulesTable', 'SmartTable', 'DecisionTable'].includes(table.className)) {
      const args = [];
      for (let i = 0; i < names.length - 1; i += 1) {
        if (names[i].startsWith('RET.') || !names[i]) continue;
        const index = table.params.findIndex((item) => item.name === names[i]);
        if (index === -1) throw new Error(`Param ${names[i]} not found in ${table.name}`);
        args[table.params[index].index ?? index] = row[i];
      }
      return args;
    }
    if (table.className === 'SpreadsheetTable') {
      const input = {};
      names.forEach((name, i) => {
        if (!name || name.startsWith('RET.')) return;
        // (An empty cell of a field with a default value takes it, below; else as the engine this one follows.)
        if (isEmpty(row[i]) && types?.[name] && datatype?.defaultOf?.(types[name]) !== undefined) return;
        input[name] = convert(row[i], types?.[name]?.type);
      });
      // (The fields the row leaves empty take the default values of the datatype.)
      if (typeof datatype?.withDefaults === 'function') datatype.withDefaults(input);
      return [input];
    }
    if (table.className === 'MethodTable') {
      return table.params.map((param) => row[names.indexOf(param)]);
    }
    throw new Error(`Tests of ${table.className} are not supported`);
  }

  expectedOf(table, row, types) {
    const ret = this.paramNames.map((name, i) => [name, i]).filter(([name]) => name.startsWith('RET.'));
    const decision = ['RulesTable', 'SmartTable', 'DecisionTable'].includes(table.className);
    const returnType = table.returnParam ? table.returnParam.type : String(table.type || '').replace(/\[\]$/, '');
    if (decision && !ret.length) {
      const raw = row[row.length - 1];
      let value;
      if (table.isMulti || table.collect) {
        value = String(raw ?? '')
          .split(',')
          .map((item) => toValue(returnType, item.trim()));
      } else {
        if (typeof raw === 'string' && raw.startsWith('{') && raw.endsWith('}')) {
          try {
            value = JSON.parse(raw);
          } catch {
            // (Not JSON: the text as it is.)
          }
        }
        if (value === undefined) value = toValue(returnType, raw);
      }
      return { raw, value };
    }
    if (!ret.length) {
      const raw = row[row.length - 1];
      return { raw, value: raw };
    }
    const value = {};
    let raw = '';
    for (const [name, i] of ret) {
      const path = name.slice(4);
      const cell = row[i];
      const typed =
        table.className === 'RulesTable'
          ? toValue(returnType, cell)
          : isEmpty(cell) || !types?.[path]?.type
            ? cell
            : convert(cell, types[path].type);
      setPath(value, path, typed);
      raw = `${raw}${cell}, `;
    }
    return { raw, value };
  }

  // The messages of the rows that fail.
  run() {
    return this.results().flatMap((result) => (result.passed ? [] : (result.messages ?? [result.message])));
  }

  // Each row: { row, description, input, expected, actual, passed, message (or messages), error }.
  results() {
    const table = this.book.table(this.refTableName);
    if (!table || typeof table.call !== 'function') {
      return [{ row: 0, passed: false, message: `Table ${this.refTableName} not found at Test ${this.name}` }];
    }
    if (this.openl) {
      // (Rows that are no case of a record — only expectations — each a case.)
      const cases = this.paramNames.some(
        (name, i) => name && !/^_(res|error|description|context)_/.test(name) && i >= 0
      )
        ? this.openlCases(table)
        : this.data.map((_, r) => ({ group: { from: r, to: r + 1 }, record: null }));
      return cases.map(({ group, record, params }) =>
        this.openlRow(table, this.data[group.from], group.from, record, params)
      );
    }
    const datatype = this.dataType ? this.book.table(this.dataType) : undefined;
    const types = datatype?.params;
    return this.data.map((row, i) => {
      const errors = [];
      let input = null;
      let expectedValue = null;
      let actualValue = null;
      try {
        const expected = this.expectedOf(table, row, types);
        input = this.inputOf(table, row, types, datatype);
        expectedValue = expected.value;
        const value = table.call(...input);
        const actual = value === undefined ? null : value;
        actualValue = actual;
        if (Array.isArray(actual)) {
          const list = Array.isArray(expected.value) ? expected.value : String(expected.value).split(/\n|,/g);
          if (!arrayEquals(actual, list))
            errors.push(
              `Test ${this.name} failed at row ${i + 1}. Expected ${expected.raw} but got ${actual.join(', ')}`
            );
        } else if (isObject(actual)) {
          if (table.className === 'RulesTable') {
            for (const found of differences(expected.value, actual)) {
              errors.push(
                `Test ${this.name} failed at row ${i + 1}. Expected object with property "${found.path}" equal to "${found.expected}" but got "${found.actual}"`
              );
            }
          } else {
            compareResult(this.name, i, actual, expected.value, undefined, errors);
          }
        } else if (actual !== expected.value) {
          errors.push(`Test ${this.name} failed at row ${i + 1}. Expected ${expected.raw} but got ${actual}`);
        }
      } catch (err) {
        errors.push(`Test ${this.name} failed at row ${i + 1}: ${err.message}`);
      }
      return {
        row: i + 1,
        description: null,
        input,
        expected: expectedValue,
        actual: actualValue,
        passed: !errors.length,
        messages: errors,
      };
    });
  }

  toJSON() {
    return {
      className: this.className,
      refTableName: this.refTableName,
      name: this.name,
      paramNames: this.paramNames,
      data: this.data,
      ...(this.dataType ? { dataType: this.dataType } : {}),
      ...(this.position ? { position: this.position } : {}),
    };
  }

  fromJSON(data) {
    this.refTableName = data.refTableName;
    this.name = data.name;
    this.paramNames = data.paramNames || [];
    this.data = data.data || [];
    this.dataType = data.dataType;
    this.position = data.position;
    return this;
  }

  toRows() {
    const title = `Test ${this.refTableName} ${this.name}${this.dataType ? ` ${this.dataType}` : ''}`;
    const width = Math.max(this.paramNames.length, 1);
    return [
      Array.from({ length: width }, (_, i) => ({ value: i ? null : title, style: 'title' })),
      this.paramNames.map((value) => ({ value, style: 'header' })),
      ...this.data.map((row) => row.map((value) => ({ value, style: 'value' }))),
    ];
  }
}

export { TestTable };

// Run tables (OpenL Tablets): a table run with the arguments of each row, nothing expected (results() gives what each
// row returns or the error it fails with).
//
//   Run Premium PremiumRuns
//   driver.age | driver.state      <- arguments, or paths in them
//   Age        | State             <- titles
//   20         | CA
class RunTable extends TestTable {
  static kind = 'Run';

  get className() {
    return 'RunTable';
  }

  build(block) {
    super.build(block);
    // (Always of OpenL: a row of titles.)
    this.openl = true;
    this.titles = (block.rows[2] || []).map(text);
    this.data = block.rows.slice(3);
    return this;
  }

  // Nothing is expected: a row fails only when the table fails.
  run() {
    return [];
  }

  fromJSON(data) {
    super.fromJSON(data);
    this.openl = true;
    return this;
  }

  toRows() {
    const rows = super.toRows();
    rows[0][0] = { value: `Run ${this.refTableName} ${this.name}`, style: 'title' };
    rows.splice(
      2,
      0,
      (this.titles || this.paramNames).map((value) => ({ value, style: 'header' }))
    );
    return rows;
  }
}

export { RunTable };
