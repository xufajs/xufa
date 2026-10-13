// Rules tables (decision tables): the result of the parameters' values is the cell of the rows and columns whose
// conditions they meet.
//
//   Rules String Discount(String plan, Integer age)        <- title: type of the result, name, parameters
//   C1      | HC1     | RET                                <- positions: C<n> a column of conditions (one a row),
//   plan    | age     | RET * 1                               HC<n> a row of conditions (one a column); RET the result
//   String  | IntRange| Float                              <- types of the conditions, and of the result
//           | <18     | [18..65)  | >=65                   <- conditions of each HC parameter (a row each)
//   basic   | 0       | 0.05      | 0.1                    <- conditions of the C parameters, then the results
//   premium | 0.1     | 0.15      | 0.2
//
// Conditions: a value (texts compared without accents), <, <=, >, >=, ranges [a..b) (IntRange, FloatRange...), and
// empty (any value). A result cell =expression is computed (with the book's names and the parameters). RET's name cell
// can be a script of the result (RET). Multi tables give every result that matches; Nested parameters (declared in
// the header only) make the result an object, their conditions the keys of the path of each matching cell.
import {
  RulesError,
  toValue,
  isNumber,
  compileCondition,
  testOf,
  conditionText,
  sampleOf,
  paramsOfTitle,
  normalize,
} from '../values.js';

const text = (value) => (value === null || value === undefined ? '' : String(value).trim());

function positionOf(value) {
  const position = text(value);
  if (position.startsWith('HC')) return { type: 'row', index: parseInt(position.slice(2), 10) };
  if (position.startsWith('C')) return { type: 'column', index: parseInt(position.slice(1), 10) };
  return null;
}

class RulesTable {
  static kind = 'Rules';

  constructor(book, multi = false) {
    this.book = book;
    this.isMulti = multi;
  }

  get className() {
    return 'RulesTable';
  }

  build(block) {
    const { rows } = block;
    this.position = block.position;
    const title = text(rows[0][0]);
    const head = title
      .slice(0, title.indexOf('(') === -1 ? title.length : title.indexOf('('))
      .trim()
      .split(/\s+/);
    if (head.length === 2) [, this.name] = head;
    else [, this.type, this.name] = head;
    this.type ??= 'any';
    if (!this.name) throw new RulesError(`A rules table needs a name: "${title}"`);
    this.params = paramsOfTitle(title).map((param, index) => ({ ...param, index }));
    this.columnParams = [];
    this.rowParams = [];
    const byName = new Map(this.params.map((param) => [param.name, param]));
    const [positions = [], names = [], types = []] = rows.slice(1, 4);
    for (let i = 0; i < positions.length; i += 1) {
      const mark = text(positions[i]);
      if (!mark) continue;
      if (mark.startsWith('RET')) {
        this.returnParam = {
          name: 'RET',
          type: text(types[i]) || 'any',
          script: names[i] === null ? null : text(names[i]) || null,
        };
        continue;
      }
      const name = text(names[i]);
      const type = text(types[i]);
      if (!name) {
        this.resultType = type;
        continue;
      }
      let param = byName.get(name);
      if (!param) {
        if (type !== 'Nested') throw new RulesError(`Param not found: ${name} at Rule ${this.name}`);
        param = { name, type: 'Nested', index: this.params.length };
        this.params.push(param);
        byName.set(name, param);
      }
      param.position = positionOf(mark);
      param.positionType = type;
      (param.position.type === 'column' ? this.columnParams : this.rowParams).push(param);
    }
    this.returnParam ??= { name: 'RET', type: 'any', script: null };
    this.columnParams.sort((a, b) => a.position.index - b.position.index);
    this.rowParams.sort((a, b) => a.position.index - b.position.index);
    let line = 4;
    for (const param of this.rowParams) {
      param.headers = (rows[line] || [])
        .slice(this.columnParams.length)
        .map((cell) => compileCondition(param.positionType, cell));
      line += 1;
    }
    for (const [i, param] of this.columnParams.entries()) {
      param.headers = rows.slice(line).map((row) => compileCondition(param.positionType, row[i]));
    }
    this.matrix = rows.slice(line).map((row) => row.slice(this.columnParams.length));
    // (Multi tables give every result of a combination: it can be in several rows.)
    if (!this.isMulti) {
      this.checkCombinations(this.columnParams);
      this.checkCombinations(this.rowParams);
    }
    this.checkValues();
    return this;
  }

  checkCombinations(params) {
    const plain = params.filter((param) => param.type !== 'Nested');
    if (!plain.length) return;
    const nested = plain.length !== params.length;
    const seen = new Set();
    let last;
    for (let i = 0; i < plain[0].headers.length; i += 1) {
      const key = plain.map((param) => JSON.stringify(param.headers[i])).join('');
      if (seen.has(key) && !(nested && last === key)) {
        throw new RulesError(
          `Duplicated combination at table ${this.name} (variables: ${plain.map((param) => param.name).join(', ')})`
        );
      }
      seen.add(key);
      last = key;
    }
  }

