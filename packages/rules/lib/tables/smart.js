// The decision tables of OpenL Tablets whose conditions are not declared: SmartRules and SimpleRules (a row of titles,
// then rules), SmartLookup and SimpleLookup (conditions down the left and across the top).
//
//   SmartRules Double Discount(String plan, Integer customerAge)   SmartLookup Double Rate(String plan, Integer age)
//   Plan          | Age      | Discount                           Plan / Age  | <25  | 25-60 | >60
//   basic         | <25      | 0                                  basic       | 120  | 100   | 150
//   basic, gold   | 25 - 60  | 0.05                               premium     | 220  | 180   | 260
//   premium       |          | 0.1
//
// SmartRules: each title is matched to a parameter (or a field of a parameter of a Datatype of the book) by its words
// (abbreviations too); the columns after those that match are the results. SimpleRules: the first columns are the
// parameters in order. Conditions: values, lists (US, CA), ranges in any form of OpenL (18-65, >=60, 5+, [1; 5)),
// texts ranges (Z100-Z105, SmartRules), empty or * for any value; two columns under one merged title are a range
// (min <= value < max); a title with "true" is a condition written as an expression. A column titled Rule names the
// rules ($Rule; $RuleId is their number). Results: the first non-empty of the result columns (up to 3); an empty
// result goes on to the next rule; Collect gives every result; a Datatype of the book as the type of the result makes
// it an object of the result columns, their titles matched to its fields.
import { transpose } from './decision.js';
import { conditionOf, kindOf, compareNatural, compareText } from '../conditions.js';
import { valueOfType } from '../typed.js';
import { equal } from '../openl/runtime.js';
import { RulesError, paramsOfTitle, toValue } from '../values.js';

const text = (value) => (value === null || value === undefined ? '' : String(value).trim());
const isEmpty = (value) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

