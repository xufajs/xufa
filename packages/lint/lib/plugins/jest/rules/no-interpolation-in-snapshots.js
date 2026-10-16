// no-interpolation-in-snapshots of eslint-plugin-jest 29.12.2 (MIT, see NOTICE.md), its published CommonJS as it is but for what it required
// of @typescript-eslint/utils (../typescript-eslint-utils.js) and its package.json.
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("../typescript-eslint-utils.js");
var _utils2 = require("./utils");
var _default = exports.default = (0, _utils2.createRule)({
  name: __filename,
  meta: {
    docs: {
      description: 'Disallow string interpolation inside snapshots'
    },
    messages: {
      noInterpolation: 'Do not use string interpolation inside of snapshots'
    },
    schema: [],
    type: 'problem'
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        const jestFnCall = (0, _utils2.parseJestFnCall)(node, context);
        if (jestFnCall?.type !== 'expect') {
          return;
        }
        if (['toMatchInlineSnapshot', 'toThrowErrorMatchingInlineSnapshot'].includes((0, _utils2.getAccessorValue)(jestFnCall.matcher))) {
          // Check all since the optional 'propertyMatchers' argument might be present
          jestFnCall.args.forEach(argument => {
            if (argument.type === _utils.AST_NODE_TYPES.TemplateLiteral && argument.expressions.length > 0) {
              context.report({
                messageId: 'noInterpolation',
                node: argument
              });
            }
          });
        }
      }
    };
  }
});