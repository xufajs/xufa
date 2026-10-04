// Ported from sequelize (types/errors/connection/connection-refused-error.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import ConnectionError from '../connection-error';
/**
 * Thrown when a connection to a database is refused
 */
declare class ConnectionRefusedError extends ConnectionError {
  constructor(parent: Error);
}
export default ConnectionRefusedError;
