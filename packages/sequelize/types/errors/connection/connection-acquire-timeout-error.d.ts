// Ported from sequelize (types/errors/connection/connection-acquire-timeout-error.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import ConnectionError from '../connection-error';
/**
 * Thrown when connection is not acquired due to timeout
 */
declare class ConnectionAcquireTimeoutError extends ConnectionError {
  constructor(parent: Error);
}
export default ConnectionAcquireTimeoutError;
