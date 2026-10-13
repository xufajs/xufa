// Decision tables of OpenL Tablets ("Rules" in their layout, or "DT"): each column says what it is, and its code.
//
//   Rules String Greeting(Integer hour)
//   C1           | C2           | RET1                    <- roles: C (conditions), HC (across), A (actions), RET
//   min <= hour  | hour <= max  | greeting + ", World!"   <- the code of each column
//   Integer min  | Integer max  | String greeting         <- the parameters its cells give (a type alone: unnamed)
//   From         | To           | Greeting                <- titles (as many rows as HC conditions, in lookups)
//   0            | 11           | Good Morning            <- a rule each row
//
// A condition whose code uses its parameters is that expression; one whose code does not is a simplified condition: the
// value of the code equal to the cell (in its list, for arrays; in its range, for ranges), or between two cells (from
// included, to excluded). An empty cell is no condition. The first rule whose conditions hold and whose return is not
// empty gives the result (Collect: every one). A merged role cell spans the columns of a condition of several
// parameters. HC conditions make a lookup: their values in the title rows, across the columns of the returns. A table
// can be transposed (its roles down the first column). The tables of the engine this one follows keep their own layout
// (RulesTable): this one is chosen only for the layouts that are OpenL's.
import { RulesError, toValue } from '../values.js';
import { valueOfType, inRangeOf } from '../typed.js';
import { headerOf } from './smart.js';

const text = (value) => (value === null || value === undefined ? '' : String(value).trim());
const isEmpty = (value) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
const MARK = /^(MC|C|HC|A|CRET|RET)(\d+)$/i;
// The types of the tables of the engine this one follows (a type of anything else is OpenL's).
const OLD_TYPES = new Set([
  'string',
  'integer',
  'float',
  'double',
  'number',
  'intrange',
  'floatrange',
  'doublerange',
  'numberrange',
  'nested',
  'code',
  'codes',
  'boolean',
  'date',
]);
const IDENTIFIER = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;

// Whether the rows of a "Rules" table are in the layout of OpenL (else, of the engine this one follows).
function isOpenLLayout(rows) {
  const marks = rows[1] || [];
  if (isTransposed(rows)) return true;
  if (/^rule$/i.test(text(marks[0]))) return true;
  const expressions = rows[2] || [];
  const declarations = rows[3] || [];
  for (let c = 0; c < marks.length; c += 1) {
    const mark = text(marks[c]);
    if (/^(A|MC)\d+$/i.test(mark)) return true;
    const declaration = text(declarations[c]);
    if (declaration.split(/\s+/).length > 1) return true;
    if (declaration && !OLD_TYPES.has(declaration.toLowerCase())) return true;
    const code = text(expressions[c]);
    if (/^H?C\d+$/i.test(mark) && code && !IDENTIFIER.test(code)) return true;
  }
  return false;
}

// Roles down the first column (and none across): a table to read transposed.
function isTransposed(rows) {
  const down = rows.slice(1).filter((row) => MARK.test(text(row[0]))).length;
  const across = (rows[1] || []).slice(1).filter((cell) => MARK.test(text(cell))).length;
  return down > 1 && across === 0;
}

// The rows (but the title) and merges of a table, columns made rows.
function transpose(rows, merges) {
  const body = rows.slice(1);
  const width = Math.max(...body.map((row) => row.length));
  const turned = Array.from({ length: width }, (_, c) => body.map((row) => (row[c] === undefined ? null : row[c])));
  const moved = merges
    .filter((merge) => merge.top > 0)
    .map((merge) => ({ top: merge.left + 1, bottom: merge.right + 1, left: merge.top - 1, right: merge.bottom - 1 }));
  return { rows: [rows[0], ...turned], merges: moved };
}

