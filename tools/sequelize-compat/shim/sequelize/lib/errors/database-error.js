const errors = require('./index');

module.exports = errors.DatabaseError || class DatabaseError extends Error {};
module.exports.default = module.exports;