  checkValues() {
    if (this.type !== 'Double' && this.type !== 'Float') return;
    const bad = this.matrix
      .flat()
      .find((value) => value !== null && value !== '' && (!isNumber(value) || String(value).includes(',')));
    if (bad !== undefined) throw new RulesError(`Table ${this.name} contains an invalid Double/Float value`);
  }

  // Compiled once: the tests of the conditions, and the expressions of the cells (as they are first used).
  prepare() {
    if (this.prepared) return;
    this.paramsByName = Object.fromEntries(this.params.map((param) => [param.name, param]));
    this.tests = new Map();
    for (const param of [...this.columnParams, ...this.rowParams])
      this.tests.set(param, (param.headers || []).map(testOf));
    this.cells = new Map();
    this.retScript = this.returnParam?.script
      ? this.book.compileFor(this, this.returnParam.script, `Table ${this.name}, script of RET`)
      : null;
    this.isNested = this.params.some((param) => param.type === 'Nested');
    // The conditions to meet in each direction (Nested parameters have none).
    this.columnTests = this.columnParams
      .filter((param) => param.type !== 'Nested')
      .map((param) => [param.name, this.tests.get(param)]);
    this.rowTests = this.rowParams
      .filter((param) => param.type !== 'Nested')
      .map((param) => [param.name, this.tests.get(param)]);
    this.prepared = true;
  }

  // The first index whose conditions the values meet (-1 none; 0 when there are no conditions that way).
  static first(params, tests, values) {
    if (!params.length) return 0;
    const count = params[0].headers.length;
    for (let i = 0; i < count; i += 1) {
      let ok = true;
      for (let t = 0; t < tests.length; t += 1) {
        const [name, conditions] = tests[t];
        if (!conditions[i](values[name])) {
          ok = false;
          break;
        }
      }
      if (ok) return i;
    }
    return -1;
  }

  matching(params, values) {
    if (!params.length) return [0];
    const count = params[0].headers.length;
    let indexes = Array.from({ length: count }, (_, i) => i);
    for (const param of params) {
      if (param.type === 'Nested') continue;
      const tests = this.tests.get(param);
      const value = values[param.name];
      indexes = indexes.filter((i) => tests[i](value));
      if (!indexes.length) break;
    }
    return indexes;
  }

  // (context: the values of the parameters, or a function that makes the context of the book with them.)
  value(row, column, context) {
    let value = this.matrix[row]?.[column] ?? '';
    if (typeof value === 'string' && value.trim().startsWith('=')) {
      if (typeof context === 'function') context = context();
      const key = row * 65536 + column;
      let run = this.cells.get(key);
      if (!run) {
        run = this.book.compileFor(this, value.trim().slice(1), `Table ${this.name}, cell [${row},${column}]`);
        this.cells.set(key, run);
      }
      value = run(context);
    }
    try {
      return toValue(this.returnParam.type, value);
    } catch (err) {
      throw new RulesError(`Error getting value at [${row},${column}] of ${this.name}: ${err.message}`, err.code);
    }
  }

  result(row, column, context) {
    const value = this.value(row, column, context);
    if (!this.retScript) return value;
    const retContext = Object.create(typeof context === 'function' ? context() : context);
    retContext.RET = value;
    return this.retScript(retContext);
  }

  nested(rows, columns, context) {
    const nested = this.params.filter((param) => param.type === 'Nested').sort((a, b) => a.index - b.index);
    const result = {};
    for (const row of rows) {
      for (const column of columns) {
        const path = nested.map((param) =>
          normalize(param.headers[param.position.type === 'row' ? column : row]?.value ?? '')
        );
        if (!path.length) continue;
        let node = result;
        for (const key of path.slice(0, -1)) node = node[key] ??= {};
        node[path[path.length - 1]] = this.value(row, column, context);
      }
    }
    return result;
  }

  // The result of the values of the parameters, by name.
  run(values) {
    this.prepare();
    // The context of the book is made only for a cell =expression or a script of RET, once.
    let made = null;
    const context = () => (made ??= this.book.contextWith(values));
    if (!this.isMulti && !this.isNested) {
      const row = RulesTable.first(this.columnParams, this.columnTests, values);
      const column = row === -1 ? -1 : RulesTable.first(this.rowParams, this.rowTests, values);
      if (row === -1 || column === -1) return undefined;
      if (this.book.tracer) this.book.noteMatch([this.sheetCell(row, column)]);
      return this.result(row, column, context);
    }
    const rows = this.matching(this.columnParams, values);
    const columns = this.matching(this.rowParams, values);
    if (this.isMulti) {
      const results = new Set();
      for (const row of rows) for (const column of columns) results.add(this.result(row, column, context));
      if (this.book.tracer)
        this.book.noteMatch(rows.flatMap((row) => columns.map((column) => this.sheetCell(row, column))));
      return [...results];
    }
    return this.nested(rows, columns, context);
  }

  // The cell of the sheet of a cell of the matrix (for traces): below the title, its properties, the 3 rows of the
  // header and the HC rows; right of the C columns.
  sheetCell(row, column) {
    const { position } = this;
    const properties = this.ownProperties ? Object.keys(this.ownProperties).length : 0;
    return {
      sheet: position?.sheet ?? null,
      row: (position?.row ?? 0) + 1 + properties + 3 + this.rowParams.length + row,
      column: (position?.column ?? 0) + this.columnParams.length + column,
    };
  }

