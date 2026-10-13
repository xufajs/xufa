// The records of the rows of Data tables (and the inputs of Test tables) of OpenL Tablets: a column of each field path
// (name, a.b, a[1].b, list:Type.b, [0], this, _PK_), an optional row of references to other Data tables (>table,
// >table.field column), and rows of values. A record can take several rows: the first column merged over them (its
// lists of objects are those rows, the "matrix" form, grouped the same way by their first column); the other columns
// take the value of the first row. A field written across merged columns is an array of those cells. Values are typed
// as the fields of the datatypes say.
import { valueOfType } from './typed.js';
import { splitList } from './conditions.js';

const PRIMITIVE_DEFAULTS = { int: 0, long: 0, short: 0, byte: 0, double: 0, float: 0, boolean: false };

const isBlank = (value) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

// "a.b[1]:Type.c" -> [{ name: 'a' }, { name: 'b', index: 1, type: 'Type' }, { name: 'c' }]; "[0].code" -> index first.
function segmentsOf(path) {
  const segments = [];
  const pattern = /([^.[\]:]+)?(?:\[\s*(?:"([^"]*)"|(\d+))\s*\])?(?::([\w$]+(?:\[\])*))?/y;
  let at = 0;
  const text = String(path).trim();
  while (at < text.length) {
    pattern.lastIndex = at;
    const match = pattern.exec(text);
    if (!match || match[0] === '') break;
    const [, name, key, index, type] = match;
    segments.push({
      name: name?.trim() ?? null,
      index: index !== undefined ? Number(index) : key !== undefined ? key : undefined,
      type: type ?? null,
    });
    at = pattern.lastIndex;
    if (text[at] === '.') at += 1;
  }
  return segments;
}

// ">table", ">table.field", ">table column", ">table.field column".
function referenceOf(cell) {
  // (The field a path: boxes[0]:Box.items.)
  const match = /^>\s*([\w$]+)(?:\.([\w.$[\]:"]+))?(?:\s+([\w$]+))?\s*$/.exec(String(cell ?? '').trim());
  return match ? { table: match[1], field: match[2] ?? null, column: match[3] ?? null } : null;
}

// The rows of a block where groups start: a new group at each row whose cell of a column is not inside a merge from
// above; for elements of lists (nested), blanks continue the group above and a new group starts at a change of value.
function groupsOf(range, column, cell, coveredFromAbove, nested = false) {
  const starts = [];
  for (let r = range.from; r < range.to; r += 1) {
    if (r === range.from) {
      starts.push(r);
      continue;
    }
    if (coveredFromAbove(r, column)) continue;
    const value = cell(r, column);
    if (nested && isBlank(value)) continue;
    if (nested && String(value) === String(cell(starts[starts.length - 1], column))) continue;
    starts.push(r);
  }
  return starts.map((from, i) => ({ from, to: starts[i + 1] ?? range.to }));
}

class RecordReader {
  // fields: the paths of the columns; references: their references (or null); rows: the rows of values; merges:
  // those of the rows of values (top 0 is the first row of values); typeOf(type, field): the type of a field.
  constructor({ fields, references = [], rows, merges = [], typeOf, resolve, constant = () => undefined }) {
    this.constant = constant;
    this.rows = rows;
    this.merges = merges;
    this.typeOf = typeOf;
    this.resolve = resolve;
    // The columns: a path, its reference, the columns it spans (a field written across merged columns).
    this.columns = [];
    for (let c = 0; c < fields.length; c += 1) {
      const field = fields[c];
      if (isBlank(field)) continue;
      const span = merges.find((merge) => merge.headerRow && merge.left === c);
      this.columns.push({
        column: c,
        last: span ? span.right : c,
        segments: segmentsOf(field),
        reference: referenceOf(references[c]),
      });
      if (span) c = span.right;
    }
  }

  cell(r, c) {
    return this.rows[r]?.[c] ?? null;
  }

  coveredFromAbove(r, c) {
    return this.merges.some(
      (merge) => !merge.headerRow && merge.left <= c && merge.right >= c && merge.top < r && merge.bottom >= r
    );
  }

  // The records: one for each group of rows of the first column (each row, without merges).
  // (Of a table with lists of objects, the matrix form: a blank first column, or the same key again, goes on with the
  // record above, as the elements of its lists do.)
  records(type) {
    const range = { from: 0, to: this.rows.length };
    const first = this.columns[0]?.column ?? 0;
    const matrix = this.columns.some(
      (column) =>
        column.segments.length > 1 &&
        Boolean(column.segments[0].type || String(this.typeOf(type, column.segments[0].name) ?? '').endsWith('[]'))
    );
    this.groups = groupsOf(
      range,
      first,
      (r, c) => this.cell(r, c),
      (r, c) => this.coveredFromAbove(r, c),
      matrix
    ).filter((group) => this.columns.some((column) => this.hasValue(column, group)));
    return this.groups.map((group) =>
      this.build(
        this.columns.map((column) => ({ ...column, rest: column.segments })),
        group,
        type
      )
    );
  }

  hasValue(column, group) {
    for (let r = group.from; r < group.to; r += 1) {
      for (let c = column.column; c <= column.last; c += 1) if (!isBlank(this.cell(r, c))) return true;
    }
    return false;
  }

  // The value of the cells of a column (in the first row of a group): typed, a reference resolved, an array of
  // merged columns.
  value(column, group, type) {
    if (column.last > column.column) {
      const element = type && type.endsWith('[]') ? type.slice(0, -2) : type;
      const cells = [];
      for (let c = column.column; c <= column.last; c += 1) cells.push(this.cell(group.from, c));
      if (cells.every(isBlank)) return null;
      // (References: each cell the key of a record of another table.)
      if (column.reference)
        return cells.filter((cell) => !isBlank(cell)).map((cell) => this.resolve(column.reference, cell));
      return cells.map((cell) => (isBlank(cell) ? null : valueOfType(cell, element)));
    }
    const raw = this.cell(group.from, column.column);
    if (isBlank(raw)) return null;
    // (A cell naming a constant of the book: its value.)
    const constant = this.constant(raw);
    if (constant !== undefined) return constant;
    if (column.reference) {
      const keys = type && type.endsWith('[]') && typeof raw === 'string' ? splitList(raw) : [raw];
      const found = keys.map((key) => this.resolve(column.reference, key));
      return type && type.endsWith('[]') ? found : found[0];
    }
    return valueOfType(raw, type);
  }

  // An object (or array, or value) of the columns over a group of rows, of a type.
  build(columns, group, type) {
    // this: the record is the value of the column.
    if (
      columns.length === 1 &&
      columns[0].rest.length === 1 &&
      columns[0].rest[0].name === 'this' &&
      columns[0].rest[0].index === undefined
    ) {
      return this.value(columns[0], group, type);
    }
    // (Lists are arrays; maps are Maps of their keys.)
    const isList = Boolean(type && /^(java\.util\.)?(List|ArrayList|Collection|Set)(<.*>)?$/.test(type));
    const isMap = Boolean(type && /^(java\.util\.)?(Map|HashMap|LinkedHashMap)(<.*>)?$/.test(type));
    const isArray = Boolean(type && type.endsWith('[]')) || isList;
    const result = isArray && columns.every((column) => column.rest[0]?.name === null) ? [] : {};
    // Columns by their first segment.
    const byField = new Map();
    for (const column of columns) {
      const [segment] = column.rest;
      if (!segment) continue;
      const key = `${segment.name ?? ''}`;
      if (!byField.has(key)) byField.set(key, []);
      byField.get(key).push(column);
    }
    for (const [name, group_] of byField) {
      if (name === '_PK_') continue;
      const fieldType = name
        ? (group_[0].rest[0].type ?? this.typeOf(type, name))
        : isArray && !isList
          ? type.slice(0, -2)
          : null;
      // name[i] (or [i]): elements by their index.
      const indexed = group_.filter((column) => column.rest[0].index !== undefined);
      const plain = group_.filter((column) => column.rest[0].index === undefined);
      if (indexed.length) {
        const target = name
          ? (result[name] ??=
              fieldType && !fieldType.endsWith('[]') && typeof indexed[0].rest[0].index === 'string' ? {} : [])
          : result;
        const elementType = fieldType && fieldType.endsWith('[]') ? fieldType.slice(0, -2) : name ? null : fieldType;
        const byIndex = new Map();
        for (const column of indexed) {
          const at = column.rest[0].index;
          if (!byIndex.has(at)) byIndex.set(at, []);
          byIndex.get(at).push({ ...column, rest: column.rest.slice(1) });
        }
        for (const [at, inner] of byIndex) {
          // (An element of no cell is none: a car of blank cells is no car.)
          if (!inner.some((column) => this.hasValue(column, group))) continue;
          const value = inner.every((column) => !column.rest.length)
            ? this.value(inner[0], group, elementType ?? (name ? null : type?.slice(0, -2)))
            : this.build(inner, group, elementType);
          if (value === null && !inner.every((column) => this.hasValue(column, group))) continue;
          target[at] = value;
        }
        // (Gaps: empty, or the default of a primitive element, 0 of int[].)
        const gap = PRIMITIVE_DEFAULTS[elementType] ?? null;
        if (Array.isArray(target))
          for (let i = 0; i < target.length; i += 1) if (target[i] === undefined) target[i] = gap;
        // (A field of a Map type: a Map of its keys.)
        if (
          name &&
          !Array.isArray(target) &&
          /^(java\.util\.)?(Map|HashMap|LinkedHashMap)(<.*>)?$/.test(this.typeOf(type, name) ?? '')
        ) {
          result[name] = new Map(Object.entries(target));
        }
      }
      if (!plain.length || !name) continue;
      const rest = plain.map((column) => ({ ...column, rest: column.rest.slice(1) }));
      if (rest.every((column) => !column.rest.length)) {
        // (Columns of the same field: an element of its array each.)
        if (rest.length > 1) {
          const element = fieldType ? fieldType.replace(/\[\]$/, '') : null;
          result[name] = rest.map((column) => this.value(column, group, element)).filter((value) => value !== null);
        } else if (
          fieldType &&
          fieldType.endsWith('[]') &&
          group.to - group.from > 1 &&
          rest[0].last === rest[0].column &&
          !rest[0].reference
        ) {
          // (A list of values over the rows of the record: members Ann, Bob.)
          const values = [];
          for (let r = group.from; r < group.to; r += 1) {
            if (this.coveredFromAbove(r, rest[0].column)) continue;
            const value = this.value(rest[0], { from: r, to: r + 1 }, fieldType);
            if (Array.isArray(value)) values.push(...value);
            else if (value !== null) values.push(value);
          }
          result[name] = values.length ? values : null;
        } else result[name] = this.value(rest[0], group, fieldType);
        continue;
      }
      // A list of objects (name:Type, or a field of an array type): an element for each group of rows of its first
      // column; else one object of the same rows.
      const list = Boolean(plain[0].rest[0].type) || Boolean(fieldType && fieldType.endsWith('[]'));
      const elementType = fieldType ? fieldType.replace(/\[\]$/, '') : null;
      if (list) {
        const first = rest[0].column;
        const elements = groupsOf(
          group,
          first,
          (r, c) => this.cell(r, c),
          (r, c) => this.coveredFromAbove(r, c),
          true
        )
          .filter((inner) => rest.some((column) => this.hasValue(column, inner)))
          .map((inner) => this.build(rest, inner, elementType));
        result[name] = elements;
      } else if (rest.some((column) => this.hasValue(column, group))) {
        result[name] = this.build(rest, group, elementType);
      }
    }
    return isMap && !Array.isArray(result) ? new Map(Object.entries(result)) : result;
  }
}

export { RecordReader, segmentsOf, referenceOf };
