// The tables of a book other than rules, spreadsheets and tests.
//
//   Constants Rates            Datatype Customer            Method Number Round2(Number value)
//   Float   | vat  | 0.21      String  | plan  | basic      return Math.round(value * 100) / 100
//   Integer | days | 30        Integer | age   |
//
//   Check Codes                Transform Order
//   Discount | (route)         customer.name | '@input.name'
//                              total         | '@$.lines.length * 2'
//                              label         | '{{input.name}} ({{input.plan}})'
import { compileExpression, compileProgram, compileTemplate, evaluateLiteral, isProgram } from '../expressions.js';
import { parse as parseOpenL } from '../openl/parser.js';

// Whether a source is code of OpenL.
const readsOpenL = (source) => {
  try {
    parseOpenL(source);
    return true;
  } catch {
    return false;
  }
};
import { RulesError, toValue, paramsOfTitle } from '../values.js';
import { RecordReader, segmentsOf } from '../records.js';
import { valueOfType } from '../typed.js';
import { transpose } from './decision.js';

// The type of a field of a type of the book (a datatype's field), or null.
function fieldTypeOf(book, type, field) {
  const datatype = type ? book.table(String(type).replace(/\[\]$/, '')) : null;
  return datatype?.className === 'DatatypeTable' ? (datatype.params[field]?.type ?? null) : null;
}

const text = (value) => (value === null || value === undefined ? '' : String(value).trim());
const cell = (value, style = 'value') => ({ value: value ?? null, style });

class ConstantsTable {
  static kind = 'Constants';

  constructor(book) {
    this.book = book;
  }

  get className() {
    return 'ConstantsTable';
  }

  build({ rows, position }) {
    this.position = position;
    this.name = text(rows[0][0]).split(/\s+/)[1];
    this.params = rows.slice(1).map((row) => {
      const type = text(row[0]);
      const raw = row[2];
      // (= expression: computed when the book is ready, with the constants before it.)
      if (typeof raw === 'string' && raw.trim().startsWith('='))
        return { type, name: text(row[1]), formula: raw.trim().slice(1) };
      // (_DEFAULT_: the default of the type, "" of a String, 0 of a number, false of a boolean.)
      if (typeof raw === 'string' && raw.trim() === '_DEFAULT_') {
        const value = /^(String|Character|char)$/.test(type)
          ? ''
          : /^(boolean|Boolean)$/.test(type)
            ? false
            : /^(int|long|short|byte|double|float|Integer|Long|Short|Byte|Double|Float)$/.test(type)
              ? 0
              : type.endsWith('[]')
                ? []
                : null;
        return { type, name: text(row[1]), value };
      }
      return { type, name: text(row[1]), value: raw === null || raw === undefined ? undefined : toValue(type, raw) };
    });
    return this;
  }

  toJSON() {
    return {
      className: this.className,
      params: this.params,
      ...(this.name ? { name: this.name } : {}),
      ...(this.position ? { position: this.position } : {}),
    };
  }

  fromJSON(data) {
    this.params = data.params || [];
    this.name = data.name;
    this.position = data.position;
    return this;
  }

  toRows() {
    return [
      [cell(`Constants${this.name ? ` ${this.name}` : ''}`, 'title'), cell(null, 'title'), cell(null, 'title')],
      ...this.params.map((param) => [
        cell(param.type, 'header'),
        cell(param.name, 'header'),
        cell(
          param.value instanceof Date || typeof param.value !== 'object' ? param.value : JSON.stringify(param.value)
        ),
      ]),
    ];
  }
}

// An object a datatype fills: no list, date nor value.
const isRecord = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);

class DatatypeTable {
  static kind = 'Datatype';

  constructor(book) {
    this.book = book;
  }

  get className() {
    return 'DatatypeTable';
  }