  call(...args) {
    const values = Object.create(null);
    this.params.forEach((param, i) => {
      if (param.type !== 'Nested') values[param.name] = args[param.index ?? i];
    });
    return this.run(values);
  }

  // Every combination of a value of each condition (the cases a Check table checks).
  combinations() {
    const lists = this.params
      .filter((param) => param.type !== 'Nested')
      .map((param) => {
        const seen = new Map();
        for (const header of param.headers || []) seen.set(JSON.stringify(header), header);
        return [...seen.values()].flatMap(sampleOf);
      });
    if (!lists.length) return [];
    return lists.reduce(
      (all, list) => all.flatMap((combination) => list.map((value) => [...combination, value])),
      [[]]
    );
  }

  // The messages of the expressions that do not compile (=cells, the script of RET).
  validate() {
    const errors = [];
    const tryCompile = (source, where) => {
      try {
        this.book.compileFor(this, source, where);
      } catch (err) {
        errors.push(err.message);
      }
    };
    if (this.returnParam?.script) tryCompile(this.returnParam.script, `Table ${this.name}, script of RET`);
    this.matrix.forEach((line, r) =>
      line.forEach((value, c) => {
        if (typeof value === 'string' && value.trim().startsWith('='))
          tryCompile(value.trim().slice(1), `Table ${this.name}, cell [${r},${c}]`);
      })
    );
    return errors;
  }

  // The results of every combination, flat, the values at a route of them (a.b, * for every key), lines split.
  allResults(route = '') {
    let values = this.combinations().map((combination) => this.call(...combination));
    for (const step of route ? route.split('.') : []) {
      values = values.flatMap((value) => {
        if (value === null || value === undefined) return [];
        if (step === '*') return Object.values(value);
        return value[step] === undefined ? [] : [value[step]];
      });
    }
    return values
      .flat()
      .flatMap((value) => (typeof value === 'string' ? value.split('\n') : [value]))
      .filter((value) => value !== null && value !== undefined && value !== '');
  }

  toJSON() {
    const strip = ({ index, name, type, position, positionType, headers }) => ({
      name,
      type,
      index,
      position,
      positionType,
      headers,
    });
    return {
      className: this.className,
      isMulti: this.isMulti,
      name: this.name,
      type: this.type,
      resultType: this.resultType,
      params: this.params.map(strip),
      columnParams: this.columnParams.map(strip),
      rowParams: this.rowParams.map(strip),
      matrix: this.matrix,
      returnParam: this.returnParam,
      ...(this.position ? { position: this.position } : {}),
    };
  }

  fromJSON(data) {
    this.isMulti = Boolean(data.isMulti);
    this.name = data.name;
    this.type = data.type;
    this.resultType = data.resultType;
    this.params = data.params.map((param) => ({ ...param }));
    const byName = new Map(this.params.map((param) => [param.name, param]));
    // (The same objects as in params, as when built from cells.)
    this.columnParams = (data.columnParams || []).map((param) => Object.assign(byName.get(param.name), param));
    this.rowParams = (data.rowParams || []).map((param) => Object.assign(byName.get(param.name), param));
    this.matrix = data.matrix;
    this.returnParam = data.returnParam || { name: 'RET', type: 'any', script: null };
    this.position = data.position;
    return this;
  }

  // The cells of the table, as build reads them.
  toRows() {
    const params = this.params
      .map((param) => `${param.type} ${param.name}`)
      .filter((_, i) => this.params[i].type !== 'Nested');
    const kind = this.isMulti ? 'Multi' : 'Rules';
    const title = `${kind} ${this.type && this.type !== 'any' ? `${this.type} ` : ''}${this.name}(${params.join(', ')})`;
    const ordered = [...this.columnParams, ...this.rowParams];
    const width = Math.max(
      ordered.length + 1,
      this.columnParams.length + (this.matrix[0]?.length ?? this.rowParams[0]?.headers.length ?? 1)
    );
    const pad = (cells, style) => Array.from({ length: width }, (_, i) => ({ value: cells[i] ?? null, style }));
    const rows = [pad([title], 'title')];
    rows.push(
      pad(
        [...ordered.map((param) => `${param.position.type === 'row' ? 'HC' : 'C'}${param.position.index}`), 'RET'],
        'header'
      )
    );
    rows.push(pad([...ordered.map((param) => param.name), this.returnParam.script ?? null], 'header'));
    rows.push(pad([...ordered.map((param) => param.positionType), this.returnParam.type], 'header'));
    for (const param of this.rowParams) {
      rows.push(pad([...this.columnParams.map(() => null), ...param.headers.map(conditionText)], 'header'));
    }
    this.matrix.forEach((line, r) => {
      const conditions = this.columnParams.map((param) => conditionText(param.headers[r]));
      rows.push([
        ...conditions.map((value) => ({ value, style: 'header' })),
        ...line.map((value) => ({ value, style: 'value' })),
      ]);
    });
    return rows;
  }
}

export { RulesTable };
