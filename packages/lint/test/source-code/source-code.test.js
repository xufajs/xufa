import * as language from '../../lib/source-code/language.js';
import { defaultParser } from '../../lib/parser.js';

// The SourceCode of a text, as the linter makes it.
function sourceOf(text, options = {}) {
  const languageOptions = language.normalizeLanguageOptions({
    ecmaVersion: 'latest',
    sourceType: 'module',
    parser: defaultParser,
    parserOptions: {},
    globals: {},
    ...options,
  });
  const file = { body: text, path: 'file.js' };
  const parsed = language.parse(file, { languageOptions });
  const sourceCode = language.createSourceCode(file, parsed, { languageOptions });
  sourceCode.traverse();
  return { sourceCode, languageOptions };
}

const values = (tokens) => tokens.map((token) => token.value);

describe('token store', () => {
  const { sourceCode } = sourceOf('a(b, /* c */ d); // e\nf;');
  const call = sourceCode.ast.body[0].expression;
  const [b, d] = call.arguments;

  it('one token: first, last, before, after; skip, filter, comments', () => {
    expect(sourceCode.getFirstToken(call).value).toBe('a');
    expect(sourceCode.getLastToken(call).value).toBe(')');
    expect(sourceCode.getTokenAfter(b).value).toBe(',');
    expect(sourceCode.getTokenAfter(b, 1).value).toBe('d');
    expect(sourceCode.getTokenAfter(b, { includeComments: true, skip: 1 }).value).toBe(' c ');
    expect(sourceCode.getTokenBefore(d, (token) => token.value === '(').value).toBe('(');
    expect(sourceCode.getTokenAfter(call.parent, { includeComments: true }).type).toBe('Line');
    expect(sourceCode.getTokenOrCommentBefore(d).type).toBe('Block');
  });

  it('many tokens: counts, padding, between', () => {
    expect(values(sourceCode.getFirstTokens(call, 2))).toEqual(['a', '(']);
    expect(values(sourceCode.getLastTokens(call, { count: 2 }))).toEqual(['d', ')']);
    expect(values(sourceCode.getTokens(b, 1, 1))).toEqual(['(', 'b', ',']);
    expect(values(sourceCode.getTokensBetween(b, d))).toEqual([',']);
    expect(values(sourceCode.getTokensBetween(b, d, { includeComments: true }))).toEqual([',', ' c ']);
    expect(sourceCode.commentsExistBetween(b, d)).toBe(true);
    expect(values(sourceCode.getCommentsBefore(d))).toEqual([' c ']);
    expect(values(sourceCode.getCommentsInside(call))).toEqual([' c ']);
    expect(sourceCode.getTokenByRangeStart(d.range[0]).value).toBe('d');
    expect(sourceCode.getTokenByRangeStart(d.range[0] - 1)).toBe(null);
  });

  it('invalid options are errors', () => {
    expect(() => sourceCode.getFirstToken(call, -1)).toThrow('options.skip should be zero or a positive integer.');
    expect(() => sourceCode.getFirstTokens(call, { filter: 'x' })).toThrow('options.filter should be a function.');
  });
});

describe('SourceCode', () => {
  it('lines, locations and indexes', () => {
    const { sourceCode } = sourceOf('a;\r\nb;\u2028c;');
    expect(sourceCode.lines).toEqual(['a;', 'b;', 'c;']);
    expect(sourceCode.getLocFromIndex(4)).toEqual({ line: 2, column: 0 });
    expect(sourceCode.getIndexFromLoc({ line: 3, column: 1 })).toBe(8);
    expect(() => sourceCode.getLocFromIndex(99)).toThrow('Index out of range (requested index 99, but source text has length 9).');
    expect(Object.isFrozen(sourceCode)).toBe(true);
  });

  it('scopes, ancestors, nodes by index, JSDoc comments', () => {
    const { sourceCode } = sourceOf('/** f */\nfunction f(x) { return () => x; }');
    const fn = sourceCode.ast.body[0];
    const arrow = fn.body.body[0].argument;
    expect(sourceCode.getScope(arrow.body).type).toBe('function');
    expect(sourceCode.getScope(arrow.body).block).toBe(arrow);
    expect(sourceCode.getAncestors(arrow).map((node) => node.type)).toEqual(['Program', 'FunctionDeclaration', 'BlockStatement', 'ReturnStatement']);
    expect(sourceCode.getNodeByRangeIndex(arrow.body.range[0])).toBe(arrow.body);
    expect(sourceCode.getJSDocComment(fn).value).toBe('* f ');
  });

  it('directive comments: disables, globals, exported, rules', () => {
    const text = '/* global a:writable, b */\n/* exported c */\n/* eslint eqeqeq: 1 */\nvar c; a; // eslint-disable-line no-undef -- why\n';
    const { sourceCode, languageOptions } = sourceOf(text, { sourceType: 'script' });
    expect(sourceCode.getInlineConfigNodes()).toHaveLength(4);
    const { directives, problems } = sourceCode.getDisableDirectives();
    expect(problems).toEqual([]);
    expect(directives.map(({ type, value, justification }) => [type, value, justification])).toEqual([['disable-line', 'no-undef', 'why']]);
    sourceCode.applyLanguageOptions(languageOptions);
    const { configs } = sourceCode.applyInlineConfig();
    expect(configs.map(({ config }) => config)).toEqual([{ rules: { eqeqeq: 1 } }]);
    sourceCode.finalize();
    const globalScope = sourceCode.scopeManager.globalScope;
    expect(globalScope.set.get('a')).toMatchObject({ writeable: true, eslintExplicitGlobal: true });
    expect(globalScope.set.get('b')).toMatchObject({ writeable: false });
    expect(globalScope.set.get('c').eslintUsed).toBe(true);
    expect(globalScope.set.get('Array')).toMatchObject({ writeable: false, eslintExplicitGlobal: false });
    expect(sourceCode.isGlobalReference(sourceCode.ast.body[1].expression)).toBe(true);
  });

  it('space between nodes and tokens', () => {
    const { sourceCode } = sourceOf('a+ b');
    const { left, right } = sourceCode.ast.body[0].expression;
    expect(sourceCode.isSpaceBetween(left, right)).toBe(true);
    expect(sourceCode.isSpaceBetween(left, sourceCode.getTokenAfter(left))).toBe(false);
  });
});