  build({ rows, position }) {
    this.position = position;
    // Datatype Name, Datatype Name extends Parent (its fields first), Datatype Name <String> (a vocabulary: the
    // values of a type the rows list).
    const header = text(rows[0][0]).slice(9).trim();
    const vocabulary = /^(\S+)\s*<\s*([\w.]+)\s*>$/.exec(header);
    const extended = /^(\S+)\s+extends\s+(\S+)$/.exec(header);
    this.name = vocabulary ? vocabulary[1] : extended ? extended[1] : header;
    this.parent = extended ? extended[2] : null;
    this.params = {};
    if (vocabulary) {
      this.vocabulary = {
        type: vocabulary[2],
        values: rows
          .slice(1)
          .map((row) => row[0])
          .filter((value) => text(value) !== ''),
      };
      return this;
    }
    // (A row of the titles of its columns: Type | Name | Default | Description...)
    const titled = /^type$/i.test(text(rows[1]?.[0])) && /^name$/i.test(text(rows[1]?.[1]));
    for (const row of rows.slice(titled ? 2 : 1)) {
      // name : context (or : context.usState): a field that sets the runtime context of the calls it is given to.
      const [name, mapping] = text(row[1]).split(/\s*:\s*/);
      if (!name) continue;
      const context = /^context(\.|$)/.test(mapping ?? '') ? mapping.slice(8) || name : null;
      this.ownParams[name] = {
        name,
        type: text(row[0]),
        defValue: row[2] === null || row[2] === undefined ? undefined : text(row[2]),
        ...(context ? { context } : {}),
      };
    }
    return this;
  }

  // Its fields with those of its parent (first), when it extends another.
  get params() {
    if (!this.parent) return this.ownParams;
    const parent = this.book.table(this.parent);
    return parent?.className === 'DatatypeTable' ? { ...parent.params, ...this.ownParams } : this.ownParams;
  }

  set params(value) {
    this.ownParams = value;
  }

  // Whether a value is one of a vocabulary (its values compared as texts).
  allows(value) {
    return !this.vocabulary || this.vocabulary.values.some((item) => String(item) === String(value));
  }

  toJSON() {
    return {
      className: this.className,
      name: this.name,
      params: this.ownParams,
      ...(this.parent ? { parent: this.parent } : {}),
      ...(this.vocabulary ? { vocabulary: this.vocabulary } : {}),
      ...(this.position ? { position: this.position } : {}),
    };
  }

  fromJSON(data) {
    this.name = data.name;
    this.params = data.params || {};
    this.parent = data.parent ?? null;
    this.vocabulary = data.vocabulary ?? null;
    this.position = data.position;
    return this;
  }

  // The default value of a field (its third column), as its type says; undefined when it has none.
  defaultOf(field) {
    if (field.defValue === undefined || field.defValue === null || field.defValue === '') return undefined;
    // (_DEFAULT_: the default of the type: an empty array, "", 0, false, a new object of a datatype.)
    if (String(field.defValue).trim() === '_DEFAULT_') {
      const type = String(field.type);
      if (type.endsWith('[]') || /^(java\.util\.)?(List|ArrayList|Collection|Set)(<.*>)?$/.test(type)) return [];
      if (/^(java\.util\.)?(Map|HashMap|LinkedHashMap)(<.*>)?$/.test(type)) return new Map();
      if (/^(String|Character|char)$/.test(type)) return '';
      if (/^(int|long|short|byte|double|float|Integer|Long|Short|Byte|Double|Float|BigDecimal|BigInteger)$/.test(type))
        return 0;
      if (/^(boolean|Boolean)$/.test(type)) return false;
      const datatype = this.book?.table?.(type);
      return datatype?.className === 'DatatypeTable' ? datatype.withDefaults({}) : null;
    }
    // (A name of a constant of the book: its value.)
    const constant = this.book?.constantOf?.(field.defValue);
    if (constant !== undefined) return constant;
    // (Arrays of their list of values: 1.5, 2.5; dates and times as OpenL reads them.)
    if (
      String(field.type).endsWith('[]') ||
      /^(Date|(java\.time\.)?(LocalDate|LocalTime|LocalDateTime|ZonedDateTime|Instant))$/.test(field.type)
    ) {
      return valueOfType(field.defValue, field.type);
    }
    return toValue(field.type, field.defValue);
  }

