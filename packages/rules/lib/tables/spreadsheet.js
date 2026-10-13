// Spreadsheet tables: steps computed in order into an object, the result.
//
//   Spreadsheet Quote Calculate(Customer customer)
//   Step        | Formula
//   base        | = BasePremium(customer.plan, customer.age)       <- result.base; later steps read it as $base
//   discount    | = Discount(customer.plan, customer.age)
//   total       | = $base * (1 - $discount)
//   total       | += Surcharge(customer.region)                    <- += -= *= /= %= on the step's value
//   this.notes  | = ["checked"]                                    <- a path in the result (also .notes)
//               | delete $discount                                 <- a value out of the result
//               | return { total: $total }                         <- the result itself
//
// A step that gives undefined adds a message to result.errors (its formula seems to be wrong), as the engine this one
// follows does; a step that fails is left (and told to the book's onError).
import { paramsOfTitle, RulesError, toValue } from '../values.js';
import { valueOfType } from '../typed.js';
import { typeOfOpenL } from '../openl/lower.js';

// The types of results of one value: a spreadsheet of one of them gives its RETURN row, or its last value.
const SCALAR = new Set([
  'string',
  'integer',
  'int',
  'long',
  'double',
  'float',
  'number',
  'boolean',
  'date',
  'bigdecimal',
]);

// "total : Double" -> { name: 'total', type: 'Double' }.
// "Name : Type" -> { name, type }; the marks of OpenL's output (Total*, Hidden~) are not of the name.
function nameAndType(cell) {
  const [name, type] = text(cell).split(/\s*:\s*/);
  return { name: name.replace(/[*~]+$/, '').trim(), type: type || null };
}

// A cell that is a formula: = expression, or {expression} (in books of OpenL).
function formulaText(value, openl) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.startsWith('=')) return trimmed;
  if (openl && trimmed.startsWith('{') && trimmed.endsWith('}') && trimmed.length > 2)
    return `= ${trimmed.slice(1, -1)}`;
  return null;
}

const OPERATOR = /^\s*(=|\+=|-=|\*=|\/=|%=)\s*([\s\S]*)$/;
const APPLY = {
  '=': (_, value) => value,
  '+=': (current, value) => (current ?? 0) + value,
  '-=': (current, value) => (current ?? 0) - value,
  '*=': (current, value) => (current ?? 0) * value,
  '/=': (current, value) => (current ?? 0) / value,
  '%=': (current, value) => (current ?? 0) % value,
};

const text = (value) => (value === null || value === undefined ? '' : String(value).trim());

function setPath(target, path, value) {
  let node = target;
  for (const key of path.slice(0, -1)) {
    if (node[key] === null || typeof node[key] !== 'object') node[key] = {};
    node = node[key];
  }
  node[path[path.length - 1]] = value;
}

const getPath = (target, path) =>
  path.reduce((node, key) => (node === null || node === undefined ? undefined : node[key]), target);

// The script that the engine this one follows keeps of a step, and back: name "x" "$x = expr", name "this" "$this =
// expr", names "this.a.b" or ".a.b" "a.b = expr", no name the formula as it is.
function scriptOf(name, formula) {
  if (!name) return formula;
  if (name === 'this') return `$this ${formula}`;
  if (name.startsWith('this.')) return `${name.slice(5)} ${formula}`;
  if (name.startsWith('.')) return `${name.slice(1)} ${formula}`;
  return `$${name} ${formula}`;
}

function formulaOf(name, script) {
  if (!name) return script;
  const prefix =
    name === 'this'
      ? '$this'
      : name.startsWith('this.')
        ? name.slice(5)
        : name.startsWith('.')
          ? name.slice(1)
          : `$${name}`;
  return script.startsWith(prefix) ? script.slice(prefix.length).trimStart() : script;
}

class SpreadsheetTable {
  static kind = 'Spreadsheet';

  constructor(book) {
    this.book = book;
  }

  get className() {
    return 'SpreadsheetTable';
  }

