// @xufa/rules: business rules in workbooks of Excel, as decision tables (Rules), steps of calculations (Spreadsheet),
// constants, datatypes, methods, transforms, and the tests that check them, run as functions. Expressions in cells are
// @xufa/expression: safe, compiled once. Books are read from .xlsx (and written back) with no other dependency, and
// kept as JSON.
//
//   import { RuleBook } from '@xufa/rules';
//   const book = RuleBook.fromXlsx(fs.readFileSync('pricing.xlsx'));
//   book.call('Premium', 'basic', 40);
//   await book.test(); // [] when every test passes
export { RuleBook } from './lib/book.js';
export { readXlsx, writeXlsx, patchXlsx } from './lib/xlsx.js';
export { blocksOf } from './lib/blocks.js';
export { RulesError, normalize, toValue } from './lib/values.js';
export { Fun } from './lib/helpers.js';
export { parseProperties } from './lib/messages.js';
export { RuleStore } from './lib/store.js';
export { rulesPlugin } from './lib/plugin.js';
