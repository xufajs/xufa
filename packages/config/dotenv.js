// @xufa/config/dotenv: dotenv's API (config, parse, populate, decrypt, configDotenv), xufa's own implementation
// (./lib/dotenv-api.js): require('@xufa/config/dotenv').config() where dotenv was.
import { dotenv } from './lib/dotenv-api.js';

const { config, configDotenv, parse, populate, decrypt } = dotenv;

export default dotenv;
export { config, configDotenv, parse, populate, decrypt };
export { dotenv as 'module.exports' };
