// Translates the conditions of Sequelize (where objects with the symbols of Op) into those of @xufa/orm (objects with
// lookups in their keys, and Q for and/or/not), keeping the semantics of SQL: != and NOT IN are false for NULLs.
//
//   { name: 'Ada', pages: { [Op.gt]: 100 }, [Op.or]: [{ a: 1 }, { b: 2 }] }
//   -> and({ name: 'Ada', pages__gt: 100 }, or({ a: 1 }, { b: 2 }))
const { and, or, not, F } = require('@xufa/orm');
const { Op } = require('./operators');
const { NotSupportedError } = require('./errors');
const { isPlainObject } = require('./utils');
const { stringifyRange, rangeSqlType } = require('./range');
const { Raw, fragmentOf, isFragment, columnSql } = require('./fragments');
const { sqlTypeOf } = require('./sql-types');

const SQL_COMPARISONS = new Map([
  [Op.eq, '='],
  [Op.ne, '!='],
  [Op.gt, '>'],
  [Op.gte, '>='],
  [Op.lt, '<'],
  [Op.lte, '<='],
  [Op.like, 'LIKE'],
  [Op.notLike, 'NOT LIKE'],
  [Op.iLike, 'ILIKE'],
  [Op.notILike, 'NOT ILIKE'],
]);

// The operators of ranges and of JSON values (PostgreSQL).
const PG_OPERATORS = new Map([
  [Op.contains, '@>'],
  [Op.contained, '<@'],
  [Op.overlap, '&&'],
  [Op.adjacent, '-|-'],
  [Op.strictLeft, '<<'],
  [Op.strictRight, '>>'],
  [Op.noExtendRight, '&<'],
  [Op.noExtendLeft, '&>'],
]);

const SUBTYPE_CASTS = {
  INTEGER: 'integer',
  BIGINT: 'bigint',
  DECIMAL: 'numeric',
  DATE: 'timestamptz',
  DATEONLY: 'date',
};

// A comparison of a fragment (fn, literal) with a value or another fragment.
function fragmentComparison(context, left, op, value) {
  const sql = SQL_COMPARISONS.get(op);
  if (value === null && (op === Op.eq || op === Op.is)) return Raw(`${left.sql} IS NULL`, left.params);
  if (value === null && (op === Op.ne || op === Op.not)) return Raw(`${left.sql} IS NOT NULL`, left.params);
  if (op === Op.in || op === Op.notIn) {
    const list = [].concat(value);
    if (list.length === 0) return op === Op.in ? Raw('1 = 0') : Raw('1 = 1');
    return Raw(`${left.sql} ${op === Op.in ? 'IN' : 'NOT IN'} (${list.map(() => '?').join(', ')})`, [
      ...left.params,
      ...list,
    ]);
  }
  if (!sql) throw new NotSupportedError(`The operator ${String(op)} with functions and literals`);
  const right = fragmentOf(context, value);
  if (right) return Raw(`${left.sql} ${sql} ${right.sql}`, [...left.params, ...right.params]);
  return Raw(`${left.sql} ${sql} ?`, [...left.params, value instanceof Date ? value.toISOString() : value]);
}

// The operators of PostgreSQL on ranges and JSON values (and arrays, which are JSON here).
function pgOperator(context, path, op, value) {
  if (context.dialect !== 'postgres') throw new NotSupportedError(`The operator ${String(op)} in ${context.dialect}`);
  const attribute = context.model.rawAttributes[path];
  if (!attribute || path.includes('__')) throw new NotSupportedError(`The operator ${String(op)} on ${path}`);
  const column = columnSql(context, path);
  const sql = PG_OPERATORS.get(op);
  if (attribute.type.kind === 'range') {
    const { subtype } = attribute.type.options;
    if (Array.isArray(value)) return Raw(`${column} ${sql} ?::${rangeSqlType(subtype)}`, [stringifyRange(value)]);
    return Raw(`${column} ${sql} ?::${SUBTYPE_CASTS[subtype] || 'integer'}`, [
      value instanceof Date ? value.toISOString() : value,
    ]);
  }
  // Arrays (native in PostgreSQL): @>, <@ and && with an array of the type of the column.
  if (attribute.type.key === 'ARRAY') {
    const arrayType = sqlTypeOf(attribute.type, 'postgres', {
      table: context.model.xufaEnumTable(),
      column: attribute.field,
    });
    return Raw(`${column} ${sql} ?::${arrayType}`, [[].concat(value)]);
  }
  if (attribute.type.kind === 'json') {
    if (op === Op.overlap) return Raw(`${column}::jsonb ?| ?::text[]`, [[].concat(value).map(String)]);
    if (op === Op.contains || op === Op.contained)
      return Raw(`${column}::jsonb ${sql} ?::jsonb`, [JSON.stringify(value)]);
  }
  throw new NotSupportedError(`The operator ${String(op)} on ${attribute.type.key}`);
}

