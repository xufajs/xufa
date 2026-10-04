// Ported from sequelize (types/errors/connection-error.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import BaseError from './base-error';
/**
 * A base class for all connection related errors.
 */
declare class ConnectionError extends BaseError {
  /** The connection specific error which triggered this one */
  parent: Error;
  original: Error;
  constructor(parent: Error);
}
export default ConnectionError;
