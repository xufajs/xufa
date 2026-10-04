// Raw queries: the types of Sequelize, the replacements (? and :name) and the binds ($1 and $name).

const QueryTypes = {
  SELECT: 'SELECT',
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  BULKUPDATE: 'BULKUPDATE',
  BULKDELETE: 'BULKDELETE',
  DELETE: 'DELETE',
  UPSERT: 'UPSERT',
  VERSION: 'VERSION',
  SHOWTABLES: 'SHOWTABLES',
  SHOWINDEXES: 'SHOWINDEXES',
  DESCRIBE: 'DESCRIBE',
  RAW: 'RAW',
  FOREIGNKEYS: 'FOREIGNKEYS',
  SHOWCONSTRAINTS: 'SHOWCONSTRAINTS',
};

// The parts of SQL that are not code (strings, quoted names, comments): replacements are not looked for in them.
function scan(sql, onCode) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const char = sql[i];
    if (char === "'" || char === '"' || char === '`') {
      let end = i + 1;
      while (end < sql.length) {
        if (sql[end] === char) {
          if (sql[end + 1] === char) end += 2;
          else break;
        } else end += 1;
      }
      out += sql.slice(i, end + 1);
      i = end + 1;
    } else if (char === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? sql.length : end;
      out += sql.slice(i, stop);
      i = stop;
    } else if (char === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      out += sql.slice(i, stop);
      i = stop;
    } else {
      const consumed = onCode(sql, i);
      if (consumed) {
        out += consumed.text;
        i += consumed.length;
      } else {
        out += char;
        i += 1;
      }
    }
  }
  return out;
}

// A value of a replacement as SQL (as Sequelize writes them): lists as lists, lists in lists as tuples.
function escapeValue(value, dialect, nested = false) {
  if (value === null || value === undefined) return 'NULL';
  if (value && value.xufaLiteral !== undefined) return value.xufaLiteral;
  if (Array.isArray(value)) {
    const items = value.map((item) => escapeValue(item, dialect, true)).join(', ');
    return nested ? `(${items})` : items;
  }
  if (typeof value === 'boolean') return dialect === 'sqlite' ? (value ? '1' : '0') : value ? 'true' : 'false';
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : `'${value}'`;
  if (Buffer.isBuffer(value)) {
    return dialect === 'postgres' ? `E'\\\\x${value.toString('hex')}'` : `X'${value.toString('hex')}'`;
  }
  const text =
    value instanceof Date ? value.toISOString() : typeof value === 'object' ? JSON.stringify(value) : String(value);
  const clean = text.replace(/\0/g, '').replace(/'/g, "''");
  // Backslashes are escaped in PostgreSQL (E'...'), whatever standard_conforming_strings is.
  if (dialect === 'postgres' && clean.includes('\\')) return `E'${clean.replace(/\\/g, '\\\\')}'`;
  return `'${clean}'`;
}

// A value of a bind as the database takes it (SQLite has no booleans nor dates).
function bindValue(value, dialect) {
  if (dialect !== 'sqlite') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object' && !Buffer.isBuffer(value) && !ArrayBuffer.isView(value)) {
    return JSON.stringify(value);
  }
  return value;
}

const isPlainObject = (value) => {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

// As Sequelize: replacements (? and :name) are written in the SQL, escaped; binds ($1 and $name, anywhere in the
// text, $$ being $) are parameters of the database: $n in PostgreSQL, named ($name) in SQLite.
function formatQuery(sql, options, dialect) {
  const { replacements, bind } = options;
  if (replacements !== undefined && replacements !== null) {
    if (!Array.isArray(replacements) && !isPlainObject(replacements)) {
      throw new Error(
        `"replacements" must be an array or a plain object, but received ${JSON.stringify(replacements)} instead.`
      );
    }
    let index = 0;
    const query = scan(sql, (text, i) => {
      const char = text[i];
      if (Array.isArray(replacements) && char === '?') {
        const value = replacements[index];
        index += 1;
        return { text: escapeValue(value, dialect), length: 1 };
      }
      if (!Array.isArray(replacements) && char === ':' && text[i - 1] !== ':' && /[A-Za-z_]/.test(text[i + 1] || '')) {
        const name = /^[A-Za-z_]\w*/.exec(text.slice(i + 1))[0];
        if (!(name in replacements))
          throw new Error(`Named replacement ":${name}" has no entry in the replacement map.`);
        return { text: escapeValue(replacements[name], dialect), length: name.length + 1 };
      }
      return null;
    });
    return { query, params: [] };
  }
  if (bind !== undefined) {
    const list = Array.isArray(bind);
    const object = !list && bind !== null && typeof bind === 'object' && !(bind instanceof Date);
    const params = [];
    const named = {};
    const positions = new Map();
    const query = sql.replace(/\$(\$|\w+)/g, (match, key, offset) => {
      if (/\w/.test(sql[offset - 1] || '')) return match;
      if (key === '$') return '$';
      let value;
      let found = false;
      if (list && /^[1-9]\d*$/.test(key) && Number(key) - 1 < bind.length) {
        value = bind[Number(key) - 1];
        found = true;
      } else if (object && !/^\d*$/.test(key) && Object.hasOwn(bind, key)) {
        value = bind[key];
        found = true;
      }
      if (!found || value === undefined) {
        throw new Error(`Named bind parameter "${match}" has no value in the given object.`);
      }
      if (dialect === 'sqlite') {
        named[match] = bindValue(value, dialect);
        return match;
      }
      // The same bind is the same parameter in PostgreSQL.
      if (!positions.has(key)) {
        params.push(value);
        positions.set(key, params.length);
      }
      return `$${positions.get(key)}`;
    });
    return { query, params: dialect === 'sqlite' ? (Object.keys(named).length ? [named] : []) : params };
  }
  return { query: sql, params: [] };
}

// Rows with keys of dots ('user.name') as nested objects ({ user: { name } }).
function nestRow(row) {
  const result = {};
  Object.keys(row).forEach((key) => {
    const parts = key.split('.');
    let target = result;
    for (let i = 0; i < parts.length - 1; i += 1) {
      if (!target[parts[i]] || typeof target[parts[i]] !== 'object') target[parts[i]] = {};
      target = target[parts[i]];
    }
    target[parts[parts.length - 1]] = row[key];
  });
  return result;
}

module.exports = { QueryTypes, formatQuery, escapeValue, nestRow };
