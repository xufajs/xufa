// The checks of the formulas of a book (what its tests do not tell): names that nothing defines (expressions are
// lenient, so a typo is undefined, not an error), steps read before they are computed, members that helpers and
// globals do not have (Fun.meen), tables called with other arguments than they take, calls of what is no table
// (constants, Data), cells of a spreadsheet grid that refer to themselves through others (cycles), and, in books of
// both languages, code that both read with operations they compute differently in tables that do not say their
// language. And how much of a book its tests run: the tables and the rules that no test reaches.
import { namesOf, engine, programs } from './expressions.js';
import { parse as parseOpenL } from './openl/parser.js';
import { formulaOf, OPERATOR } from './tables/spreadsheet.js';

// The tables that have no code of their own (no language).
const NO_CODE = new Set(['DatatypeTable', 'DataTable', 'PropertiesTable', 'TestTable', 'CheckTable', 'TransformTable']);
const hasCode = (table) => Boolean(table && !Array.isArray(table) && table.dialect && !NO_CODE.has(table.className));

// The operations whose results are not the same in OpenL and in JavaScript (nulls in sums, "x" + 1.0, == of
// doubles and of values).
const DIFFERENT = new Set(['+', '-', '*', '/', '%', '==', '!=']);

// Whether both languages read a source and it has an operation they compute differently.
function differs(source) {
  let tree;
  try {
    tree = programs.parse(String(source));
    parseOpenL(String(source));
  } catch {
    return false;
  }
  const walk = (node) => {
    if (!node || typeof node !== 'object') return false;
    if (Array.isArray(node)) return node.some(walk);
    if (node.type === 'BinaryExpression' && DIFFERENT.has(node.operator)) return true;
    if (node.type === 'AssignmentExpression' && node.operator !== '=') return true;
    if (node.type === 'UpdateExpression') return true;
    return Object.keys(node).some((key) => key !== 'type' && typeof node[key] === 'object' && walk(node[key]));
  };
  return walk(tree);
}

const CALLABLE = new Set([
  'RulesTable',
  'DecisionTable',
  'SmartTable',
  'SpreadsheetTable',
  'MethodTable',
  'TransformTable',
]);
const STATEMENTS = /[;\n]|^\s*(if|for|while|const|let|var|function)\b/;

const isFormula = (cell) => typeof cell === 'string' && cell.trim().startsWith('=');
const propertiesOf = (table) => (table.ownProperties ? Object.keys(table.ownProperties).length : 0);

// How many arguments a table takes (null: any).
function arityOf(table) {
  if (table.className === 'RulesTable') return table.params.filter((param) => param.type !== 'Nested').length;
  if (table.className === 'TransformTable') return null;
  return Array.isArray(table.params) ? table.params.length : null;
}

