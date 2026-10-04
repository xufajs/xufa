const errors = require('./index');

module.exports = errors.ConnectionError || class ConnectionError extends Error {};
module.exports.default = module.exports;