// "Integer min" -> { type, name }; "String[]" -> { type, name: null }.
function declarationOf(cell) {
  const words = text(cell).split(/\s+/).filter(Boolean);
  if (!words.length) return { type: null, name: null };
  return words.length > 1 ? { type: words[0], name: words[words.length - 1] } : { type: words[0], name: null };
}

// The value of a cell as the type of its parameter says (undefined when empty).
const valueOf = (raw, type) => valueOfType(raw, type) ?? undefined;

const isRange = (value) => value !== null && typeof value === 'object' && 'minIncluded' in value;
const inRange = (range, value) => inRangeOf(range, value);
const same = (a, b) => {
  if (a instanceof Date || b instanceof Date) return new Date(a).getTime() === new Date(b).getTime();
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  return a === b || (a !== null && b !== null && a !== undefined && b !== undefined && String(a) === String(b));
};

// Whether a condition (its code compiled: run) holds for the values of its cells: its code with its parameters, or the
// value of its code against the cells (equal, in a list or range, between two). Of decision tables and the conditions
// of Conditions tables.
function holdsOf(run, group, values, context) {
  if (values.every((value) => value === undefined)) return true;
  const named = group.params.filter((param) => param.name);
  const uses = named.some((param) => new RegExp(`\\b${param.name}\\b`).test(group.code));
  if (uses) {
    const scope = Object.create(context());
    group.params.forEach((param, i) => {
      if (param.name) scope[param.name] = values[i];
    });
    return Boolean(run(scope));
  }
  // A simplified condition: the value of the code against the cells.
  const value = run ? run(context()) : undefined;
  // (Cells of a list over several columns, String[] across merged ones: one list of them all.)
  const listed = String(group.params[0]?.type ?? '').endsWith('[]');
  if (values.length > 2 || (values.length === 2 && listed)) {
    const items = values.flat().filter((item) => item !== undefined && item !== null);
    return items.some((item) => (isRange(item) ? inRange(item, value) : same(item, value)));
  }
  if (values.length === 2) {
    const [min, max] = values;
    return (min === undefined || Number(value) >= Number(min)) && (max === undefined || Number(value) < Number(max));
  }
  const [expected] = values;
  if (Array.isArray(expected))
    return expected.some((item) => (isRange(item) ? inRange(item, value) : same(item, value)));
  if (isRange(expected)) return inRange(expected, value);
  if (Array.isArray(value)) return value.some((item) => same(item, expected));
  return same(expected, value);
}

// The value of a return (or an action) for the values of its cells (undefined: none).
function giveOf(run, group, values, context) {
  if (values.every((value) => value === undefined)) return undefined;
  if (!run) return values.find((value) => value !== undefined);
  const scope = Object.create(context());
  group.params.forEach((param, i) => {
    if (param.name) scope[param.name] = values[i];
  });
  return run(scope);
}

class DecisionTable {
  constructor(book) {
    this.book = book;
  }

  get className() {
    return 'DecisionTable';
  }

  get kind() {
    return 'Rules';
  }

  build({ rows, merges = [], position }) {
    this.rows = rows;
    this.merges = merges;
    this.position = position;
    const header = headerOf(text(rows[0][0]).replace(/^DT\b/, 'Rules'));
    Object.assign(this, { name: header.name, type: header.type, params: header.params, collect: header.collect });
    if (!this.name) throw new RulesError(`A decision table needs a name: "${text(rows[0][0])}"`);
    this.layout();
    return this;
  }

