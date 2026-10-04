// Ported from sequelize (types/errors/instance-error.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import BaseError from './base-error';
/**
 * Thrown when a some problem occurred with Instance methods (see message for details)
 */
declare class InstanceError extends BaseError {
  constructor(message: string);
}
export default InstanceError;
