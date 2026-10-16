// ESLint's conf/globals.js as ast-utils.js (ported from ESLint) reads it: the globals of an edition, `es2026`, from
// @xufa/lint's data.

import { editionGlobals, LATEST_ECMA_VERSION } from '../../data/ecma-globals.js';

export default { [`es${LATEST_ECMA_VERSION}`]: editionGlobals(LATEST_ECMA_VERSION) };