  // The columns of the table: groups of a role (their columns, code, parameters), the title rows, the rules.
  layout() {
    let { rows, merges } = this;
    this.transposed = isTransposed(rows);
    if (this.transposed) ({ rows, merges } = transpose(rows, merges));
    const marks = rows[1] || [];
    const width = Math.max(...rows.slice(1).map((row) => row.length));
    const spanOf = (c) => merges.find((merge) => merge.top === 1 && merge.left === c)?.right ?? c;
    this.groups = [];
    for (let c = 0; c < width; c += 1) {
      const mark = text(marks[c]);
      if (!mark) continue;
      const last = spanOf(c);
      const match = MARK.exec(mark);
      if (/^rule$/i.test(mark)) this.ruleColumn = c;
      else if (match) {
        // (MC1: a condition; CRET1: a return that collects the results of every rule.)
        const upper = match[1].toUpperCase();
        if (upper === 'CRET') this.collect = true;
        const role = upper === 'MC' ? 'C' : upper === 'CRET' ? 'RET' : upper;
        this.groups.push({
          role,
          mark,
          first: c,
          last,
          code: text(rows[2]?.[c])
            .replace(/^return\s+/, '')
            .replace(/;\s*$/, ''),
          params: Array.from({ length: last - c + 1 }, (_, i) => declarationOf(rows[3]?.[c + i])),
        });
      }
      c = last;
    }
    if (!this.groups.some((group) => group.role === 'RET' || group.role === 'A')) {
      throw new RulesError(`Decision table ${this.name} has no RET (or A) column`);
    }
    const across = this.groups.filter((group) => group.role === 'HC');
    this.titleRows = Math.max(1, across.length);
    this.body = rows.slice(4 + this.titleRows);
    this.laidRows = rows;
    // A lookup: the columns from the first HC or RET on are a matrix; the HC values in the title rows.
    if (across.length) {
      const start = Math.min(...this.groups.filter((g) => g.role === 'HC' || g.role === 'RET').map((g) => g.first));
      this.matrix = { start, end: width - 1, across: across.map((group, k) => ({ group, row: 4 + k })) };
    } else this.matrix = null;
    this.compiled = new Map();
  }

  // The types of the names of the code of a group: the parameters of the table and the group's.
  typesOf(group) {
    const types = Object.fromEntries(
      this.params.filter((param) => param.type).map((param) => [param.name, param.type])
    );
    for (const param of group?.params ?? []) if (param.name && param.type) types[param.name] = param.type;
    return types;
  }

  // The function of the code of a group (compiled once, when first used).
  codeOf(group) {
    if (!this.compiled.has(group)) {
      this.compiled.set(
        group,
        group.code
          ? this.book.compileFor(this, group.code, `Decision table ${this.name}, ${group.mark}`, {
              types: this.typesOf(group),
            })
          : null
      );
    }
    return this.compiled.get(group);
  }

  // Whether a condition holds for the values of its cells.
  holds(group, values, context) {
    return holdsOf(this.codeOf(group), group, values, context);
  }

  // The value of a return (or an action) for the values of its cells (undefined: none).
  give(group, values, context) {
    return giveOf(this.codeOf(group), group, values, context);
  }

  // The values of the cells of a group in a row (formulas computed).
  cellsOf(group, row, context, columns = null) {
    return group.params.map((param, i) => {
      const raw = row[(columns ?? group.first) + i];
      if (typeof raw === 'string' && raw.trim().startsWith('=')) {
        const key = `${group.mark}:${raw}`;
        if (!this.compiled.has(key)) {
          this.compiled.set(
            key,
            this.book.compileFor(this, raw.trim().slice(1), `Decision table ${this.name}`, { types: this.typesOf() })
          );
        }
        return this.compiled.get(key)(context());
      }
      return valueOf(raw, param.type);
    });
  }

  // The referents of a rule for its code: $C1.min (the values of the parameters of a column), $Expr.C1.textValue
  // (the code of a column).
  referents(row, context) {
    if (!this.referring) {
      this.referring = this.groups.some((group) => /\$(C|HC|A|RET|CRET|MC)\d+|\$Expr\b/.test(group.code));
      this.expressions = Object.fromEntries(
        this.groups.map((group) => [group.mark, { textValue: group.code, toJava: () => group.code }])
      );
    }
    if (!this.referring) return {};
    const referents = { $Expr: this.expressions };
    for (const group of this.groups) {
      const values = this.cellsOf(group, row, context);
      referents[`$${group.mark}`] = Object.fromEntries(
        group.params.map((param, i) => [param.name ?? `P${i + 1}`, values[i] ?? null])
      );
    }
    return referents;
  }