function lintBook(book) {
  const issues = [];
  const globals = engine.globals;
  const constants = new Set();
  for (const table of book.tables) {
    if (table?.className === 'ConstantsTable') for (const param of table.params) constants.add(param.name);
  }
  const bookNames = new Set([...Object.keys(globals), ...Object.getOwnPropertyNames(book.context)]);

  // Code that both languages read, of a table that runs it in the book's language, in a book of both (whose
  // language was told by its sheets): once a table.
  const languages = new Set(book.tables.filter(hasCode).map((table) => table.dialect));
  const told = book.options.dialect && book.options.dialect !== 'auto';
  const warned = new Set();
  // The rows that say the language of a whole sheet (once for every table of it), inserted as whole rows (those under
  // them moved down): a row language | js at the end of its Properties table of scope Worksheet (when no table of the
  // sheet goes on across that row), else a new Properties table at its top. Only when no other table of the sheet would
  // run in another language than it does (those of the book's language or of Properties tables).
  const sheetFixOf = (sheet, dialect) => {
    const inSheet = (table) => table.position?.sheet === sheet;
    const changes = book.tables.some(
      (table) =>
        hasCode(table) &&
        inSheet(table) &&
        (table.languageFrom === 'book' || table.languageFrom === 'properties') &&
        table.dialect !== dialect
    );
    if (changes) return null;
    const scope = book.tables.find(
      (table) =>
        table?.className === 'PropertiesTable' && inSheet(table) && String(table.scope).toLowerCase() === 'worksheet'
    );
    if (scope?.position) {
      const { position } = scope;
      const row = position.row + (position.height ?? 1);
      const across = book.tables.some(
        (table) =>
          table &&
          !Array.isArray(table) &&
          inSheet(table) &&
          table.position.row < row &&
          table.position.row + (table.position.height ?? 1) > row
      );
      if (!across) return { sheet, row, column: position.column, rows: [['language', dialect]] };
    }
    return {
      sheet,
      row: 0,
      column: 0,
      rows: [
        ['Properties', null],
        ['scope', 'Worksheet'],
        ['language', dialect],
        [null, null],
      ],
    };
  };
  const ambiguous = (table, cell, source) => {
    if (languages.size < 2 || told || table.languageFrom !== 'book' || warned.has(table) || !differs(source)) return;
    warned.add(table);
    const language = table.dialect === 'openl' ? 'OpenL' : 'JavaScript';
    const { position } = table;
    issues.push({
      table: table.name,
      kind: table.kind ?? table.className.replace(/Table$/, ''),
      cell,
      code: 'ambiguous-language',
      name: table.name,
      message:
        `OpenL and JavaScript both read this code and compute it differently (nulls, "x" + 1.0, ==): it runs as ${language}, ` +
        `the book's language; say its language with a row properties | language | ${table.dialect}`,
      // (The row that says it, under the title of the table: for editors.)
      ...(position
        ? {
            fix: {
              sheet: position.sheet,
              row: position.row + 1,
              column: position.column,
              width: position.width ?? 1,
              cells: ['properties', 'language', table.dialect],
            },
            ...(sheetFixOf(position.sheet, table.dialect)
              ? { sheetFix: sheetFixOf(position.sheet, table.dialect) }
              : {}),
          }
        : {}),
    });
  };

  // The issues of a source: its names (those of the book, the globals and its own), calls and members.
  const check = (table, cell, source, own, extra) => {
    ambiguous(table, cell, source);
    let read;
    try {
      read = namesOf(source);
    } catch {
      return; // (A formula that does not compile: the tests of the book say it.)
    }
    const add = (code, name, message) =>
      issues.push({
        table: table.name,
        kind: table.kind ?? table.className.replace(/Table$/, ''),
        cell,
        code,
        name,
        message,
      });
    const seen = new Set();
    for (const name of read.names) {
      if (seen.has(name) || bookNames.has(name) || own.has(name)) continue;
      seen.add(name);
      const known = extra?.(name);
      if (known) add(known.code, name, known.message);
      else add('unknown-name', name, `${name} is no name of the book, its parameters or its steps`);
    }
    for (const call of read.calls) {
      if (own.has(call.name)) continue;
      const called = book.table(call.name);
      if (called && CALLABLE.has(called.className)) {
        const arity = arityOf(called);
        if (arity !== null && call.count !== null && call.count !== arity) {
          add('arity', call.name, `${call.name} takes ${arity} argument${arity === 1 ? '' : 's'}, not ${call.count}`);
        }
      } else if (called || constants.has(call.name)) {
        add(
          'not-callable',
          call.name,
          `${call.name} is no table to call (a ${called ? called.className.replace(/Table$/, '') : 'constant'})`
        );
      }
    }
    for (const { object, property } of read.members) {
      if (own.has(object)) continue;
      const target = object === 'Fun' ? globals.Fun : Object.hasOwn(globals, object) ? globals[object] : undefined;
      if (target && (typeof target === 'object' || typeof target === 'function') && !(property in target)) {
        add('unknown-member', `${object}.${property}`, `${object} has no ${property}`);
      }
    }
  };

  for (const table of book.tables) {
    if (!table || Array.isArray(table)) continue;
    const position = table.position ?? { sheet: null, row: 0, column: 0 };
    const at = (row, column) => ({ sheet: position.sheet ?? null, row, column });
    const top = position.row + 1 + propertiesOf(table);
    const params = (Array.isArray(table.params) ? table.params : []).map((param) =>
      typeof param === 'string' ? param : param.name
    );
    if (table.className === 'SpreadsheetTable' && table.grid) lintGrid(table, top, at, params, check, issues);
    else if (table.className === 'SpreadsheetTable') {
      // Steps: $name of a step before (one after it is not computed yet).
      const all = new Set(table.lines.map((line) => line.name).filter((name) => name && name !== 'this'));
      const before = new Set(['$this']);
      table.lines.forEach(({ name, script }, i) => {
        const formula = formulaOf(name, script);
        const cell = at(top + 1 + (table.lineRows?.[i] ?? i), position.column + 1);
        const own = new Set([...params, ...before]);
        const later = (read) =>
          read.startsWith('$') && all.has(read.slice(1))
            ? { code: 'not-yet', message: `${read} is read before it is computed (a step after this one)` }
            : null;
        if (/^delete\s/.test(formula)) {
          const target = formula.slice(7).trim();
          if (target.startsWith('$') && !before.has(target.split('.')[0]))
            check(table, cell, target.split('.')[0], own, later);
        } else {
          const match = OPERATOR.exec(formula);
          if (match) check(table, cell, match[2], own, later);
        }
        if (name && name !== 'this' && !name.startsWith('.') && !name.startsWith('this.')) before.add(`$${name}`);
      });
    } else if (table.className === 'MethodTable') {
      const single = /^return\s+([\s\S]*?);?\s*$/.exec(table.body);
      const source = single ? single[1] : table.body;
      // (Methods of statements: their names are not checked, their language is.)
      if (!STATEMENTS.test(source.trim())) check(table, at(top, position.column), source, new Set(params));
      else ambiguous(table, at(top, position.column), table.body);
    } else if (table.className === 'RulesTable') {
      const own = new Set(table.params.map((param) => param.name));
      table.matrix.forEach((line, r) =>
        line.forEach((value, c) => {
          if (isFormula(value)) check(table, table.sheetCell(r, c), value.trim().slice(1), own);
        })
      );
      if (table.returnParam?.script) {
        check(table, at(position.row, position.column), table.returnParam.script, new Set([...own, 'RET']));
      }
    } else if (table.className === 'SmartTable') {
      table.prepare();
      const own = new Set([...params, '$RuleId', '$Rule']);
      if (table.isLookup) {
        const across = table.horizontal.length;
        table.rows.slice(1 + across).forEach((row, r) =>
          table.columns.forEach(({ column }) => {
            if (isFormula(row[column]))
              check(table, table.sheetCell(1 + across + r, column), row[column].trim().slice(1), own);
          })
        );
      } else {
        const start = table.bodyStart ?? 2;
        table.rows.slice(start).forEach((row, r) => {
          for (const condition of table.conditions) {
            const value = row[condition.group.first];
            if (condition.expression && typeof value === 'string' && value.trim()) {
              check(table, table.sheetCell(start + r, condition.group.first), value.trim().replace(/^=/, ''), own);
            }
          }
          for (const group of table.results) {
            if (isFormula(row[group.first]))
              check(table, table.sheetCell(start + r, group.first), row[group.first].trim().slice(1), own);
          }
        });
      }
    }
  }
  return issues;
}