// The words of a name or title: camelCase, snake_case and spaces apart, lowercase.
function wordsOf(name) {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// How well a title fits a name: its words found in the name (or abbreviated: a word the start of the other).
function scoreOf(titleWords, nameWords) {
  let score = 0;
  for (const word of titleWords) {
    if (nameWords.includes(word)) score += 2;
    else if (
      nameWords.some(
        (other) => (word.length >= 2 && other.startsWith(word)) || (other.length >= 3 && word.startsWith(other))
      )
    )
      score += 1;
  }
  return score;
}

// "SmartRules Collect Double[] Name(String a, Integer b)" -> { kind, collect, type, name, params }.
function headerOf(title) {
  const open = title.indexOf('(');
  const head = (open === -1 ? title : title.slice(0, open)).trim().split(/\s+/);
  const kind = head.shift();
  let collect = false;
  let collection = null;
  let elementType = null;
  let valueType = null;
  if (head[0] && head[0].toLowerCase() === 'collect') {
    collect = true;
    head.shift();
    // Collect as String Set, Collect as String and Integer Map: the elements (keys and values) and the collection.
    if (head[0] && head[0].toLowerCase() === 'as') {
      head.shift();
      elementType = head.shift();
      if (head[0] && head[0].toLowerCase() === 'and') {
        head.shift();
        valueType = head.shift();
      }
      collection = String(head.length > 1 ? head.shift() : 'List').toLowerCase();
    }
  }
  const name = head.pop();
  const type = head.join(' ') || (collection === 'map' ? 'Map' : collection ? `${elementType}[]` : 'Object');
  if (!name) throw new RulesError(`A ${kind} table needs a type and a name: "${title}"`);
  return {
    kind,
    collect: collect || /\[\]$/.test(type),
    // (A type of array without Collect: the array of a cell, or every result if they are no arrays.)
    keyword: collect,
    collection,
    elementType,
    valueType,
    type,
    name,
    params: paramsOfTitle(title),
  };
}

// The groups of columns of a row: a merged range is one (its first and last column), others one column each.
function groupsOf(row, rowIndex, merges, from = 0) {
  const groups = [];
  for (let c = from; c < row.length;) {
    const merge = merges.find((m) => m.top <= rowIndex && m.bottom >= rowIndex && m.left === c && m.right > c);
    const last = merge ? merge.right : c;
    groups.push({ first: c, last, title: text(row[c]) });
    c = last + 1;
  }
  return groups;
}

class SmartTable {
  constructor(book, kind) {
    this.book = book;
    this.kind = kind;
    // (Of the header, set by build: the type of the results, how they are collected, the name and parameters.)
    this.type = 'Object';
    this.collect = false;
    this.keyword = false;
    this.collection = null;
    this.elementType = null;
    this.valueType = null;
    this.name = null;
    this.params = [];
    this.rows = [];
    this.merges = [];
    this.position = null;
    this.bodyStart = 2;
  }

  get className() {
    return 'SmartTable';
  }

  build({ rows, merges = [], position }) {
    this.rows = rows;
    this.merges = merges;
    this.position = position;
    const header = headerOf(text(rows[0][0]));
    Object.assign(this, {
      collect: header.collect,
      keyword: header.keyword,
      collection: header.collection,
      elementType: header.elementType,
      valueType: header.valueType,
      type: header.type,
      name: header.name,
      params: header.params,
    });
    this.kind = header.kind;
    return this;
  }

  get isLookup() {
    return /Lookup$/.test(this.kind);
  }

  get isSmart() {
    return /^Smart/.test(this.kind);
  }

  // The parameters and their fields a title can be about: { path: ['policy', 'age'], words, type }.
  candidates() {
    const list = [];
    for (const param of this.params) {
      list.push({ path: [param.name], words: wordsOf(param.name), type: param.type });
      const datatype = this.book.table(param.type);
      if (datatype && datatype.className === 'DatatypeTable') {
        for (const field of Object.values(datatype.params)) {
          list.push({
            path: [param.name, field.name],
            words: [...wordsOf(field.name), ...wordsOf(param.name)],
            type: field.type,
            field: true,
          });
        }
      }
    }
    return list;
  }

  prepare() {
    if (this.prepared) return;
    const where = (detail) => `${this.kind} ${this.name}${detail ? `, ${detail}` : ''}`;
    // (In books of OpenL texts compare exactly, as OpenL compares them.)
    this.exact = (this.dialect ?? this.book.dialect) === 'openl';
    if (this.isSmart && !this.isLookup && !this.transposed && this.readsDown()) {
      this.transposed = true;
      ({ rows: this.rows, merges: this.merges } = transpose(this.rows, this.merges));
    }
    if (this.isLookup) this.prepareLookup(where);
    else this.prepareRules(where);
    this.prepared = true;
  }

  // A test of a condition over the cells of a row: one column, or two (min and max) under a merged title.
  testOf(group, row, type, smart) {
    if (group.last > group.first) {
      const min = row[group.first];
      const max = row[group.last];
      if (isEmpty(min) && isEmpty(max)) return () => true;
      const kind = kindOf(type);
      // (Texts in their order, natural: A10 before A100.)
      if (kind === 'text') {
        const order = this.exact ? compareNatural : compareText;
        return (value) =>
          value !== null &&
          value !== undefined &&
          (isEmpty(min) || order(String(value), String(min)) >= 0) &&
          (isEmpty(max) || order(String(value), String(max)) < 0);
      }
      const toNumber = (value) => (kind === 'date' ? new Date(value).getTime() : Number(value));
      return (value) =>
        value !== null &&
        value !== undefined &&
        (isEmpty(min) || toNumber(value) >= toNumber(min)) &&
        (isEmpty(max) || toNumber(value) < toNumber(max));
    }
    return conditionOf(this.constantOr(row[group.first]), type, { smart, exact: this.exact });
  }

  // A cell naming a constant of the book (in books of OpenL): its value; else the cell.
  constantOr(cell) {
    if (!this.exact || typeof cell !== 'string' || !/^[A-Za-z_]\w*$/.test(cell.trim())) return cell;
    const value = this.book.constantOf(cell);
    return value === undefined ? cell : value;
  }

  // Whether its titles go down its first column (a table of rules in columns): its first column is titles only, two or
  // more naming different arguments and then at most two of results (texts), and its first row names none but the
  // first.
  readsDown() {
    const candidates = this.candidates();
    const named = (title) => {
      const words = wordsOf(title);
      const scored = candidates.map((candidate) => ({ candidate, score: scoreOf(words, candidate.words) }));
      const best = scored.reduce((a, b) => (b.score > a.score ? b : a), { candidate: null, score: 0 });
      return best.score > 0 ? best.candidate.path.join('.') : null;
    };
    const firsts = this.rows.slice(1).map((row) => text(row[0]));
    let count = 0;
    const seen = new Set();
    while (count < firsts.length && firsts[count] && named(firsts[count]) && !seen.has(named(firsts[count]))) {
      seen.add(named(firsts[count]));
      count += 1;
    }
    const results = firsts.slice(count);
    if (count < 2 || results.length > 2) return false;
    if (results.some((title) => !title || !Number.isNaN(Number(title)))) return false;
    const across = (this.rows[1] || []).slice(1).filter((cell) => text(cell) && named(text(cell))).length;
    return across === 0;
  }

  prepareRules(where) {
    const titles = this.rows[1] || [];
    const groups = groupsOf(titles, 1, this.merges);
    const candidates = this.candidates();
    let index = 0;
    this.ruleColumn = null;
    if (groups[0] && /^rule$/i.test(groups[0].title)) {
      this.ruleColumn = groups[0].first;
      index = 1;
    }
    this.conditions = [];
    this.actions = [];
    const used = new Set();
    // (A title of an element of a Conditions, Returns or Actions table: that element, before any argument.)
    const external = (group) => this.book.externals?.get(text(group.title)) ?? null;
    if (this.isSmart) {
      for (; index < groups.length; index += 1) {
        const group = groups[index];
        const found = external(group);
        if (found?.element.role === 'condition') {
          this.conditions.push({ group, external: found });
          continue;
        }
        if (found?.element.role === 'action') {
          this.actions.push({ group, external: found });
          continue;
        }
        if (found?.element.role === 'return') break;
        const words = wordsOf(group.title);
        if (words.includes('true')) {
          this.conditions.push({ group, expression: true });
          continue;
        }
        let best = null;
        let bestScore = 0;
        for (const candidate of candidates) {
          const score =
            scoreOf(words, candidate.words) -
            (used.has(candidate.path.join('.')) ? 1 : 0) -
            (candidate.field ? 0.5 : 0);
          if (score > bestScore) {
            best = candidate;
            bestScore = score;
          }
        }
        // The first title of no parameter starts the results (one column is always a result).
        if (!best || index === groups.length - 1) break;
        used.add(best.path.join('.'));
        this.conditions.push({ group, path: best.path, type: best.type });
      }
    } else {
      for (const param of this.params) {
        if (index >= groups.length - 1) break;
        this.conditions.push({ group: groups[index], path: [param.name], type: param.type });
        index += 1;
      }
    }
    this.results = groups.slice(index);
    if (!this.results.length) throw new RulesError(`${where()}: no column of results`);
    // Titles of several rows (the first merged down them): the results are their columns under the last row, each
    // the path of its titles (a field of a nested object of the result).
    const first = groups[0] ? this.merges.find((merge) => merge.top === 1 && merge.left === groups[0].first) : null;
    const height = first ? first.bottom - first.top + 1 : 1;
    this.bodyStart = 1 + height;
    if (height > 1) {
      this.results = this.results.flatMap((group) =>
        Array.from({ length: group.last - group.first + 1 }, (_, i) => {
          const column = group.first + i;
          const path = [group.title];
          for (let r = 2; r <= height; r += 1) if (text(this.rows[r]?.[column])) path.push(text(this.rows[r][column]));
          return { first: column, last: column, title: path[path.length - 1], path };
        })
      );
    }
    // (Returns of elements: theirs are the results, no fields of a datatype.)
    this.externalResults = this.results.map((group) => {
      const found = external(group);
      return found?.element.role === 'return' ? found : null;
    });
    const datatype = this.externalResults.some(Boolean) ? null : this.book.table(this.type.replace(/\[\]$/, ''));
    this.resultDatatype = datatype && datatype.className === 'DatatypeTable' && !datatype.vocabulary ? datatype : null;
    const bestField = (of, title) => {
      let best = null;
      let bestScore = 0;
      for (const field of Object.values(of.params)) {
        const score = scoreOf(wordsOf(title), wordsOf(field.name));
        if (score > bestScore) {
          best = field;
          bestScore = score;
        }
      }
      return best;
    };
    this.resultFields = this.resultDatatype
      ? this.results.map((group) => {
          if (!group.path || group.path.length < 2) return bestField(datatype, group.title);
          // (A field of a nested object: the path of the titles through the datatypes.)
          const outer = bestField(datatype, group.path[0]);
          const nested = outer && this.book.table(String(outer.type).replace(/\[\]$/, ''));
          const inner = nested?.className === 'DatatypeTable' ? bestField(nested, group.path[1]) : null;
          return outer && inner ? { ...inner, name: outer.name, nested: inner.name } : outer;
        })
      : null;
    const body = this.rows.slice(this.bodyStart);
    const externalTest = ({ table, element }, group, row) => {
      const values = table.values(element, row, group.first);
      return { context: true, run: (ctx) => table.holds(element, values, () => ctx) };
    };
    this.rules = body.map((row, r) => ({
      tests: this.conditions.map((condition) =>
        condition.external
          ? externalTest(condition.external, condition.group, row)
          : condition.expression
            ? this.expressionTest(row[condition.group.first], where(`row ${r + 3}`))
            : this.testOf(condition.group, row, condition.type, this.isSmart)
      ),
      name: this.ruleColumn === null ? null : row[this.ruleColumn],
      actions: this.actions.map(({ group, external: found }) => found.table.values(found.element, row, group.first)),
      cells: this.results.map((group, i) => {
        const found = this.externalResults[i];
        if (!found) return this.cellOf(row[group.first], where(`row ${r + 3}`));
        const values = found.table.values(found.element, row, group.first);
        if (values.every((value) => value === undefined)) return { value: null };
        return { run: (ctx) => found.table.give(found.element, values, () => ctx) };
      }),
    }));
  }

  prepareLookup(where) {
    const corner = this.merges.find((m) => m.top === 1 && m.left === 0);
    const count = this.params.length;
    let down;
    let across;
    if (count === 1) {
      down = 1;
      across = 0;
    } else if (corner) {
      across = corner.bottom - corner.top + 1;
      down = corner.right - corner.left + 1;
      // (Titles merged down one column each: the columns down are those merged down the same rows.)
      if (down === 1) {
        while (
          this.merges.some((m) => m.top === 1 && m.left === down && m.right === down && m.bottom === corner.bottom)
        )
          down += 1;
      }
    } else {
      across = 1;
      down = count - 1;
    }
    let vertical;
    let horizontal;
    if (down + across === count) {
      vertical = this.params.slice(0, down).map((param) => ({ ...param, path: [param.name] }));
      horizontal = this.params.slice(down);
    } else if (this.isSmart && corner) {
      // (SmartLookup: the columns down are matched by their titles to the parameters and their fields; the rows
      // across are the parameters left, in order.)
      const candidates = this.candidates();
      const used = new Set();
      vertical = Array.from({ length: down }, (_, c) => {
        const words = wordsOf(text(this.rows[1]?.[c]));
        let best = null;
        let bestScore = 0;
        for (const candidate of candidates) {
          const score = scoreOf(words, candidate.words) - (used.has(candidate.path.join('.')) ? 1 : 0);
          if (score > bestScore) {
            best = candidate;
            bestScore = score;
          }
        }
        if (!best) throw new RulesError(`${where()}: no argument for the column "${text(this.rows[1]?.[c])}"`);
        used.add(best.path.join('.'));
        return { name: best.path.join('.'), path: best.path, type: best.type };
      });
      const roots = new Set(vertical.map((entry) => entry.path[0]));
      horizontal = this.params.filter((param) => !roots.has(param.name)).slice(0, across);
      if (horizontal.length !== across) {
        throw new RulesError(
          `${where()}: its corner says ${across} arguments across, but ${horizontal.length} are left`
        );
      }
    } else {
      throw new RulesError(
        `${where()}: its corner says ${down} arguments down and ${across} across, but it has ${count}`
      );
    }
    const top = this.rows.slice(1, 1 + across);
    const body = this.rows.slice(1 + across);
    const width = Math.max(...this.rows.slice(1).map((row) => row.length));
    this.columns = [];
    for (let c = down; c < width; c += 1) {
      this.columns.push({
        column: c,
        tests: horizontal.map((param, i) =>
          conditionOf(top[i]?.[c], param.type, { smart: this.isSmart, exact: this.exact })
        ),
      });
    }
    this.lookupRows = body.map((row, r) => ({
      tests: vertical.map((param, i) => conditionOf(row[i], param.type, { smart: this.isSmart, exact: this.exact })),
      cells: this.columns.map(({ column }) => this.cellOf(row[column], where(`row ${r + 2 + across}`))),
    }));
    this.vertical = vertical;
    this.horizontal = horizontal;
  }

  // A condition written as an expression of the parameters (empty: true).
  expressionTest(cell, where) {
    if (isEmpty(cell)) return () => true;
    const source = String(cell).trim().replace(/^=/, '');
    const run = this.book.compileFor(this, source, where, { types: this.paramTypes() });
    return { context: true, run };
  }

  // The types of the parameters (for formulas in OpenL's language).
  paramTypes() {
    this.typesOfParams ??= Object.fromEntries(
      this.params.filter((param) => param.type).map((param) => [param.name, param.type])
    );
    return this.typesOfParams;
  }

  // A result cell: its value, or the function of its =expression.
  cellOf(cell, where) {
    cell = this.constantOr(cell);
    if (typeof cell === 'string' && cell.trim().startsWith('=')) {
      return { run: this.book.compileFor(this, cell.trim().slice(1), where, { types: this.paramTypes() }) };
    }
    return { value: cell };
  }

  valueOf(cell, context) {
    return cell.run ? cell.run(context()) : cell.value;
  }

  // A result, typed as the table says (each element of Collect).
  typed(value) {
    const type = this.elementType ?? this.type.replace(/\[\]$/, '');
    if (value === null || value === undefined || value === '' || typeof value === 'object') return value;
    return ['Object', 'any'].includes(type) || this.resultFields ? value : toValue(type, value);
  }

  run(values) {
    this.prepare();
    let made = null;
    let extra = null;
    const context = () => {
      made ??= this.book.contextWith(values);
      if (extra) Object.assign(made, extra);
      return made;
    };
    const valueAt = (path) =>
      path.reduce((node, key) => (node === null || node === undefined ? undefined : node[key]), values);
    const collected = [];
    if (this.isLookup) {
      const verticalValues = this.vertical.map((param) => valueAt(param.path ?? [param.name]));
      const horizontalValues = this.horizontal.map((param) => values[param.name]);
      const columns = this.columns.filter((column) => column.tests.every((test, i) => test(horizontalValues[i])));
      for (const [r, row] of this.lookupRows.entries()) {
        if (!row.tests.every((test, i) => test(verticalValues[i]))) continue;
        for (const column of columns) {
          extra = { $RuleId: r + 1 };
          const value = this.valueOf(row.cells[this.columns.indexOf(column)], context);
          if (isEmpty(value)) continue;
          if (this.book.tracer) this.book.noteMatch([this.sheetCell(1 + this.horizontal.length + r, column.column)]);
          if (!this.collect) return this.typed(value);
          collected.push(this.typed(value));
        }
      }
      return this.collect ? this.collected(collected) : undefined;
    }
    for (const [r, rule] of this.rules.entries()) {
      let ok = true;
      for (let i = 0; i < rule.tests.length && ok; i += 1) {
        const test = rule.tests[i];
        const condition = this.conditions[i];
        if (test.context) {
          extra = { $RuleId: r + 1, $Rule: rule.name };
          ok = Boolean(test.run(context()));
        } else ok = test(condition.path ? valueAt(condition.path) : undefined);
      }
      if (!ok) continue;
      extra = { $RuleId: r + 1, $Rule: rule.name };
      // (Actions of elements: run for each rule whose conditions hold.)
      this.actions.forEach(({ external: found }, i) => found.table.give(found.element, rule.actions[i], context));
      let result;
      let index = 0;
      if (this.resultFields) {
        const object = {};
        let any = false;
        rule.cells.forEach((cell, i) => {
          const field = this.resultFields[i];
          const value = this.valueOf(cell, context);
          if (!field || isEmpty(value)) return;
          if (field.nested) (object[field.name] ??= {})[field.nested] = toValue(field.type, value);
          else object[field.name] = toValue(field.type, value);
          any = true;
        });
        if (any) {
          // (Fields named as inputs take their values; the others no column gives, their default values.)
          for (const field of Object.values(this.resultDatatype.params)) {
            if (object[field.name] === undefined && values[field.name] !== undefined)
              object[field.name] = values[field.name];
          }
        }
        result = any ? this.resultDatatype.withDefaults(object) : undefined;
      } else {
        // (The first result that is not empty: the cells after it are not run.)
        for (index = 0; index < rule.cells.length; index++) {
          result = this.valueOf(rule.cells[index], context);
          if (!isEmpty(result)) break;
        }
      }
      if (isEmpty(result)) continue;
      if (this.book.tracer) this.book.noteMatch([this.sheetCell(this.bodyStart + r, this.results[index].first)]);
      // (A type of array without Collect: an array of a cell is the result.)
      if (this.collect && !this.keyword && !collected.length) {
        const whole = this.wholeArray(result);
        if (whole) return whole;
      }
      if (!this.collect) return this.typed(result);
      if (this.collection === 'map') {
        collected.push([this.typed(result), this.valueOf(rule.cells[index + 1] ?? { value: null }, context)]);
        continue;
      }
      collected.push(this.typed(result));
    }
    return this.collect ? this.collected(collected) : undefined;
  }

  // An array a cell gives (or the text of a list, of a type of array), or null.
  wholeArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.includes(',') && /\[\]$/.test(this.type))
      return valueOfType(value, this.type);
    return null;
  }

  // The results collected: a list, a set (each once) or a map (of the first two result columns).
  collected(values) {
    if (this.collection === 'set')
      return values.filter((value, i) => values.findIndex((other) => equal(other, value)) === i);
    if (this.collection === 'map') return new Map(values);
    return values;
  }

  // The cell of the sheet of a row and column of the table (for traces), below its properties.
  sheetCell(row, column) {
    const { position } = this;
    const properties = this.ownProperties ? Object.keys(this.ownProperties).length : 0;
    return {
      sheet: position?.sheet ?? null,
      row: (position?.row ?? 0) + (row > 0 ? properties : 0) + row,
      column: (position?.column ?? 0) + column,
    };
  }

  call(...args) {
    const values = Object.create(null);
    this.params.forEach((param, i) => {
      values[param.name] = args[i];
    });
    return this.run(values);
  }

  // The messages of the expressions that do not compile.
  validate() {
    try {
      this.prepared = false;
      this.prepare();
      return [];
    } catch (err) {
      return [err.message];
    }
  }

  // Every result a table can give (for Check tables).
  allResults(route = '') {
    this.prepare();
    const cells = this.isLookup
      ? this.lookupRows.flatMap((row) => row.cells)
      : this.rules.flatMap((rule) => rule.cells);
    let values = cells.filter((cell) => !cell.run).map((cell) => cell.value);
    for (const step of route ? route.split('.') : [])
      values = values.flatMap((value) => (value && value[step] !== undefined ? [value[step]] : []));
    return values
      .flatMap((value) => (typeof value === 'string' ? value.split('\n') : [value]))
      .filter((value) => !isEmpty(value));
  }

  toJSON() {
    return {
      className: this.className,
      kind: this.kind,
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
      row.map((value) => ({ value, style: r === 0 ? 'title' : r === 1 ? 'header' : 'value' }))
    );
  }
}

export { SmartTable, wordsOf, scoreOf, headerOf };
