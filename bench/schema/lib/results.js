// The folder of the results of the benchmarks of @xufa/schema: results/schema, or the one of SCHEMA_RESULTS (the run on
// Linux writes results/schema-linux: SCHEMA_RESULTS=results/schema-linux pnpm schema:all).
const path = require('path');

module.exports = process.env.SCHEMA_RESULTS
  ? path.resolve(__dirname, '../..', process.env.SCHEMA_RESULTS)
  : path.join(__dirname, '../../results/schema');
