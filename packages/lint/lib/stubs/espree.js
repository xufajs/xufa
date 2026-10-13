'use strict';

// espree, for ESLint's modules: @xufa/lint's parser (TypeScript's, into the ESTree espree makes), and its tokens of
// pieces of code (ast-utils asks whether two can be next to each other).
const { parse, tokenize } = require('../parser');

const LATEST = 17;

module.exports = {
  parse(text, options = {}) {
    return parse(text, {
      sourceType: options.sourceType === 'commonjs' ? 'commonjs' : options.sourceType,
      jsx: Boolean(options.ecmaFeatures?.jsx),
      filePath: options.filePath,
    });
  },
  tokenize: (code) => tokenize(code),
  latestEcmaVersion: LATEST,
  supportedEcmaVersions: [3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
  version: '10.4.0',
};
