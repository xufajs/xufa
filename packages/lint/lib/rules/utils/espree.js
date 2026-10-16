// What ast-utils.js (ported from ESLint) used of espree: its latest ECMAScript version and tokenize(), here the
// parser's (the same tokens; its comments as `tokens.comments`, which espree gives with `{ comment: true }`).

import { tokenize } from '../../parser.js';
import { LATEST_ECMA_VERSION } from '../../data/ecma-globals.js';

export default { latestEcmaVersion: LATEST_ECMA_VERSION, tokenize: (text) => tokenize(text) };
