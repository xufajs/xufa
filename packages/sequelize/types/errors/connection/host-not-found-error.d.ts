// Ported from sequelize (types/errors/connection/host-not-found-error.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import ConnectionError from '../connection-error';
/**
 * Thrown when a connection to a database has a hostname that was not found
 */
declare class HostNotFoundError extends ConnectionError {
  constructor(parent: Error);
}
export default HostNotFoundError;
