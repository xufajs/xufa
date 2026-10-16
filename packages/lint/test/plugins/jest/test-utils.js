// What the tests of eslint-plugin-jest (ported) take from their test-utils.ts: FlatCompatRuleTester (their cases in
// the eslintrc form, `parser` and `parserOptions`, into the flat one; typescript-eslint's parser is not run here),
// espreeParser (the parser @xufa/lint has), usingFlatConfig, and TSESLint.Linter for the test that calls a linter.

import RuleTester from '../../rule-tester.js';
import * as unsupportedParser from '../../unsupported-parser.js';
import { Linter } from '../../../lib/linter.js';
import { defineRule } from '../../../lib/rules/index.js';

export const espreeParser = 'espree';
export const usingFlatConfig = true;

function flatCompat(config) {
  if (!config || typeof config === 'string') {
    return config;
  }
  const obj = { languageOptions: { parserOptions: {} } };
  for (const [key, value] of Object.entries(config)) {
    if (key === 'parser') {
      // (espree's is the parser here; any other, typescript-eslint's, is not run.)
      if (value !== espreeParser) obj.languageOptions.parser = unsupportedParser;
      continue;
    }
    if (key === 'parserOptions') {
      for (const [option, val] of Object.entries(value)) {
        if (option === 'ecmaVersion' || option === 'sourceType') {
          obj.languageOptions[option] = val;
          continue;
        }
        obj.languageOptions.parserOptions[option] = val;
      }
      continue;
    }
    obj[key] = value;
  }
  return obj;
}

export class FlatCompatRuleTester extends RuleTester {
  constructor(testerConfig) {
    super(flatCompat(testerConfig));
  }

  run(ruleName, rule, tests) {
    super.run(ruleName, rule, {
      valid: tests.valid.map((t) => flatCompat(t)),
      invalid: tests.invalid.map((t) => flatCompat(t)),
    });
  }
}

// A linter of flat configs with plugins (their rules defined as `plugin/rule`), as typescript-eslint's.
class FlatLinter {
  #linter = new Linter();

  verify(code, configs) {
    const rules = {};
    for (const config of [configs].flat()) {
      for (const [namespace, plugin] of Object.entries(config.plugins ?? {})) {
        for (const [name, rule] of Object.entries(plugin.rules ?? {})) defineRule(`${namespace}/${name}`, rule);
      }
      Object.assign(rules, config.rules);
    }
    return this.#linter.verify(code, { rules });
  }
}

export const TSESLint = { Linter: FlatLinter };
