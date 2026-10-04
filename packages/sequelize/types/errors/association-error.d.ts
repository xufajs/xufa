// Ported from sequelize (types/errors/association-error.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import BaseError from './base-error';
/**
 * Thrown when an association is improperly constructed (see message for details)
 */
declare class AssociationError extends BaseError {
  constructor(message: string);
}
export default AssociationError;
