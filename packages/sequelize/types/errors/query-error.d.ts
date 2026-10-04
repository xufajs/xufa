// Ported from sequelize (types/errors/query-error.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import BaseError from './base-error';
/**
 * Thrown when a query is passed invalid options (see message for details)
 */
declare class QueryError extends BaseError {
  constructor(message: string);
}
export default QueryError;