  // An object of the datatype made (Data records, results of SmartRules, the inputs of tests): the fields it lacks
  // (undefined, null or empty) take their default values, as OpenL Tablets gives them, and so do the objects of
  // datatypes in its fields. The same object.
  withDefaults(object) {
    const filled = this.filled(object);
    if (filled !== object) Object.assign(object, filled);
    return object;
  }

  // The datatype of a field: { datatype, list } when its type is a datatype of the book (or a list of one), else null.
  fieldDatatype(field) {
    const type = String(field.type || '');
    const table = this.book?.table?.(type.replace(/\[\]$/, ''));
    return table?.className === 'DatatypeTable' ? { datatype: table, list: /\[\]$/.test(type) } : null;
  }

  // Whether a field has a default value that is a value of its type (one that is not is a message of the tests).
  hasDefault(field) {
    try {
      return this.defaultOf(field) !== undefined;
    } catch {
      return false;
    }
  }

  // Whether a field has a default value, or is of a datatype that has (datatypes of themselves are seen once).
  get hasDefaults() {
    return this.defaultsIn(new Set());
  }

  defaultsIn(seen) {
    if (seen.has(this)) return false;
    seen.add(this);
    return Object.values(this.params).some(
      (field) => this.hasDefault(field) || Boolean(this.fieldDatatype(field)?.datatype.defaultsIn(seen))
    );
  }

  // The fields that fill an object (once): those with a default value, and those of datatypes with some.
  get fillers() {
    this.filling ??= Object.values(this.params).flatMap((field) => {
      const nested = this.fieldDatatype(field);
      const deep = nested && nested.datatype.hasDefaults ? nested : null;
      return this.hasDefault(field) || deep ? [{ field, nested: deep }] : [];
    });
    return this.filling;
  }

  // An object of the datatype (an argument of a call, of the application, not changed): itself when it lacks no
  // field with a default value, at any depth, else a copy of it (and of the objects in it that lack some) with them.
  // Objects missing are not made. Objects in themselves: each copied once, and what refers to it refers to its copy.
  filled(object, copies = new Map()) {
    if (!isRecord(object)) return object;
    if (copies.has(object)) return copies.get(object);
    if (!this.lacks(object, new Set())) {
      copies.set(object, object);
      return object;
    }
    const copy = { ...object };
    copies.set(object, copy);
    for (const { field, nested } of this.fillers) {
      const value = object[field.name];
      if (value === undefined || value === null || value === '') {
        if (this.hasDefault(field)) copy[field.name] = this.defaultOf(field);
      } else if (nested) {
        if (nested.list && Array.isArray(value)) {
          const items = value.map((item) => nested.datatype.filled(item, copies));
          if (items.some((item, i) => item !== value[i])) copy[field.name] = items;
        } else copy[field.name] = nested.datatype.filled(value, copies);
      }
    }
    return copy;
  }

  // Whether an object lacks a field with a default value, at any depth (each object seen once).
  lacks(object, seen) {
    if (!isRecord(object) || seen.has(object)) return false;
    seen.add(object);
    for (const { field, nested } of this.fillers) {
      const value = object[field.name];
      if (value === undefined || value === null || value === '') {
        if (this.hasDefault(field)) return true;
      } else if (nested) {
        const items = nested.list && Array.isArray(value) ? value : [value];
        if (items.some((item) => nested.datatype.lacks(item, seen))) return true;
      }
    }
    return false;
  }

  // The messages of default values that are no value of their type.
  validate() {
    const errors = [];
    for (const field of Object.values(this.params)) {
      try {
        this.defaultOf(field);
      } catch (err) {
        errors.push(`Datatype ${this.name}, the default value of ${field.name}: ${err.message}`);
      }
    }
    return errors;
  }

