// Whether a pattern is valid with the u flag (or v), in an edition that has it.

import { RegExpValidator } from '../../regexp/index.js';

const REGEXPP_LATEST_ECMA_VERSION = 2025;

function isValidWithUnicodeFlag(ecmaVersion, pattern, flag = 'u') {
  if ((flag === 'u' && ecmaVersion <= 5) || (flag === 'v' && ecmaVersion <= 2023)) return false;
  const validator = new RegExpValidator({ ecmaVersion: Math.min(ecmaVersion, REGEXPP_LATEST_ECMA_VERSION) });
  try {
    validator.validatePattern(pattern, undefined, undefined, flag === 'u' ? { unicode: true } : { unicodeSets: true });
  } catch {
    return false;
  }
  return true;
}

export { isValidWithUnicodeFlag, REGEXPP_LATEST_ECMA_VERSION };
