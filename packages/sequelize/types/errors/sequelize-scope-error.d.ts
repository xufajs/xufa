// Ported from sequelize (types/errors/sequelize-scope-error.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import BaseError from './base-error';
/**
 * Scope Error. Thrown when the sequelize cannot query the specified scope.
 */
declare class SequelizeScopeError extends BaseError {
  constructor(message: string);
}
export default SequelizeScopeError;