  toRows() {
    return [
      [cell(`Datatype ${this.name}`, 'title'), cell(null, 'title'), cell(null, 'title')],
      ...Object.values(this.params).map((param) => [
        cell(param.type, 'header'),
        cell(param.name),
        cell(param.defValue),
      ]),
    ];
  }
}

// Methods: a function of the parameters. Its body is an expression (or `return expression`), or statements of
// JavaScript (variables, if, loops, functions) run as a program of @xufa/expression: as safe as every formula.
class MethodTable {
  static kind = 'Method';

  constructor(book) {
    this.book = book;
  }

  get className() {
    return 'MethodTable';
  }

  build({ rows, position }) {
    this.position = position;
    const title = text(rows[0][0]);
    const head = title.slice(0, title.indexOf('(')).trim().split(/\s+/);
    this.name = head[2] ?? head[1];
    this.returnType = head.length > 2 ? head[1] : undefined;
    const params = paramsOfTitle(title);
    this.params = params.map((param) => param.name);
    // (Their types: the params are names in the JSON of the engine this one follows.)
    this.paramTypes = params.map((param) => (param.type === 'any' ? null : param.type));
    const body = rows
      .slice(1)
      .map((row) => (row[0] === null || row[0] === undefined ? '' : String(row[0])))
      .join('\n');
    this.script = `function ${this.name}(${this.params.join(',')}) {\n${body}\n}`;
    this.prepare();
    return this;
  }

  // The body of the script (what is between the braces of `function name(...) { ... }`).
  get body() {
    const open = this.script.indexOf('{');
    const close = this.script.lastIndexOf('}');
    return this.script.slice(open + 1, close).trim();
  }

  prepare() {
    if (this.fn) return;
    const where = `Method ${this.name}`;
    const body = this.body;
    const single = /^return\s+([\s\S]*?);?\s*$/.exec(body);
    const source = single ? single[1] : body;
    // Its language: its property; else the book's, unless only the other language reads its code.
    if (this.languageFrom !== 'property') {
      const book = this.dialect ?? this.book.dialect;
      const other = book === 'openl' ? 'js' : 'openl';
      const reads = (dialect) => (dialect === 'js' ? isProgram(body) : readsOpenL(body));
      if (!reads(book) && reads(other)) {
        this.dialect = other;
        this.languageFrom = 'code';
      } else this.dialect = book;
    }
    // In OpenL: its code (Java's statements too), compiled when first called; safe as every formula.
    if (this.dialect === 'openl') {
      const types = Object.fromEntries(
        this.params.map((name, i) => [name, this.paramTypes?.[i]]).filter(([, type]) => type)
      );
      let compiled = null;
      const { params } = this;
      this.fn = (...args) => {
        compiled ??= this.book.compileFor(this, single ? source : body, where, { types });
        const values = Object.create(null);
        params.forEach((name, i) => {
          values[name] = args[i];
        });
        return compiled(this.book.contextWith(values));
      };
      return;
    }
    let run;
    try {
      run = /[;\n]|^\s*(if|for|while|const|let|var|function)\b/.test(source.trim())
        ? null
        : compileExpression(source, where);
    } catch {
      run = null;
    }
    // (Statements: a program.)
    run ??= compileProgram(body, where, { modules: this.book.resolveModule, tdz: Boolean(this.book.options.tdz) });
    const { params } = this;
    this.fn = (...args) => {
      const values = Object.create(null);
      params.forEach((name, i) => {
        values[name] = args[i];
      });
      return run(this.book.contextWith(values));
    };
  }

  call(...args) {
    this.prepare();
    return this.fn(...args);
  }

  toJSON() {
    return {
      className: this.className,
      name: this.name,
      params: this.params,
      script: this.script,
      ...(this.paramTypes?.some(Boolean) ? { paramTypes: this.paramTypes } : {}),
      ...(this.returnType ? { returnType: this.returnType } : {}),
      ...(this.position ? { position: this.position } : {}),
    };
  }