const COMPARISONS = new Map([
  [Op.gt, 'gt'],
  [Op.gte, 'gte'],
  [Op.lt, 'lt'],
  [Op.lte, 'lte'],
]);

// Values that are compared as they are (not objects of operators).
function isValue(value) {
  return value === null || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value);
}

// A reference to another column (Sequelize.col('name'), or { [Op.col]: 'name' }): an F of @xufa/orm.
function columnRef(context, value) {
  if (value && value.xufaCol) return F(context.path(value.xufaCol));
  if (value && typeof value === 'object' && Object.getOwnPropertySymbols(value).includes(Op.col)) {
    return F(context.path(value[Op.col]));
  }
  return undefined;
}

// The conditions of the operators of one attribute (its path in @xufa/orm).
// `json`: the attribute is json, so the keys of an object are a path inside its values ({ data: { owner: 'x' } }).
// A key inside json conditions ({ data: { 'owner.name': x, 'level::integer': y, 'tags[0]': z } }) as a path: the
// cast after :: (checked, as Sequelize does) is left out, as the type of the value gives it.
const CAST = /^[A-Za-z][A-Za-z0-9_ ]*(\(\d+(,\s*\d+)?\))?(\[\])?$/;
function jsonKey(key) {
  const [name, cast] = key.split('::');
  if (cast !== undefined && !CAST.test(cast.trim())) throw new Error(`Invalid cast type: ${cast}`);
  return name
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
    .join('__');
}

function attributeConditions(context, path, value, json = false) {
  if (Array.isArray(value)) return { [`${path}__in`]: value };
  if (isValue(value)) return { [path]: value };
  if (value.xufaCol) return { [path]: columnRef(context, value) };
  if (isFragment(value))
    return fragmentComparison(context, { sql: columnSql(context, path), params: [] }, Op.eq, value);
  const keys = Object.keys(value);
  if (keys.length && !json) throw new NotSupportedError(`Conditions inside attributes that are not JSON (${path})`);
  const items = keys.map((key) => attributeConditions(context, `${path}__${jsonKey(key)}`, value[key], true));
  const symbols = Object.getOwnPropertySymbols(value);
  for (let i = 0; i < symbols.length; i += 1) {
    items.push(operatorCondition(context, path, symbols[i], value[symbols[i]]));
  }
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];
  return items.every(isPlainObject) ? Object.assign({}, ...items) : and(...items);
}

const COMPARATORS = {
  '=': Op.eq,
  '!=': Op.ne,
  '<>': Op.ne,
  '>': Op.gt,
  '>=': Op.gte,
  '<': Op.lt,
  '<=': Op.lte,
  LIKE: Op.like,
  'NOT LIKE': Op.notLike,
  ILIKE: Op.iLike,
  'NOT ILIKE': Op.notILike,
  IN: Op.in,
  'NOT IN': Op.notIn,
  IS: Op.is,
  'IS NOT': Op.not,
};

// sequelize.where(attribute | col() | json(), [comparator,] value).
function whereCondition(context, { attribute, comparator, value }) {
  let path;
  if (typeof attribute === 'string') path = context.path(attribute);
  else if (attribute && attribute.xufaCol) path = context.path(attribute.xufaCol);
  else if (attribute && attribute.xufaJson) path = context.path(attribute.xufaJson);
  let logic = value;
  let op = comparator;
  if (logic === undefined) {
    logic = comparator;
    op = Op.eq;
  }
  if (typeof op === 'string') {
    op = COMPARATORS[op.toUpperCase()];
    if (!op) throw new NotSupportedError(`The comparator ${comparator} of sequelize.where()`);
  }
  // sequelize.where(fn(...) | literal(...), [op,] value): a fragment compared.
  if (path === undefined) {
    const left = fragmentOf(context, attribute);
    if (!left) throw new NotSupportedError('sequelize.where() of this expression');
    if (logic && typeof logic === 'object' && !isFragment(logic) && !Array.isArray(logic) && !(logic instanceof Date)) {
      const items = Object.getOwnPropertySymbols(logic).map((symbol) =>
        fragmentComparison(context, left, symbol, logic[symbol])
      );
      return items.length === 1 ? items[0] : and(...items);
    }
    return fragmentComparison(context, left, op, logic);
  }
  if (
    op === Op.eq &&
    logic !== null &&
    typeof logic === 'object' &&
    !Array.isArray(logic) &&
    !(logic instanceof Date)
  ) {
    return attributeConditions(context, path, logic, Boolean(attribute && attribute.xufaJson));
  }
  return operatorCondition(context, path, op, logic);
}

