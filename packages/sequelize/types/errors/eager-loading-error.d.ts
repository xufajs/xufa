// Ported from sequelize (types/errors/eager-loading-error.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import BaseError from './base-error';
/**
 * Thrown when an include statement is improperly constructed (see message for details)
 */
declare class EagerLoadingError extends BaseError {
  constructor(message: string);
}
export default EagerLoadingError;
