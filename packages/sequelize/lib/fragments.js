// Fragments of SQL of Sequelize (literal(), fn(), col()) as Raw of @xufa/orm: their columns refer to the table of the
// model in the query ("User"."name" in a literal is the column of the model User, wherever its table is).
import { Raw } from '@xufa/orm';
import { NotSupportedError } from './errors.js';
import { Op } from './operators.js';

const quote = (name) => `"${String(name).replace(/"/g, '""')}"`;

// A literal with the names of the model ("User".x, `User`.x, User.x, by its name or its table) as its table.
function literalSql(context, sql) {
  const { model } = context;
  let text = String(sql);
  [model.name, model.tableName].forEach((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`(?:"${escaped}"|\`${escaped}\`|\\b${escaped}\\b)\\.`, 'g'), `${Raw.TABLE}.`);
  });
  return text;
}

// The column of an attribute of the model (or 'Model.attribute'): the table of the model and its field.
function columnSql(context, name) {
  const { model } = context;
  let attribute = name;
  if (name.includes('.')) {
    const [owner, rest] = [name.slice(0, name.lastIndexOf('.')), name.slice(name.lastIndexOf('.') + 1)];
    if (owner !== model.name && owner !== model.tableName)
      throw new NotSupportedError(`Columns of includes in functions (${name})`);
    attribute = rest;
  }
  if (context.base) throw new NotSupportedError('Functions and literals in conditions of includes');
  const definition = model.rawAttributes[attribute];
  return definition ? `${Raw.TABLE}.${quote(definition.field)}` : quote(attribute);
}

const COMPARISONS = new Map([
  [Op.eq, '='],
  [Op.ne, '!='],
  [Op.gt, '>'],
  [Op.gte, '>='],
  [Op.lt, '<'],
  [Op.lte, '<='],
]);

const isPlain = (value) =>
  Boolean(value) &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !isFragment(value);

// A condition of attributes as SQL ({ engines: 1 }, { [Op.or]: { engines: { [Op.gt]: 1 }, wings: 4 } }), for fragments
// that take one (cast({ ... }, 'int')): comparisons, IN, IS NULL, and, or and not.
function conditionSql(context, where) {
  const params = [];
  const value = (operand) => {
    if (isFragment(operand)) {
      const inner = fragmentOf(context, operand);
      params.push(...inner.params);
      return inner.sql;
    }
    params.push(operand instanceof Date ? operand.toISOString() : operand);
    return '?';
  };
  const group = (items, joiner) => {
    const parts = items.map(node).filter(Boolean);
    return parts.length ? `(${parts.join(joiner)})` : '';
  };
  const entries = (object) => [
    ...Object.keys(object).map((key) => ({ [key]: object[key] })),
    ...Object.getOwnPropertySymbols(object).map((key) => ({ [key]: object[key] })),
  ];
  const attribute = (name, condition) => {
    const column = columnSql(context, name);
    if (condition === null) return `${column} IS NULL`;
    if (Array.isArray(condition)) return `${column} IN (${condition.map(value).join(', ')})`;
    if (!isPlain(condition)) return `${column} = ${value(condition)}`;
    const parts = Object.getOwnPropertySymbols(condition).map((op) => {
      const operand = condition[op];
      if (COMPARISONS.has(op)) {
        if (operand === null) return `${column} ${op === Op.ne ? 'IS NOT' : 'IS'} NULL`;
        return `${column} ${COMPARISONS.get(op)} ${value(operand)}`;
      }
      if (op === Op.in || op === Op.notIn) {
        return `${column} ${op === Op.in ? 'IN' : 'NOT IN'} (${[].concat(operand).map(value).join(', ')})`;
      }
      if (op === Op.is) return `${column} IS ${operand === null ? 'NULL' : value(operand)}`;
      if (op === Op.not) return operand === null ? `${column} IS NOT NULL` : `${column} != ${value(operand)}`;
      throw new NotSupportedError(`The operator ${String(op)} in conditions inside functions`);
    });
    return parts.length > 1 ? `(${parts.join(' AND ')})` : parts[0];
  };
  function node(item) {
    if (Array.isArray(item)) return group(item, ' AND ');
    if (!isPlain(item)) throw new NotSupportedError('Conditions inside functions of this kind');
    const parts = entries(item).map((entry) => {
      const [key] = [...Object.keys(entry), ...Object.getOwnPropertySymbols(entry)];
      const condition = entry[key];
      if (key === Op.and) return group(Array.isArray(condition) ? condition : entries(condition), ' AND ');
      if (key === Op.or) return group(Array.isArray(condition) ? condition : entries(condition), ' OR ');
      if (key === Op.not) return `NOT ${node(condition)}`;
      if (typeof key === 'symbol')
        throw new NotSupportedError(`The operator ${String(key)} in conditions inside functions`);
      return attribute(key, condition);
    });
    return parts.length > 1 ? `(${parts.join(' AND ')})` : parts[0] || '';
  }
  return { sql: node(where) || '1 = 1', params };
}

// The SQL and parameters of a fragment: literal, fn (with col, literal, fn and values as arguments) or col.
function fragmentOf(context, value) {
  if (value && value.xufaLiteral !== undefined) return { sql: literalSql(context, value.xufaLiteral), params: [] };
  if (value && value.xufaCol !== undefined) return { sql: columnSql(context, value.xufaCol), params: [] };
  if (value && value.xufaCast) {
    // cast() of a condition ({ engines: 1 }): the condition as SQL (a boolean), as Sequelize writes it.
    const inner =
      fragmentOf(context, value.value) ||
      (isPlain(value.value) ? conditionSql(context, value.value) : { sql: '?', params: [value.value] });
    return { sql: `CAST(${inner.sql} AS ${String(value.type).toUpperCase()})`, params: inner.params };
  }
  if (value && value.xufaFn !== undefined) {
    const params = [];
    const args = value.args.map((arg) => {
      if (
        arg &&
        (arg.xufaLiteral !== undefined || arg.xufaCol !== undefined || arg.xufaFn !== undefined || arg.xufaCast)
      ) {
        const inner = fragmentOf(context, arg);
        params.push(...inner.params);
        return inner.sql;
      }
      // A condition as an argument (fn('SUM', { engines: 1 })): its SQL.
      if (isPlain(arg)) {
        const inner = conditionSql(context, arg);
        params.push(...inner.params);
        return inner.sql;
      }
      params.push(arg instanceof Date ? arg.toISOString() : arg);
      return '?';
    });
    return { sql: `${value.xufaFn}(${args.join(', ')})`, params };
  }
  return null;
}

function isFragment(value) {
  return Boolean(value && (value.xufaLiteral !== undefined || value.xufaFn !== undefined || value.xufaCast));
}

export { Raw, literalSql, columnSql, fragmentOf, isFragment };
