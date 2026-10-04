// Written for @xufa/sequelize (not ported): the error of what Sequelize 6 does that it does not.
import BaseError from './base-error';
/**
 * Thrown for what Sequelize 6 does that @xufa/sequelize does not (functions in the conditions of includes, the
 * operators of other databases...), instead of doing something else. Its name is SequelizeNotSupportedError.
 */
declare class NotSupportedError extends BaseError {
  /** @param feature What is not supported: the message is "<feature> is not supported by @xufa/sequelize". */
  constructor(feature: string);
}
export default NotSupportedError;
