// no-deprecated-functions of eslint-plugin-jest 29.12.2 (MIT, see NOTICE.md), its published CommonJS as it is but for what it required
// of @typescript-eslint/utils (../typescript-eslint-utils.js) and its package.json.
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _utils = require("../typescript-eslint-utils.js");
var _utils2 = require("./utils");
const parseJestVersion = rawVersion => {
  if (typeof rawVersion === 'number') {
    return rawVersion;
  }
  const [majorVersion] = rawVersion.split('.');
  return parseInt(majorVersion, 10);
};
var _default = exports.default = (0, _utils2.createRule)({
  name: __filename,
  meta: {
    docs: {
      description: 'Disallow use of deprecated functions'
    },
    messages: {
      deprecatedFunction: '`{{ deprecation }}` has been deprecated in favor of `{{ replacement }}`'
    },
    type: 'suggestion',
    schema: [],
    fixable: 'code'
  },
  defaultOptions: [],
  create(context) {
    const jestVersion = parseJestVersion(context.settings?.jest?.version || (0, _utils2.detectJestVersion)());
    const deprecations = {
      ...(jestVersion >= 15 && {
        'jest.resetModuleRegistry': 'jest.resetModules'
      }),
      ...(jestVersion >= 17 && {
        'jest.addMatchers': 'expect.extend'
      }),
      ...(jestVersion >= 21 && {
        'require.requireMock': 'jest.requireMock',
        'require.requireActual': 'jest.requireActual'
      }),
      ...(jestVersion >= 22 && {
        'jest.runTimersToTime': 'jest.advanceTimersByTime'
      }),
      ...(jestVersion >= 26 && {
        'jest.genMockFromModule': 'jest.createMockFromModule'
      })
    };
    return {
      CallExpression(node) {
        if (node.callee.type !== _utils.AST_NODE_TYPES.MemberExpression) {
          return;
        }
        const deprecation = (0, _utils2.getNodeName)(node);
        if (!deprecation || !(deprecation in deprecations)) {
          return;
        }
        const replacement = deprecations[deprecation];
        const {
          callee
        } = node;
        context.report({
          messageId: 'deprecatedFunction',
          data: {
            deprecation,
            replacement
          },
          node,
          fix(fixer) {
            let [name, func] = replacement.split('.');
            if (callee.property.type === _utils.AST_NODE_TYPES.Literal) {
              func = `'${func}'`;
            }
            return [fixer.replaceText(callee.object, name), fixer.replaceText(callee.property, func)];
          }
        });
      }
    };
  }
});