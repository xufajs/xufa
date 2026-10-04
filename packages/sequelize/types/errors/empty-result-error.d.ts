// Ported from sequelize (types/errors/empty-result-error.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import BaseError from './base-error';
/**
 * Thrown when a record was not found, Usually used with rejectOnEmpty mode (see message for details)
 */
declare class EmptyResultError extends BaseError {
  constructor(message: string);
}
export default EmptyResultError;
