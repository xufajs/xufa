// The errors of the driver. DatabaseError is an ErrorResponse of the server, with its fields named as in pg
// (code is the SQLSTATE: 23505 for unique violations, 42P01 for undefined tables...).

const FIELDS = {
  S: 'severity',
  V: 'severity',
  C: 'code',
  D: 'detail',
  H: 'hint',
  P: 'position',
  p: 'internalPosition',
  q: 'internalQuery',
  W: 'where',
  s: 'schema',
  t: 'table',
  c: 'column',
  d: 'dataType',
  n: 'constraint',
  F: 'file',
  L: 'line',
  R: 'routine',
};

class PgError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'PgError';
  }
}

class DatabaseError extends PgError {
  // `fields` are the fields of an ErrorResponse (or NoticeResponse) by their code.
  constructor(fields) {
    super(fields.M || 'Unknown database error');
    this.name = 'DatabaseError';
    Object.keys(fields).forEach((key) => {
      const name = FIELDS[key];
      if (name && !(key === 'V' && this.severity)) this[name] = fields[key];
    });
  }
}

class ConnectionError extends PgError {
  constructor(message, options) {
    super(message, options);
    this.name = 'ConnectionError';
  }
}

export { PgError, DatabaseError, ConnectionError, FIELDS };
