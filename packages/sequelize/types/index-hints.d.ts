// Ported from sequelize (types/index-hints.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
/**
 * Available index hints to be used for querying data in mysql for index hints.
 */
declare enum IndexHints {
  USE = 'USE',
  FORCE = 'FORCE',
  IGNORE = 'IGNORE',
}

export = IndexHints;
