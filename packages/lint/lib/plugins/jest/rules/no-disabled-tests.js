// no-disabled-tests of eslint-plugin-jest 29.12.2 (MIT, see NOTICE.md), its published CommonJS as it is but for what it required
// of @typescript-eslint/utils (../typescript-eslint-utils.js) and its package.json.
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("./utils");
var _default = exports.default = (0, _utils.createRule)({
  name: __filename,
  meta: {
    docs: {
      description: 'Disallow disabled tests'
    },
    messages: {
      missingFunction: 'Test is missing function argument',
      skippedTest: 'Tests should not be skipped'
    },
    schema: [],
    type: 'suggestion'
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        const jestFnCall = (0, _utils.parseJestFnCall)(node, context);
        if (!jestFnCall) {
          return;
        }
        if (jestFnCall.type === 'test') {
          if (node.arguments.length < 2 && jestFnCall.members.every(s => (0, _utils.getAccessorValue)(s) !== 'todo')) {
            context.report({
              messageId: 'missingFunction',
              node
            });
          }
        }
        if (
        // the only jest functions that are with "x" are "xdescribe", "xtest", and "xit"
        jestFnCall.name.startsWith('x') || jestFnCall.members.some(s => (0, _utils.getAccessorValue)(s) === 'skip')) {
          context.report({
            messageId: 'skippedTest',
            node
          });
        }
      },
      'CallExpression[callee.name="pending"]'(node) {
        if ((0, _utils.resolveScope)(context.sourceCode.getScope(node), 'pending')) {
          return;
        }
        context.report({
          messageId: 'skippedTest',
          node
        });
      }
    };
  }
});