  build(block) {
    const { rows } = block;
    this.position = block.position;
    const title = text(rows[0][0]);
    // "Spreadsheet SpreadsheetResult Calculate (Person person)": the name is the third word.
    const words = title.split(/[\s(]+/);
    this.name = words[2];
    this.resultType = words[1];
    if (!this.name) throw new RulesError(`A spreadsheet table needs a type and a name: "${title}"`);
    this.params = paramsOfTitle(title);
    // More than one column of values: a grid of OpenL Tablets (cells computed as they are asked for, $Column$Row).
    // (//Column: a column of descriptions of another, not a column of values.)
    // (A header merged across columns is one column: the cells it covers after the first are not.)
    const covered = new Set();
    for (const merge of block.merges ?? []) {
      if (merge.top <= 1 && merge.bottom >= 1 && merge.right > merge.left) {
        for (let c = merge.left + 1; c <= merge.right; c += 1) covered.add(c);
      }
    }
    const kept = (rows[1] || [])
      .slice(1)
      .map((cell, i) => (text(cell).startsWith('//') || covered.has(i + 1) ? -1 : i))
      .filter((i) => i !== -1);
    if (kept.filter((i) => text(rows[1][i + 1]) !== '').length > 1) {
      const openl = (this.dialect ?? this.book.dialect) === 'openl';
      this.grid = {
        columns: kept.map((i) => nameAndType(rows[1][i + 1])),
        rows: rows.slice(2).map((row) => ({
          ...nameAndType(row[0]),
          cells: kept.map((i) => {
            const value = row[i + 1] ?? null;
            return openl ? (formulaText(value, true) ?? value) : value;
          }),
        })),
      };
      this.lines = [];
      return this;
    }
    this.grid = null;
    // (The row of each step under the header, for the checks of the book: not in its JSON.)
    this.lineRows = [];
    const openl = (this.dialect ?? this.book.dialect) === 'openl';
    // (The name of the column of the values: $Value$Step.)
    this.valueColumn = openl ? nameAndType(rows[1]?.[1]).name || null : null;
    this.lines = rows.slice(2).flatMap((row, r) => {
      // Name : Type (in books of OpenL): the type of the value of the step.
      const { name, type } = openl ? nameAndType(row[0]) : { name: text(row[0]), type: null };
      let formula = text(row[1]);
      if (openl) formula = formulaText(formula, true) ?? formula;
      if (!name && !formula) return [];
      this.lineRows.push(r);
      if (!name && formula.startsWith('return '))
        return [{ name: 'this', script: scriptOf('this', `= ${formula.slice(7)}`) }];
      // (In books of OpenL an empty step is the default of its type; one that is no formula is a value: 3, a text.)
      if (openl && name && formula === '')
        formula = `= ${type && /^(int|long|short|byte|double|float)$/.test(type) ? 0 : type === 'boolean' ? false : 'null'}`;
      if (openl && formula && !OPERATOR.test(formula) && !/^delete\s/.test(formula)) {
        // (A name of a constant: the constant, when the book has it.)
        formula = /^[A-Za-z_]\w*$/.test(formula)
          ? `= __constant(${JSON.stringify(formula)})`
          : `= ${typeof row[1] === 'number' || typeof row[1] === 'boolean' ? row[1] : JSON.stringify(String(row[1]))}`;
      }
      return [{ name, script: scriptOf(name, formula), ...(type ? { type } : {}) }];
    });
    return this;
  }

  // A formula of a step or cell, in the language of the book: the types of the parameters (and of the typed rows and
  // columns of a grid) known, and the names of steps with spaces ($Exchange Rate).
  compileCell(source, where) {
    if (!this.cellTypes) {
      this.cellTypes = {};
      for (const param of this.params) if (param.type && param.type !== 'any') this.cellTypes[param.name] = param.type;
      const names = this.grid
        ? [...this.grid.rows, ...this.grid.columns].map((entry) => entry.name).filter(Boolean)
        : this.lines.map((line) => line.name).filter(Boolean);
      if (this.grid) {
        for (const entry of [...this.grid.rows, ...this.grid.columns])
          if (entry.name && entry.type) this.cellTypes[`$${entry.name}`] = entry.type;
      }
      this.cellNames = names;
    }
    return this.book.compileFor(this, source, where, { types: this.cellTypes, names: this.cellNames });
  }

  prepare() {
    if (this.steps) return;
    this.steps = this.lines.map(({ name, script, type }, i) => {
      const where = `Spreadsheet ${this.name}, step ${i + 1}${name ? ` (${name})` : ''}`;
      const formula = formulaOf(name, script);
      if (/^delete\s/.test(formula)) {
        const target = formula.slice(7).trim().replace(/^\$/, '');
        return { kind: 'delete', path: target.split('.'), where };
      }
      const match = OPERATOR.exec(formula);
      if (!match) return { kind: 'invalid', where, name, formula };
      const [, operator, source] = match;
      let run;
      try {
        run = this.compileCell(source, where);
        // The static type of the step (declared, or of its formula), for the steps after it.
        if (name && name !== 'this' && (this.dialect ?? this.book.dialect) === 'openl') {
          const type =
            this.lines[i].type ??
            typeOfOpenL(source, { book: this.book, types: this.cellTypes, names: this.cellNames });
          if (type) {
            this.cellTypes[`$${name}`] = type;
            if (this.valueColumn) this.cellTypes[`$${this.valueColumn}$${name}`] = type;
          }
        }
      } catch (err) {
        // (Left when it runs, and told to onError, as a step that fails; book.test() says it.)
        return { kind: 'broken', where, error: err };
      }
      if (name === 'this') return { kind: 'this', apply: APPLY[operator], run, where };
      if (name.startsWith('this.') || name.startsWith('.')) {
        return {
          kind: 'path',
          path: name
            .replace(/^this\./, '')
            .replace(/^\./, '')
            .split('.'),
          apply: APPLY[operator],
          run,
          where,
        };
      }
      return { kind: 'step', name, apply: APPLY[operator], run, where, type };
    });
  }

  // The value a spreadsheet of a scalar type gives: its RETURN row, or its last value.
  typedResult(result) {
    // (Of a datatype: an object of it, its fields the steps of their names, TotalAssets for totalAssets.)
    const datatype = this.resultType ? this.book.table?.(this.resultType) : null;
    if (datatype?.className === 'DatatypeTable' && result !== null && typeof result === 'object') {
      const keys = Object.keys(result);
      const object = {};
      for (const field of Object.keys(datatype.params)) {
        const key = keys.find((name) => name.toLowerCase() === field.toLowerCase());
        if (key === undefined) continue;
        let value = result[key];
        if (value !== null && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) {
          const inner = Object.values(value).filter((item) => item !== null && item !== undefined && item !== '');
          if (inner.length) value = inner[inner.length - 1];
        }
        object[field] = value;
      }
      return datatype.withDefaults(object);
    }
    const type = String(this.resultType || '').toLowerCase();
    if (!SCALAR.has(type) || result === null || typeof result !== 'object') return result;
    const keys = Object.keys(result).filter((key) => key !== 'errors');
    const key = keys.find((name) => name.toUpperCase() === 'RETURN') ?? keys[keys.length - 1];
    let value = result[key];
    if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
      // (Its last value that is one: a column of notes after it is no result.)
      const inner = Object.values(value).filter((item) => item !== null && item !== undefined && item !== '');
      value = inner[inner.length - 1];
    }
    return value === undefined || value === null ? value : toValue(this.resultType, value);
  }