  fromJSON(data) {
    this.name = data.name;
    this.params = data.params || [];
    this.paramTypes = data.paramTypes || this.params.map(() => null);
    this.script = data.script;
    this.returnType = data.returnType;
    this.position = data.position;
    this.prepare();
    return this;
  }

  toRows() {
    const params = this.params.map((name, i) => (this.paramTypes?.[i] ? `${this.paramTypes[i]} ${name}` : name));
    const title = `Method ${this.returnType || 'Object'} ${this.name}(${params.join(', ')})`;
    return [[cell(title, 'title')], ...this.body.split('\n').map((line) => [cell(line)])];
  }
}

// Check tables name rules tables (and a route in their results) for check functions of the application: book.test({
// checks: { Codes: async (values, tableName, checkName) => [errors] } }) gets every value they can give.
class CheckTable {
  static kind = 'Check';

  constructor(book) {
    this.book = book;
  }

  get className() {
    return 'CheckTable';
  }

  build({ rows, position }) {
    this.position = position;
    this.name = text(rows[0][0]).split(/\s+/)[1];
    this.tableNames = rows.slice(1).map((row) => text(row[0]));
    this.routes = rows.slice(1).map((row) => text(row[1]));
    return this;
  }

  toJSON() {
    return {
      className: this.className,
      tableNames: this.tableNames,
      name: this.name,
      routes: this.routes,
      ...(this.position ? { position: this.position } : {}),
    };
  }

  fromJSON(data) {
    this.name = data.name;
    this.tableNames = data.tableNames || [];
    this.routes = data.routes || [];
    this.position = data.position;
    return this;
  }

  toRows() {
    return [
      [cell(`Check ${this.name}`, 'title'), cell(null, 'title')],
      ...this.tableNames.map((name, i) => [cell(name), cell(this.routes[i] || null)]),
    ];
  }
}

// Transform tables: an object made of another (and a context). Each row is a path and a literal (a text, number,
// object...): texts '@expression' are computed (the input's fields by name, the input as $, the context's names), '@@'
// is a text starting with @, and other texts are templates ({{ }}). A path __apply__ is a list of { pipe: [names of
// functions of the context], paths? } applied to the result (or to values at paths of it).
class TransformTable {
  static kind = 'Transform';

  constructor(book) {
    this.book = book;
  }

  get className() {
    return 'TransformTable';
  }

  build({ rows, position }) {
    this.position = position;
    this.name = text(rows[0][0]).split(/\s+/)[1];
    this.template = {};
    for (const row of rows.slice(1)) {
      const route = text(row[0]);
      if (!route) continue;
      const value = typeof row[1] === 'string' ? evaluateLiteral(row[1], `Transform ${this.name}, ${route}`) : row[1];
      setRoute(this.template, route, value);
    }
    return this;
  }

  compiled(source) {
    this.compiledCache ??= new Map();
    let run = this.compiledCache.get(source);
    if (!run) {
      const where = `Transform ${this.name}`;
      run = source.startsWith('@') ? compileExpression(source.slice(1), where) : compileTemplate(source, where);
      this.compiledCache.set(source, run);
    }
    return run;
  }

  // '@' expressions see the input's fields, the context's over them, and the input as $; templates the context.
  apply(node, input, context, base) {
    if (Array.isArray(node)) return node.map((item) => this.apply(item, input, context, base));
    if (node !== null && typeof node === 'object' && !(node instanceof Date)) {
      const result = {};
      for (const [key, value] of Object.entries(node)) result[key] = this.apply(value, input, context, base);
      return result;
    }
    if (typeof node !== 'string') return node;
    if (node.startsWith('@@')) return node.slice(1);
    if (node.startsWith('@')) {
      const scope = Object.assign(Object.create(this.book.context), input, context, { $: { ...input } });
      return this.compiled(node)(scope);
    }
    return node.includes('{{') ? this.compiled(node)(base) : node;
  }

