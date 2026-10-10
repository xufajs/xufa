// The ranges of PostgreSQL (DataTypes.RANGE), as Sequelize writes and reads them: [lower, upper] (inclusive the lower
// bound by default), bounds as { value, inclusive }, [] for an empty range, Infinity for unbounded ones; read back as
// [{ value, inclusive }, { value, inclusive }].

function stringifyBound(bound) {
  if (bound === null || bound === undefined) return '';
  if (bound === Infinity || bound === -Infinity) return bound.toString().toLowerCase();
  return JSON.stringify(bound);
}

function stringifyRange(data) {
  if (data === null || data === undefined) return null;
  if (typeof data === 'string') return data;
  if (!Array.isArray(data)) throw new Error('range must be an array');
  if (!data.length) return 'empty';
  if (data.length !== 2) throw new Error('range array length must be 0 (empty) or 2 (lower and upper bounds)');
  let inclusive;
  if (Object.hasOwn(data, 'inclusive')) {
    if (data.inclusive === false) inclusive = [false, false];
    else if (!data.inclusive) inclusive = [true, false];
    else if (data.inclusive === true) inclusive = [true, true];
    else inclusive = [...data.inclusive];
  } else inclusive = [true, false];
  const bounds = data.map((value, index) => {
    if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
      if (Object.hasOwn(value, 'inclusive')) inclusive[index] = Boolean(value.inclusive);
      if (Object.hasOwn(value, 'value')) return value.value;
    }
    return value;
  });
  return `${inclusive[0] ? '[' : '('}${stringifyBound(bounds[0])},${stringifyBound(bounds[1])}${inclusive[1] ? ']' : ')'}`;
}

// The parser of the bounds of a subtype (by the key of its DataType).
function boundParser(subtype) {
  switch (subtype) {
    case 'INTEGER':
    case 'BIGINT':
      return (text) => Number.parseInt(text, 10);
    case 'DATE':
      return (text) => new Date(text.replace(/^"|"$/g, ''));
    default:
      return (text) => text.replace(/^"|"$/g, '');
  }
}

// `subtype`: the key of the DataType of the bounds, or a function that parses them.
function parseRange(value, subtype) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  if (value === 'empty') return [];
  const parts = value.substring(1, value.length - 1).split(',', 2);
  if (parts.length !== 2) return value;
  const parse = typeof subtype === 'function' ? (text) => subtype(text.replace(/^"|"$/g, '')) : boundParser(subtype);
  return parts.map((text, index) => {
    let bound = null;
    if (text === 'infinity') bound = Infinity;
    else if (text === '-infinity') bound = -Infinity;
    else if (text) bound = parse(text);
    return { value: bound, inclusive: index === 0 ? value[0] === '[' : value[value.length - 1] === ']' };
  });
}

// A date as Sequelize writes it ('2000-02-01 02:00:00.000 +02:00'), in a timezone ('+02:00').
function formatDate(value, timezone = '+00:00') {
  const date = value instanceof Date ? value : new Date(value);
  const match = /^([+-])(\d{2}):?(\d{2})$/.exec(timezone);
  const offset = match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
  const shifted = new Date(date.getTime() + offset * 60000);
  const text = shifted.toISOString().replace('T', ' ').replace('Z', '');
  return `${text} ${match ? `${match[1]}${match[2]}:${match[3]}` : '+00:00'}`;
}

const CASTS = { INTEGER: 'int4', BIGINT: 'int8', DECIMAL: 'numeric', DATEONLY: 'date', DATE: 'timestamptz' };

// The literal of SQL of a range (or of a value of its subtype, cast), as the RANGE of Sequelize writes it.
function rangeLiteral(value, subtype, options = {}) {
  const bound = (item) => {
    if (item instanceof Date) {
      if (subtype === 'DATEONLY') return item.toISOString().slice(0, 10);
      return formatDate(item, options.timezone);
    }
    return item;
  };
  if (!Array.isArray(value)) {
    return `'${String(bound(value)).replace(/'/g, "''")}'::${CASTS[subtype] || 'int4'}`;
  }
  const bounds = value.map((item) =>
    item !== null && typeof item === 'object' && !(item instanceof Date) && Object.hasOwn(item, 'value')
      ? { ...item, value: bound(item.value) }
      : bound(item)
  );
  if (Object.hasOwn(value, 'inclusive')) bounds.inclusive = value.inclusive;
  return `'${stringifyRange(bounds).replace(/'/g, "''")}'`;
}

// The type of PostgreSQL of a range of a subtype.
function rangeSqlType(subtype) {
  return (
    { INTEGER: 'INT4RANGE', BIGINT: 'INT8RANGE', DECIMAL: 'NUMRANGE', DATE: 'TSTZRANGE', DATEONLY: 'DATERANGE' }[
      subtype
    ] || 'INT4RANGE'
  );
}

export { stringifyRange, parseRange, rangeSqlType, rangeLiteral, formatDate };
