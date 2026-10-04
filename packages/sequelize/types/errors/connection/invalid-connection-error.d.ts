// Ported from sequelize (types/errors/connection/invalid-connection-error.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import ConnectionError from '../connection-error';
/**
 * Thrown when a connection to a database has invalid values for any of the connection parameters
 */
declare class InvalidConnectionError extends ConnectionError {
  constructor(parent: Error);
}
export default InvalidConnectionError;
