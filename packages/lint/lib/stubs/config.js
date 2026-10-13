'use strict';

// ESLint's Config, for apply-disable-directives: the severity of a rule's setting.
const { normalizeSeverityToNumber } = require('../eslint/lib/shared/severity');

class Config {
  static getRuleNumericSeverity(ruleConfig) {
    const value = Array.isArray(ruleConfig) ? ruleConfig[0] : ruleConfig;
    try {
      return normalizeSeverityToNumber(value);
    } catch {
      return 0;
    }
  }
}

module.exports = { Config };
