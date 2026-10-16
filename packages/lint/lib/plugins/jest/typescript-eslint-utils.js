// What eslint-plugin-jest's rules (ported here) require of @typescript-eslint/utils: the types of nodes and tokens (each
// its own name; plain objects, read on most nodes), and ESLintUtils.RuleCreator, which makes a rule of { name, meta,
// defaultOptions, create }: its docs' url from the name, and create() given the options over the defaults
// (typescript-eslint's applyDefault()).

// (typescript-estree 8.70.0's types of nodes, as lib/prettier/parse/typescript-estree/node-types.js has them: a
// copy, not a require() of that ES module, which @xufa/test's mocks of the CommonJS modules here do not survive.)
const AST_NODE_TYPES = Object.freeze(
  Object.fromEntries(
    [
      'AccessorProperty',
      'ArrayExpression',
      'ArrayPattern',
      'ArrowFunctionExpression',
      'AssignmentExpression',
      'AssignmentPattern',
      'AwaitExpression',
      'BinaryExpression',
      'BlockStatement',
      'BreakStatement',
      'CallExpression',
      'CatchClause',
      'ChainExpression',
      'ClassBody',
      'ClassDeclaration',
      'ClassExpression',
      'ConditionalExpression',
      'ContinueStatement',
      'DebuggerStatement',
      'Decorator',
      'DoWhileStatement',
      'EmptyStatement',
      'ExportAllDeclaration',
      'ExportDefaultDeclaration',
      'ExportNamedDeclaration',
      'ExportSpecifier',
      'ExpressionStatement',
      'ForInStatement',
      'ForOfStatement',
      'ForStatement',
      'FunctionDeclaration',
      'FunctionExpression',
      'Identifier',
      'IfStatement',
      'ImportAttribute',
      'ImportDeclaration',
      'ImportDefaultSpecifier',
      'ImportExpression',
      'ImportNamespaceSpecifier',
      'ImportSpecifier',
      'JSXAttribute',
      'JSXClosingElement',
      'JSXClosingFragment',
      'JSXElement',
      'JSXEmptyExpression',
      'JSXExpressionContainer',
      'JSXFragment',
      'JSXIdentifier',
      'JSXMemberExpression',
      'JSXNamespacedName',
      'JSXOpeningElement',
      'JSXOpeningFragment',
      'JSXSpreadAttribute',
      'JSXSpreadChild',
      'JSXText',
      'LabeledStatement',
      'Literal',
      'LogicalExpression',
      'MemberExpression',
      'MetaProperty',
      'MethodDefinition',
      'NewExpression',
      'ObjectExpression',
      'ObjectPattern',
      'PrivateIdentifier',
      'Program',
      'Property',
      'PropertyDefinition',
      'RestElement',
      'ReturnStatement',
      'SequenceExpression',
      'SpreadElement',
      'StaticBlock',
      'Super',
      'SwitchCase',
      'SwitchStatement',
      'TaggedTemplateExpression',
      'TemplateElement',
      'TemplateLiteral',
      'ThisExpression',
      'ThrowStatement',
      'TryStatement',
      'UnaryExpression',
      'UpdateExpression',
      'VariableDeclaration',
      'VariableDeclarator',
      'WhileStatement',
      'WithStatement',
      'YieldExpression',
      'TSAbstractAccessorProperty',
      'TSAbstractKeyword',
      'TSAbstractMethodDefinition',
      'TSAbstractPropertyDefinition',
      'TSAnyKeyword',
      'TSArrayType',
      'TSAsExpression',
      'TSAsyncKeyword',
      'TSBigIntKeyword',
      'TSBooleanKeyword',
      'TSCallSignatureDeclaration',
      'TSClassImplements',
      'TSConditionalType',
      'TSConstructorType',
      'TSConstructSignatureDeclaration',
      'TSDeclareFunction',
      'TSDeclareKeyword',
      'TSEmptyBodyFunctionExpression',
      'TSEnumBody',
      'TSEnumDeclaration',
      'TSEnumMember',
      'TSExportAssignment',
      'TSExportKeyword',
      'TSExternalModuleReference',
      'TSFunctionType',
      'TSImportEqualsDeclaration',
      'TSImportType',
      'TSIndexedAccessType',
      'TSIndexSignature',
      'TSInferType',
      'TSInstantiationExpression',
      'TSInterfaceBody',
      'TSInterfaceDeclaration',
      'TSInterfaceHeritage',
      'TSIntersectionType',
      'TSIntrinsicKeyword',
      'TSLiteralType',
      'TSMappedType',
      'TSMethodSignature',
      'TSModuleBlock',
      'TSModuleDeclaration',
      'TSNamedTupleMember',
      'TSNamespaceExportDeclaration',
      'TSNeverKeyword',
      'TSNonNullExpression',
      'TSNullKeyword',
      'TSNumberKeyword',
      'TSObjectKeyword',
      'TSOptionalType',
      'TSParameterProperty',
      'TSPrivateKeyword',
      'TSPropertySignature',
      'TSProtectedKeyword',
      'TSPublicKeyword',
      'TSQualifiedName',
      'TSReadonlyKeyword',
      'TSRestType',
      'TSSatisfiesExpression',
      'TSStaticKeyword',
      'TSStringKeyword',
      'TSSymbolKeyword',
      'TSTemplateLiteralType',
      'TSThisType',
      'TSTupleType',
      'TSTypeAliasDeclaration',
      'TSTypeAnnotation',
      'TSTypeAssertion',
      'TSTypeLiteral',
      'TSTypeOperator',
      'TSTypeParameter',
      'TSTypeParameterDeclaration',
      'TSTypeParameterInstantiation',
      'TSTypePredicate',
      'TSTypeQuery',
      'TSTypeReference',
      'TSUndefinedKeyword',
      'TSUnionType',
      'TSUnknownKeyword',
      'TSVoidKeyword',
    ].map((name) => [name, name])
  )
);