// A grid: its names ($Column$Row, $Row and $Column of a cell's own column and row, $range) and its cycles.
function lintGrid(table, top, at, params, check, issues) {
  const { rows, columns } = table.grid;
  const position = table.position ?? { row: 0, column: 0 };
  const full = new Map();
  rows.forEach((row, r) =>
    columns.forEach((column, c) => {
      if (row.name && column.name) full.set(`$${column.name}$${row.name}`, [r, c]);
    })
  );
  const rowIndex = new Map(rows.map((row, r) => [row.name, r]));
  const columnIndex = new Map(columns.map((column, c) => [column.name, c]));
  const cellAt = (r, c) => at(top + 1 + r, position.column + 1 + c);
  const edges = new Map();
  rows.forEach((row, r) =>
    row.cells.forEach((value, c) => {
      if (!isFormula(value)) return;
      const source = value
        .trim()
        .slice(1)
        .replace(/\$(\w+):\$(\w+)/g, '$range("$1", "$2")');
      const own = new Set([...params, '$range', ...full.keys()]);
      for (const other of rows) if (other.name) own.add(`$${other.name}`);
      for (const other of columns) if (other.name && !rowIndex.has(other.name)) own.add(`$${other.name}`);
      check(table, cellAt(r, c), source, own);
      // What it reads, for cycles.
      let read;
      try {
        read = namesOf(source);
      } catch {
        return;
      }
      const targets = [];
      for (const name of read.names) {
        if (full.has(name)) targets.push(full.get(name));
        else if (rowIndex.has(name.slice(1))) targets.push([rowIndex.get(name.slice(1)), c]);
        else if (columnIndex.has(name.slice(1))) targets.push([r, columnIndex.get(name.slice(1))]);
      }
      for (const call of read.calls) {
        if (call.name !== '$range') continue;
        const [first, last] = call.texts;
        const span = (index, a, b) => {
          const [from, to] = [index.get(a), index.get(b)].sort((x, y) => x - y);
          return Array.from({ length: to - from + 1 }, (_, i) => from + i);
        };
        if (rowIndex.has(first) && rowIndex.has(last))
          for (const i of span(rowIndex, first, last)) targets.push([i, c]);
        else if (columnIndex.has(first) && columnIndex.has(last))
          for (const i of span(columnIndex, first, last)) targets.push([r, i]);
      }
      edges.set(
        `${r},${c}`,
        targets.map(([tr, tc]) => `${tr},${tc}`)
      );
    })
  );
  // Cycles: a walk that comes back to a cell it is in (each told once, at its first cell).
  const state = new Map();
  const nameOf = (key) => {
    const [r, c] = key.split(',').map(Number);
    return `$${columns[c]?.name}$${rows[r]?.name}`;
  };
  const visit = (key, path) => {
    state.set(key, 'open');
    for (const next of edges.get(key) || []) {
      if (state.get(next) === 'open') {
        const loop = [...path.slice(path.indexOf(next)), next];
        const [r, c] = next.split(',').map(Number);
        issues.push({
          table: table.name,
          kind: 'Spreadsheet',
          cell: cellAt(r, c),
          code: 'cycle',
          name: nameOf(next),
          message: `${loop.map(nameOf).join(' → ')}: the cells refer to themselves`,
        });
      } else if (!state.has(next)) visit(next, [...path, next]);
    }
    state.set(key, 'done');
  };
  for (const key of edges.keys()) if (!state.has(key)) visit(key, [key]);
}