  typed(value) {
    if (value === null || value === undefined || value === '' || typeof value === 'object') return value;
    const type = String(this.type || '').replace(/\[\]$/, '');
    return ['Object', 'any', ''].includes(type) || this.book.table(type) ? value : toValue(type, value);
  }

  run(values) {
    let made = null;
    let extra = {};
    const context = () => {
      made ??= this.book.contextWith(values);
      return Object.assign(made, extra);
    };
    const vertical = this.groups.filter((group) => group.role === 'C');
    const actions = this.groups.filter((group) => group.role === 'A');
    const returns = this.groups.filter((group) => group.role === 'RET');
    const collected = [];
    for (const [r, row] of this.body.entries()) {
      extra = {
        $RuleId: r + 1,
        $Rule: this.ruleColumn === undefined ? null : row[this.ruleColumn],
        ...this.referents(row, context),
      };
      if (!vertical.every((group) => this.holds(group, this.cellsOf(group, row, context), context))) continue;
      for (const group of actions) this.give(group, this.cellsOf(group, row, context), context);
      if (this.matrix) {
        for (let column = this.matrix.start; column <= this.matrix.end; column += 1) {
          const fits = this.matrix.across.every(({ group, row: line }) =>
            this.holds(group, [valueOf(this.laidRows[line][column], group.params[0].type)], context)
          );
          if (!fits) continue;
          const [ret] = returns;
          const result = ret ? this.give(ret, [valueOf(row[column], ret.params[0]?.type)], context) : undefined;
          if (isEmpty(result)) continue;
          if (this.book.tracer) this.book.noteMatch([this.sheetCell(r, column)]);
          if (!this.collect) return this.typed(result);
          collected.push(this.typed(result));
        }
        continue;
      }
      for (const group of returns) {
        const result = this.give(group, this.cellsOf(group, row, context), context);
        if (isEmpty(result)) continue;
        if (this.book.tracer) this.book.noteMatch([this.sheetCell(r, group.first)]);
        if (!this.collect) return this.typed(result);
        collected.push(this.typed(result));
        break;
      }
    }
    if (this.collect) return collected;
    return undefined;
  }

  // The cell of the sheet of a rule (row) and column of the table, for traces (as laid: transposed back).
  sheetCell(row, column) {
    const { position } = this;
    const properties = this.ownProperties ? Object.keys(this.ownProperties).length : 0;
    const line = 4 + this.titleRows + row;
    const [r, c] = this.transposed ? [column + 1, line - 1] : [line, column];
    return {
      sheet: position?.sheet ?? null,
      row: (position?.row ?? 0) + properties + r,
      column: (position?.column ?? 0) + c,
    };
  }

  call(...args) {
    const values = Object.create(null);
    this.params.forEach((param, i) => {
      values[param.name] = args[i];
    });
    return this.run(values);
  }

  // The messages of the code that does not compile.
  validate() {
    const errors = [];
    for (const group of this.groups) {
      try {
        this.codeOf(group);
      } catch (err) {
        errors.push(err.message);
      }
    }
    return errors;
  }

  toJSON() {
    return {
      className: this.className,
      name: this.name,
      rows: this.rows,
      merges: this.merges,
      ...(this.position ? { position: this.position } : {}),
    };
  }

  fromJSON(data) {
    return this.build({ rows: data.rows, merges: data.merges || [], position: data.position });
  }

  toRows() {
    return this.rows.map((row, r) =>
      row.map((value) => ({ value, style: r === 0 ? 'title' : r < 4 + this.titleRows ? 'header' : 'value' }))
    );
  }
}

export { DecisionTable, isOpenLLayout, transpose, holdsOf, giveOf, declarationOf, valueOf };
