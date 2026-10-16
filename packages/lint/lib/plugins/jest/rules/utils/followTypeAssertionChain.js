// followTypeAssertionChain of eslint-plugin-jest 29.12.2 (MIT, see NOTICE.md), its published CommonJS as it is but for what it required
// of @typescript-eslint/utils (../typescript-eslint-utils.js) and its package.json.
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.followTypeAssertionChain = void 0;
var _utils = require("../../typescript-eslint-utils.js");
const isTypeCastExpression = node => node.type === _utils.AST_NODE_TYPES.TSAsExpression || node.type === _utils.AST_NODE_TYPES.TSTypeAssertion;
const followTypeAssertionChain = expression => isTypeCastExpression(expression) ? followTypeAssertionChain(expression.expression) : expression;
exports.followTypeAssertionChain = followTypeAssertionChain;