  // A grid: each cell computed when it is asked for (by a formula, or for the result), once; $Row and $Column are the
  // cells of the same column and row, $Column$Row any cell, $First:$Last the values between two rows (or columns).
  runGrid(values) {
    const { columns, rows } = this.grid;
    const openl = (this.dialect ?? this.book.dialect) === 'openl';
    const base = this.book.contextWith(values);
    const cache = new Map();
    const computing = new Set();
    const rowIndex = new Map(rows.map((row, i) => [row.name, i]));
    const columnIndex = new Map(columns.map((column, i) => [column.name, i]));
    const where = (r, c) => `Spreadsheet ${this.name}, $${columns[c]?.name}$${rows[r]?.name}`;
    const compiled = this.compiledCells ?? (this.compiledCells = new Map());
    const cell = (r, c) => {
      const key = r * 4096 + c;
      if (cache.has(key)) return cache.get(key);
      if (computing.has(key)) throw new RulesError(`${where(r, c)}: refers to itself (a cycle)`, 'XUFA_RULES_ERR_RULE');
      computing.add(key);
      // (A cell that fails is no longer being computed: a later read is no cycle.)
      try {
        let value = rows[r].cells[c];
        if (typeof value === 'string' && value.trim().startsWith('=')) {
          let run = compiled.get(key);
          if (!run) {
            // (Ranges: OpenL's language reads them, $A$Row:$B$Row too; JavaScript's needs a call.)
            const source = openl
              ? value.trim().slice(1)
              : value
                  .trim()
                  .slice(1)
                  .replace(/\$(\w+):\$(\w+)/g, '$range("$1", "$2")');
            run = this.compileCell(source, where(r, c));
            compiled.set(key, run);
          }
          value = run(contextOf(r, c));
        }
        const type = columns[c]?.type || rows[r].type;
        if (type && value !== null && value !== undefined && value !== '') {
          value = openl ? (valueOfType(value, type) ?? value) : toValue(type, value);
        }
        cache.set(key, value);
        return value;
      } finally {
        computing.delete(key);
      }
    };
    // The names of a cell's formula: every $Column$Row, and $Row, $Column of its own column and row.
    const shared = Object.create(base);
    rows.forEach((row, r) =>
      columns.forEach((column, c) => {
        // (The first of cells of the same names.)
        const key = `$${column.name}$${row.name}`;
        if (!Object.hasOwn(shared, key))
          Object.defineProperty(shared, key, { get: () => cell(r, c), enumerable: false });
      })
    );
    const contextOf = (r, c) => {
      const own = Object.create(shared);
      rows.forEach((row, i) => {
        if (row.name) Object.defineProperty(own, `$${row.name}`, { get: () => cell(i, c), configurable: true });
      });
      columns.forEach((column, i) => {
        if (column.name && !rowIndex.has(column.name))
          Object.defineProperty(own, `$${column.name}`, { get: () => cell(r, i), configurable: true });
      });
      own.$range = (first, last) => {
        // $Column$Row:$Column$Row: the cells between two, in a row or a column.
        if (first.includes('$') && last.includes('$')) {
          const [c1, r1] = first.split('$');
          const [c2, r2] = last.split('$');
          if (r1 === r2 && columnIndex.has(c1) && columnIndex.has(c2) && rowIndex.has(r1)) {
            const [from, to] = [columnIndex.get(c1), columnIndex.get(c2)].sort((a, b) => a - b);
            return Array.from({ length: to - from + 1 }, (_, i) => cell(rowIndex.get(r1), from + i));
          }
          if (c1 === c2 && rowIndex.has(r1) && rowIndex.has(r2) && columnIndex.has(c1)) {
            const [from, to] = [rowIndex.get(r1), rowIndex.get(r2)].sort((a, b) => a - b);
            return Array.from({ length: to - from + 1 }, (_, i) => cell(from + i, columnIndex.get(c1)));
          }
        }
        if (rowIndex.has(first) && rowIndex.has(last)) {
          const [from, to] = [rowIndex.get(first), rowIndex.get(last)].sort((a, b) => a - b);
          return Array.from({ length: to - from + 1 }, (_, i) => cell(from + i, c));
        }
        if (columnIndex.has(first) && columnIndex.has(last)) {
          const [from, to] = [columnIndex.get(first), columnIndex.get(last)].sort((a, b) => a - b);
          return Array.from({ length: to - from + 1 }, (_, i) => cell(r, from + i));
        }
        throw new RulesError(`Spreadsheet ${this.name}: no range $${first}:$${last}`, 'XUFA_RULES_ERR_RULE');
      };
      return own;
    };
    const result = {};
    rows.forEach((row, r) => {
      if (!row.name) return;
      const line = {};
      columns.forEach((column, c) => {
        if (!column.name) return;
        try {
          line[column.name] = cell(r, c);
        } catch (err) {
          this.book.reportError(err, { table: this.name, step: where(r, c) });
          line[column.name] = undefined;
        }
      });
      result[row.name] = line;
    });
    return result;
  }