  run(input, context = {}) {
    const base = this.book.contextWith(context);
    let result = this.apply(this.template, input ?? {}, context ?? {}, base);
    const apply = result.__apply__;
    if (apply) {
      for (const { pipe = [], paths } of apply) {
        const fns = pipe.map((name) => base[name]).filter((fn) => typeof fn === 'function');
        if (!fns.length) continue;
        const piped = (value) => fns.reduce((current, fn) => fn(current), value);
        if (!paths) result = piped(result);
        else for (const path of paths) setRoute(result, path, piped(getRoute(result, path)));
      }
      delete result.__apply__;
    }
    return result;
  }

  call(input, context) {
    return this.run(input, context);
  }

  // The messages of the expressions and templates that do not compile.
  validate() {
    const errors = [];
    const walk = (node) => {
      if (Array.isArray(node)) node.forEach(walk);
      else if (node !== null && typeof node === 'object') Object.values(node).forEach(walk);
      else if (typeof node === 'string' && !node.startsWith('@@') && (node.startsWith('@') || node.includes('{{'))) {
        try {
          this.compiled(node);
        } catch (err) {
          errors.push(err.message);
        }
      }
    };
    walk(this.template);
    return errors;
  }

  toJSON() {
    return {
      className: this.className,
      name: this.name,
      template: this.template,
      ...(this.position ? { position: this.position } : {}),
    };
  }

  fromJSON(data) {
    this.name = data.name;
    this.template = data.template || {};
    this.position = data.position;
    return this;
  }

  toRows() {
    const rows = [[cell(`Transform ${this.name}`, 'title'), cell(null, 'title')]];
    const walk = (node, path) => {
      if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
        for (const [key, value] of Object.entries(node)) walk(value, path ? `${path}.${key}` : key);
      } else {
        rows.push([cell(path, 'header'), cell(JSON.stringify(node))]);
      }
    };
    walk(this.template, '');
    return rows;
  }
}

