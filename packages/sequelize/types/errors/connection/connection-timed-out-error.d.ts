// Ported from sequelize (types/errors/connection/connection-timed-out-error.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import ConnectionError from '../connection-error';
/**
 * Thrown when a connection to a database times out
 */
declare class ConnectionTimedOutError extends ConnectionError {
  constructor(parent: Error);
}
export default ConnectionTimedOutError;