  run(values) {
    if (this.grid) return this.typedResult(this.runGrid(values));
    return this.typedResult(this.runSteps(values));
  }

  runSteps(values) {
    this.prepare();
    const context = this.book.contextWith(values);
    let result = {};
    context.$this = result;
    // $First:$Last: the values of the steps from one to another.
    context.$range = (first, last) => {
      const names = this.steps.filter((step) => step.kind === 'step').map((step) => step.name);
      const [from, to] = [names.indexOf(first), names.indexOf(last)].sort((a, b) => a - b);
      if (from === -1)
        throw new RulesError(`Spreadsheet ${this.name}: no range $${first}:$${last}`, 'XUFA_RULES_ERR_RULE');
      return names.slice(from, to + 1).map((name) => context[`$${name}`]);
    };
    for (const step of this.steps) {
      try {
        switch (step.kind) {
          case 'step': {
            let value = step.apply(context[`$${step.name}`], step.run(context));
            // (A step of a type: its value as the type says; one value of an array type, an array of it.)
            if (step.type && value !== null && value !== undefined) {
              if (step.type.endsWith('[]') && !Array.isArray(value) && typeof value !== 'string') value = [value];
              else if (typeof value === 'string' || !step.type.endsWith('[]'))
                value = valueOfType(value, step.type) ?? value;
            }
            context[`$${step.name}`] = value;
            // ($Value$Step: the step by the name of its column too.)
            if (this.valueColumn) context[`$${this.valueColumn}$${step.name}`] = value;
            result[step.name] = value;
            if (value === undefined)
              (result.errors ??= []).push(`Spreadsheet formula for "${step.name}" seems to be wrong`);
            break;
          }
          case 'this':
            result = step.apply(result, step.run(context));
            context.$this = result;
            break;
          case 'path':
            setPath(result, step.path, step.apply(getPath(result, step.path), step.run(context)));
            break;
          case 'delete': {
            const parent = getPath(result, step.path.slice(0, -1));
            if (parent && typeof parent === 'object') delete parent[step.path[step.path.length - 1]];
            break;
          }
          case 'broken':
            throw step.error;
          default:
            throw new RulesError(`${step.where}: "${step.formula}" is no formula (= expression, += ..., delete $x)`);
        }
      } catch (err) {
        this.book.reportError(err, { table: this.name, step: step.where });
      }
    }
    return result;
  }

