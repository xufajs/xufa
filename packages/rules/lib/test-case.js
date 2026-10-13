// A row of a Test table of a call as it goes now (what a test of it would be): its columns (the arguments, a column for
// each field of those that are objects, _context_ fields of the runtime context, and _res_, a column for each field of
// a result that is an object, or _error_ of a call that fails), their titles, and the cells of the row.
import { RulesError } from './values.js';
import { Decimal } from './openl/decimal.js';
import { JavaTime } from './openl/time.js';

// (Fields of objects deeper than this, and lists longer: not written.)
const DEPTH = 4;
const ITEMS = 50;

const isRecord = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !(value instanceof Date) &&
  !(value instanceof JavaTime) &&
  !(value instanceof Decimal) &&
  !Array.isArray(value);

// A value as a cell writes it: dates as days (or ISO times), java.time and decimals as their texts, lists of values
// separated by commas.
function cellOf(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) {
    const iso = value.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
  }
  if (value instanceof JavaTime) return value.toJava();
  if (value instanceof Decimal) return value.toString();
  if (typeof value === 'bigint') return String(value);
  // (NaN and the infinities as their texts: JSON has none.)
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  // (Commas of the values as , and empty values as nothing: 1, , 3.)
  if (Array.isArray(value)) return value.map((item) => String(cellOf(item) ?? '').replace(/,/g, '\\,')).join(', ');
  return String(value);
}

const plainList = (value) => Array.isArray(value) && value.every((item) => !isRecord(item) && !Array.isArray(item));

// The columns of a value under a name: itself, or a column for each field of an object (name.field), and of each
// object of a list (name[0].field).
function columnsOf(name, value, columns, depth = 0) {
  if (depth > DEPTH) return;
  if (isRecord(value)) {
    for (const [key, field] of Object.entries(value)) {
      if (typeof field === 'function' || field === undefined) continue;
      columnsOf(`${name}.${key}`, field, columns, depth + 1);
    }
    return;
  }
  if (Array.isArray(value) && !plainList(value)) {
    value.slice(0, ITEMS).forEach((item, i) => columnsOf(`${name}[${i}]`, item, columns, depth + 1));
    return;
  }
  columns.push([name, cellOf(value)]);
}

// The parameters of a table: { name, type } each (of its first version, for versions).
function paramsOf(book, name) {
  const table = book.versions?.get(name)?.[0] ?? book.table(name);
  if (!table || typeof table.call !== 'function') {
    throw new RulesError(`No table ${name} to run`, 'XUFA_RULES_ERR_NOT_FOUND');
  }
  const types = Array.isArray(table.paramTypes) ? table.paramTypes : [];
  return (table.params ?? []).map((param, i) =>
    typeof param === 'string' ? { name: param, type: types[i] ?? null } : { name: param.name, type: param.type ?? null }
  );
}

// { title, names, titles, cells, result, error } of a call: title the first cell of a new Test table of it (named
// testName, or one no table of the book has).
function testCaseOf(book, name, args = [], { context, testName } = {}) {
  const params = paramsOf(book, name);
  const columns = [];
  params.forEach((param, i) => columnsOf(param.name, args[i] ?? null, columns));
  const runtime = context && typeof context === 'object' ? context : null;
  for (const [key, value] of Object.entries(runtime ?? {})) columns.push([`_context_.${key}`, cellOf(value)]);
  let result;
  let error = null;
  try {
    result = runtime ? book.withContext(runtime).call(name, ...args) : book.call(name, ...args);
  } catch (err) {
    error = String(err.message ?? err);
  }
  if (error !== null) columns.push(['_error_', error]);
  else if (isRecord(result) || (Array.isArray(result) && !plainList(result))) {
    const fields = [];
    columnsOf('_res_', result, fields);
    // (An object of no fields: its text.)
    columns.push(...(fields.length ? fields : [['_res_', cellOf(result)]]));
  } else columns.push(['_res_', cellOf(result)]);
  const names = columns.map(([column]) => column);
  // (A name no table of the book has: DiscountTest, DiscountTest2...)
  let free = testName ?? `${name}Test`;
  const taken = new Set(book.tables.map((table) => table && !Array.isArray(table) && table.name));
  for (let n = 2; !testName && taken.has(free); n += 1) free = `${name}Test${n}`;
  return {
    title: `Test ${name} ${free}`,
    names,
    titles: names.map((column) =>
      column === '_res_' ? 'Expected' : column === '_error_' ? 'Error' : column.replace(/^_res_\./, 'Expected ')
    ),
    cells: columns.map(([, cell]) => cell),
    result: result === undefined ? null : result,
    error,
  };
}

export { testCaseOf };
