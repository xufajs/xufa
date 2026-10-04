// Ported from sequelize (types/errors/connection/host-not-reachable-error.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import ConnectionError from '../connection-error';
/**
 * Thrown when a connection to a database has a hostname that was not reachable
 */
declare class HostNotReachableError extends ConnectionError {
  constructor(parent: Error);
}
export default HostNotReachableError;