// The tables and rules that the tests of a book run: the tests run with a trace, each cell that gave a result and
// each table called is reached.
function coverageOf(book) {
  const root = { children: [], cells: [] };
  book.tracer = [root];
  let results;
  try {
    results = book.testResults();
  } finally {
    book.tracer = null;
  }
  const called = new Set(results.map((test) => test.table));
  const cells = [];
  const visit = (node) => {
    cells.push(...node.cells);
    for (const child of node.children) {
      called.add(child.table);
      visit(child);
    }
  };
  visit(root);
  const analyses = new Map(book.analyze().map((report) => [report.position, report]));
  const tables = [];
  for (const table of book.tables) {
    if (!table || Array.isArray(table) || !CALLABLE.has(table.className)) continue;
    const entry = {
      table: table.name,
      kind: table.kind ?? table.className.replace(/Table$/, ''),
      position: table.position ?? null,
      tested: called.has(table.name),
    };
    const report = analyses.get(table.position);
    if (report && table.position) {
      const { sheet, row, column, height = 1, width = 1 } = table.position;
      const inside = cells.filter(
        (cell) =>
          cell.sheet === sheet &&
          cell.row >= row &&
          cell.row < row + height &&
          cell.column >= column &&
          cell.column < column + width
      );
      const missed = [];
      let total = 0;
      for (const axis of report.axes) {
        for (const rule of axis.rules) {
          total += 1;
          const hit = inside.some((cell) =>
            axis.axis === 'columns' ? cell.column === rule.cell.column : cell.row === rule.cell.row
          );
          if (!hit) missed.push({ axis: axis.axis, id: rule.id, cell: rule.cell });
        }
      }
      entry.rules = { total, covered: total - missed.length, missed };
    }
    tables.push(entry);
  }
  return { tests: results.length, tables };
}

export { hasCode, lintBook, coverageOf };
