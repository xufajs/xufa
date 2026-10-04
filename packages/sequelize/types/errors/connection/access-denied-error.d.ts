// Ported from sequelize (types/errors/connection/access-denied-error.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import ConnectionError from '../connection-error';
/**
 * Thrown when a connection to a database is refused due to insufficient privileges
 */
declare class AccessDeniedError extends ConnectionError {
  constructor(parent: Error);
}
export default AccessDeniedError;
