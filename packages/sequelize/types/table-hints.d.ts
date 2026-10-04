// Ported from sequelize (types/table-hints.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
declare enum TableHints {
  NOLOCK = 'NOLOCK',
  READUNCOMMITTED = 'READUNCOMMITTED',
  UPDLOCK = 'UPDLOCK',
  REPEATABLEREAD = 'REPEATABLEREAD',
  SERIALIZABLE = 'SERIALIZABLE',
  READCOMMITTED = 'READCOMMITTED',
  TABLOCK = 'TABLOCK',
  TABLOCKX = 'TABLOCKX',
  PAGLOCK = 'PAGLOCK',
  ROWLOCK = 'ROWLOCK',
  NOWAIT = 'NOWAIT',
  READPAST = 'READPAST',
  XLOCK = 'XLOCK',
  SNAPSHOT = 'SNAPSHOT',
  NOEXPAND = 'NOEXPAND',
}

export = TableHints;