const AST_TOKEN_TYPES = Object.freeze(
  Object.fromEntries(
    [
      'Boolean',
      'Identifier',
      'JSXIdentifier',
      'PrivateIdentifier',
      'JSXText',
      'Keyword',
      'Null',
      'Numeric',
      'Punctuator',
      'RegularExpression',
      'String',
      'Template',
      'Block',
      'Line',
    ].map((name) => [name, name])
  )
);

const isObjectNotArray = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

// Objects merged deeply; anything else of the second wins.
function deepMerge(first = {}, second = {}) {
  const keys = new Set([...Object.keys(first), ...Object.keys(second)]);
  return Object.fromEntries(
    [...keys].map((key) => {
      const firstHas = key in first;
      const secondHas = key in second;
      const firstValue = first[key];
      const secondValue = second[key];
      if (firstHas && secondHas) {
        if (isObjectNotArray(firstValue) && isObjectNotArray(secondValue)) {
          return [key, deepMerge(firstValue, secondValue)];
        }
        return [key, secondValue];
      }
      return [key, firstHas ? firstValue : secondValue];
    })
  );
}

// The options of a rule: each given one over its default (objects merged deeply).
function applyDefault(defaultOptions, userOptions) {
  const options = structuredClone(defaultOptions);
  if (userOptions == null) {
    return options;
  }
  options.forEach((option, i) => {
    if (userOptions[i] !== undefined) {
      const userOption = userOptions[i];
      options[i] =
        isObjectNotArray(userOption) && isObjectNotArray(option) ? deepMerge(option, userOption) : userOption;
    }
  });
  return options;
}

const ESLintUtils = {
  RuleCreator:
    (urlCreator) =>
    ({ name, meta, defaultOptions, create }) => ({
      meta: { ...meta, docs: { ...meta.docs, url: urlCreator(name) } },
      defaultOptions,
      create(context) {
        return create(context, applyDefault(defaultOptions, context.options));
      },
    }),
};

module.exports = { AST_NODE_TYPES, AST_TOKEN_TYPES, ESLintUtils };