// The value compared, or an F when it is a column.
function operand(context, value) {
  const ref = columnRef(context, value);
  return ref === undefined ? value : ref;
}

// x != v: false for NULLs, as in SQL.
function notEqual(path, condition) {
  return and({ [`${path}__isnull`]: false }, not(condition));
}

function likeCondition(path, pattern, lookup, negated) {
  if (pattern && typeof pattern === 'object') throw new NotSupportedError('LIKE with ANY or ALL');
  const condition = { [`${path}__${lookup}`]: pattern };
  return negated ? notEqual(path, condition) : condition;
}

function operatorCondition(context, path, op, value) {
  // Comparisons with fragments, and with ANY or ALL of a list.
  if (isFragment(value) && SQL_COMPARISONS.has(op)) {
    return fragmentComparison(context, { sql: columnSql(context, path), params: [] }, op, value);
  }
  if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
    if (value[Op.any] !== undefined || value[Op.all] !== undefined) {
      const list = value[Op.any] !== undefined ? value[Op.any] : value[Op.all];
      if (list && list[Op.values]) throw new NotSupportedError('Op.values');
      if (op === Op.eq && value[Op.any] !== undefined) return { [`${path}__in`]: list };
      if (op === Op.ne && value[Op.all] !== undefined) return operatorCondition(context, path, Op.notIn, list);
      const items = list.map((item) => operatorCondition(context, path, op, item));
      return value[Op.any] !== undefined ? or(...items) : and(...items);
    }
  }
  if (PG_OPERATORS.has(op)) return pgOperator(context, path, op, value);
  const comparison = COMPARISONS.get(op);
  if (comparison) return { [`${path}__${comparison}`]: operand(context, value) };
  switch (op) {
    case Op.eq:
      return { [path]: operand(context, value) };
    case Op.ne:
      return value === null ? { [`${path}__isnull`]: false } : notEqual(path, { [path]: operand(context, value) });
    case Op.is:
      return value === null ? { [`${path}__isnull`]: true } : { [path]: value };
    case Op.not:
      if (value === null) return { [`${path}__isnull`]: false };
      // IS NOT TRUE is true for NULLs.
      if (typeof value === 'boolean') return not({ [path]: value });
      if (!isValue(value) && !value.xufaCol) return not(attributeConditions(context, path, value));
      return notEqual(path, { [path]: operand(context, value) });
    case Op.in:
      return { [`${path}__in`]: [].concat(value) };
    case Op.notIn:
      return value.length === 0 ? and() : notEqual(path, { [`${path}__in`]: value });
    case Op.between:
      return { [`${path}__range`]: value };
    case Op.notBetween:
      return notEqual(path, { [`${path}__range`]: value });
    case Op.like:
      return likeCondition(path, value, 'like', false);
    case Op.notLike:
      return likeCondition(path, value, 'like', true);
    case Op.iLike:
      return likeCondition(path, value, 'ilike', false);
    case Op.notILike:
      return likeCondition(path, value, 'ilike', true);
    case Op.startsWith:
      return { [`${path}__startswith`]: value };
    case Op.endsWith:
      return { [`${path}__endswith`]: value };
    case Op.substring:
      return { [`${path}__contains`]: value };
    case Op.regexp:
      return { [`${path}__regex`]: value };
    case Op.iRegexp:
      return { [`${path}__iregex`]: value };
    case Op.notRegexp:
      return notEqual(path, { [`${path}__regex`]: value });
    case Op.notIRegexp:
      return notEqual(path, { [`${path}__iregex`]: value });
    case Op.and:
      return and(...[].concat(value).map((item) => attributeConditions(context, path, item)));
    case Op.or:
      if (Array.isArray(value)) return or(...value.map((item) => attributeConditions(context, path, item)));
      return or(
        ...Object.getOwnPropertySymbols(value).map((symbol) => operatorCondition(context, path, symbol, value[symbol]))
      );
    default:
      throw new NotSupportedError(`The operator ${String(op)}`);
  }
}