  // The messages of the steps that do not compile or are no formula.
  validate() {
    if (this.grid) {
      const errors = [];
      this.grid.rows.forEach((row) =>
        row.cells.forEach((value, c) => {
          if (typeof value !== 'string' || !value.trim().startsWith('=')) return;
          try {
            this.compileCell(
              value
                .trim()
                .slice(1)
                .replace(/\$(\w+):\$(\w+)/g, '$range("$1", "$2")'),
              `Spreadsheet ${this.name}, $${this.grid.columns[c]?.name}$${row.name}`
            );
          } catch (err) {
            errors.push(err.message);
          }
        })
      );
      return errors;
    }
    this.prepare();
    return this.steps.flatMap((step) => {
      if (step.kind === 'broken') return [step.error.message];
      if (step.kind === 'invalid')
        return [`${step.where}: "${step.formula}" is no formula (= expression, += ..., delete $x)`];
      return [];
    });
  }

  call(...args) {
    const values = Object.create(null);
    this.params.forEach((param, i) => {
      values[param.name] = args[i];
    });
    return this.run(values);
  }

  toJSON() {
    return {
      className: this.className,
      name: this.name,
      params: this.params,
      lines: this.lines,
      ...(this.grid ? { grid: this.grid } : {}),
      ...(this.resultType ? { resultType: this.resultType } : {}),
      ...(this.position ? { position: this.position } : {}),
    };
  }

  fromJSON(data) {
    this.name = data.name;
    this.params = data.params || [];
    this.lines = data.lines || [];
    this.grid = data.grid || null;
    this.resultType = data.resultType;
    this.position = data.position;
    return this;
  }

  toRows() {
    const params = this.params.map((param) =>
      param.type && param.type !== 'any' ? `${param.type} ${param.name}` : param.name
    );
    const title = `Spreadsheet ${this.resultType || 'SpreadsheetResult'} ${this.name}(${params.join(', ')})`;
    const named = ({ name, type }) => (type ? `${name} : ${type}` : name);
    if (this.grid) {
      const { columns, rows: lines } = this.grid;
      return [
        [{ value: title, style: 'title' }, ...columns.map(() => ({ value: null, style: 'title' }))],
        [
          { value: 'Step', style: 'header' },
          ...columns.map((column) => ({ value: named(column) || null, style: 'header' })),
        ],
        ...lines.map((line) => [
          { value: named(line) || null, style: 'header' },
          ...columns.map((_, c) => ({ value: line.cells[c] ?? null, style: 'value' })),
        ]),
      ];
    }
    const rows = [
      [
        { value: title, style: 'title' },
        { value: null, style: 'title' },
      ],
      [
        { value: 'Step', style: 'header' },
        { value: 'Formula', style: 'header' },
      ],
    ];
    for (const { name, script } of this.lines) {
      rows.push([
        { value: name || null, style: 'value' },
        { value: formulaOf(name, script), style: 'value' },
      ]);
    }
    return rows;
  }
}

export { SpreadsheetTable, formulaOf, OPERATOR };
