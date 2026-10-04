const errors = require('./index');

module.exports = errors.ValidationError || class ValidationError extends Error {};
module.exports.default = module.exports;