// Translates a where of a model. `context.path(name)` gives the path in @xufa/orm of an attribute (or of
// '$assoc.attribute$').
// A json path in PostgreSQL's arrows (emergency_contact->>'name', data->'a'->>'b') as a dotted path.
function arrowPath(path) {
  if (!path.includes('->')) return path;
  return path
    .split(/->>?/)
    .map((part) => part.trim().replace(/^'(.*)'$/, '$1'))
    .join('.');
}

function translateWhere(context, where) {
  if (where === undefined || where === null) return null;
  if (where.xufaWhere) return whereCondition(context, where);
  // sequelize.json('data.owner', value), or json({ data: { owner: value } }).
  if (where.xufaJson !== undefined) {
    if (where.xufaJson === null) return translateWhere(context, where.conditions);
    if (where.value === undefined) throw new NotSupportedError('sequelize.json() without a value in conditions');
    // SQL of its own (json('json_extract(data, "$.a")', value)): that SQL compared with the value.
    if (where.xufaJson.includes('(')) {
      return fragmentComparison(context, fragmentOf(context, { xufaLiteral: where.xufaJson }), Op.eq, where.value);
    }
    return attributeConditions(context, context.path(arrowPath(where.xufaJson)), where.value, true);
  }
  if (where.xufaLiteral !== undefined || where.xufaFn !== undefined) {
    const { sql, params } = fragmentOf(context, where);
    return Raw(sql, params);
  }
  if (Array.isArray(where)) {
    if (typeof where[0] === 'string') {
      throw new Error('Support for literal replacements in the `where` object has been removed.');
    }
    return and(...where.map((item) => translateWhere(context, item)).filter(Boolean));
  }
  // A string is SQL (as a literal).
  if (typeof where === 'string') return Raw(fragmentOf(context, { xufaLiteral: where }).sql, []);
  // A number is the primary key (as Sequelize takes it).
  if (typeof where === 'number' || typeof where === 'bigint') {
    return translateWhere(context, { [context.model.primaryKeyAttribute]: where });
  }
  if (typeof where !== 'object') throw new NotSupportedError('Conditions that are not objects');
  // Equalities and simple comparisons stay one object (the most common conditions).
  let simple = null;
  const items = [];
  const keys = Object.keys(where);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const value = where[key];
    if (value === undefined) {
      throw new Error(`WHERE parameter "${key}" has invalid "undefined" value`);
    }
    const path = context.path(key);
    // A range (an array of bounds) is compared as a whole, and so is an ARRAY (= ARRAY[...]).
    const definition = context.model.rawAttributes[key];
    const isArray = Boolean(definition && definition.type && definition.type.key === 'ARRAY');
    let condition;
    if (context.isRange(key) && Array.isArray(value)) condition = { [path]: stringifyRange(value) };
    else if (isArray && Array.isArray(value)) condition = { [path]: value };
    // An hstore equals an object as a whole ({ utilityBelt: { grapplingHook: true } }), as Sequelize compares it.
    else if (
      definition &&
      definition.type &&
      definition.type.kind === 'hstore' &&
      isPlainObject(value) &&
      Object.getOwnPropertySymbols(value).length === 0
    ) {
      condition = { [path]: value };
    } else condition = attributeConditions(context, path, value, key.includes('.') || context.isJson(key));
    if (!condition) continue;
    if (isPlainObject(condition)) {
      if (simple === null) simple = {};
      Object.assign(simple, condition);
    } else items.push(condition);
  }
  const symbols = Object.getOwnPropertySymbols(where);
  for (let i = 0; i < symbols.length; i += 1) {
    const op = symbols[i];
    const value = where[op];
    if (op === Op.and)
      items.push(
        and(
          ...[]
            .concat(value)
            .map((item) => translateWhere(context, item))
            .filter(Boolean)
        )
      );
    else if (op === Op.or) {
      const children = Array.isArray(value)
        ? value.map((item) => translateWhere(context, item))
        : Object.keys(value).map((key) => translateWhere(context, { [key]: value[key] }));
      items.push(or(...children.filter(Boolean)));
    } else if (op === Op.not) items.push(not(translateWhere(context, value)));
    else throw new NotSupportedError(`The operator ${String(op)} at the top of conditions`);
  }
  if (items.length === 0) return simple;
  if (simple) items.unshift(simple);
  return items.length === 1 ? items[0] : and(...items);
}

module.exports = { translateWhere };
