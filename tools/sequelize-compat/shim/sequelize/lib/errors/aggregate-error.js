const errors = require('./index');

module.exports = errors.AggregateError || class AggregateError extends Error {};
module.exports.default = module.exports;