// Routes of objects: a.b.c, and a[0].b.
const routeOf = (route) =>
  String(route)
    .replace(/\[(\w+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
function setRoute(target, route, value) {
  const keys = routeOf(route);
  let node = target;
  for (const key of keys.slice(0, -1)) {
    if (node[key] === null || typeof node[key] !== 'object') node[key] = {};
    node = node[key];
  }
  node[keys[keys.length - 1]] = value;
}
const getRoute = (target, route) =>
  routeOf(route).reduce((node, key) => (node === null || node === undefined ? undefined : node[key]), target);

// Data tables (OpenL Tablets): records of a type, a name of every expression of the book (a list).
//
//   Data Car cars              Data Integer limits
//   make   | model | price      this                <- fields (paths: owner.name), or this for values of a type
//   Make   | Model | Price      Limit               <- titles
//   Volvo  | V60   | 45000      100
class DataTable {
  static kind = 'Data';

  constructor(book) {
    this.book = book;
  }

  get className() {
    return 'DataTable';
  }

  build({ rows, merges = [], position }) {
    this.position = position;
    const [, type, name] = text(rows[0][0]).split(/\s+/);
    if (!name) throw new RulesError(`A data table is "Data <type> <name>": "${text(rows[0][0])}"`);
    this.type = type;
    this.name = name;
    this.rows = rows;
    this.blockMerges = merges;
    this.laid = null;
    return this;
  }

  // Its layout (when its records are first read: its datatype is known then): the fields, references, titles and
  // rows of values, transposed when the fields go down its first column.
  layout() {
    if (this.laid) return this.laid;
    let { rows } = this;
    let merges = this.blockMerges ?? [];
    const datatype = this.book.table(this.type.replace(/\[\]$/, ''));
    const known = datatype?.className === 'DatatypeTable' ? new Set(Object.keys(datatype.params)) : null;
    const fieldOf = (cell) => text(cell).split(/[.[:]/)[0];
    if (known) {
      const down = rows.slice(1).filter((row) => known.has(fieldOf(row[0]))).length;
      const across = (rows[1] || []).filter((cell) => known.has(fieldOf(cell))).length;
      if (down > 1 && down > across) ({ rows, merges } = transpose(rows, merges));
    }
    const fields = (rows[1] || []).map(text);
    // A row of references to other tables (>table, >table.field column), before the titles.
    const hasReferences = (rows[2] || []).some((cell) => text(cell).startsWith('>'));
    const start = hasReferences ? 4 : 3;
    this.laid = {
      fields,
      references: hasReferences ? rows[2].map((cell) => text(cell) || null) : [],
      titles: (rows[hasReferences ? 3 : 2] || []).map(text),
      data: rows.slice(start),
      // Merges: of the fields across columns, and of the rows of values (a record over rows).
      merges: merges
        .filter((merge) => (merge.top === 1 && merge.right > merge.left) || merge.top >= start)
        .map((merge) =>
          merge.top === 1
            ? { ...merge, headerRow: true }
            : { ...merge, top: merge.top - start, bottom: merge.bottom - start }
        ),
    };
    return this.laid;
  }

  get fields() {
    return this.layout().fields;
  }

  // The records, typed as the fields of the datatype say (once); references to other Data tables resolved.
  get records() {
    if (this.cached) return this.cached;
    const reader = this.reader();
    const datatype = this.book.table(this.type);
    const records = reader.records(this.type).map((record) => {
      if (datatype?.className === 'DatatypeTable' && record && typeof record === 'object')
        datatype.withDefaults(record);
      return record && typeof record === 'object' ? Object.freeze(record) : record;
    });
    this.keys = reader.groups.map((group) => reader.cell(group.from, this.keyColumn()));
    this.cached = Object.freeze(records);
    return this.cached;
  }

  reader() {
    const { fields, references, data, merges } = this.layout();
    return new RecordReader({
      fields,
      references,
      rows: data,
      merges,
      typeOf: (type, field) => fieldTypeOf(this.book, type, field),
      resolve: (reference, key) => this.book.lookup(reference, key),
      constant: (name) => this.book.constantOf(name),
    });
  }

  // The column of the keys of the records (for references from other tables): _PK_, or the first.
  keyColumn() {
    const pk = this.fields.indexOf('_PK_');
    return pk === -1 ? this.fields.findIndex((field) => field) : pk;
  }

  // The record of a key (by the key column, or by a field of the records), or its field.
  find(key, { column = null, field = null } = {}) {
    const records = this.records;
    const same = (a, b) => a !== null && a !== undefined && String(a).trim() === String(b).trim();
    const index = column
      ? records.findIndex((record) => same(record?.[column], key))
      : this.keys.findIndex((value) => same(value, key));
    if (index === -1) return null;
    const record = records[index];
    if (!field) return record;
    // (A path of fields and elements: boxes[0]:Box.items.)
    let value = record;
    for (const segment of segmentsOf(field)) {
      if (value === null || value === undefined) return null;
      if (segment.name) value = value[segment.name] ?? null;
      if (segment.index !== undefined && value !== null) value = value[segment.index] ?? null;
    }
    return value;
  }

  // The records (book.call('cars')).
  call() {
    return this.records;
  }

  toJSON() {
    return {
      className: this.className,
      type: this.type,
      name: this.name,
      rows: this.rows,
      ...(this.blockMerges?.length ? { merges: this.blockMerges } : {}),
      ...(this.position ? { position: this.position } : {}),
    };
  }

  fromJSON(data) {
    return this.build({ rows: data.rows || [], merges: data.merges || [], position: data.position });
  }

  toRows() {
    return this.rows.map((row, r) => row.map((value) => cell(value, r === 0 ? 'title' : r < 3 ? 'header' : 'value')));
  }
}

export { fieldTypeOf, ConstantsTable, DatatypeTable, MethodTable, CheckTable, TransformTable, DataTable };
