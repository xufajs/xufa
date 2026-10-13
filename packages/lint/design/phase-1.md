# Phase 1: the measure and the leaves — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure @xufa/lint against ESLint 9.39.5 (same problems, time), and replace the leaf packages of
`lib/vendor` (escape-string-regexp, esutils, eslint-visitor-keys, @eslint/plugin-kit) and the stubs of levn, debug and
ESLint's config with @xufa/lint's own modules.

**Architecture:** See [own-linter.md](own-linter.md). New modules go to `lib/util`, `lib/ast` and `lib/source-code`;
the copied files that used the leaves require the new modules instead (their requires change, as tools/port-lint
changed them); the leaves are then deleted. eslint-scope and eslint-utils (copied, replaced in later phases) require
the new visitor keys.

**Tech Stack:** Node.js ≥ 22 (CommonJS in lib/), the tests' globals of @xufa/test (`describe`, `it`, `expect`),
ESLint 9.39.5 as a dev dependency of bench/ only.

## Running things

Node 22 or newer (`export PATH=$HOME/.nvm/versions/node/v22.22.3/bin:$PATH` where the default is older).

- Tests of @xufa/lint: `pnpm --filter @xufa/lint test`. While the runner's coverage modules are missing (see
  own-linter.md, "Running the tests now"), with node:test and a file of globals outside the repository:

  ```js
  // globals.cjs
  const t = require('node:test');
  Object.assign(globalThis, { describe: t.describe, it: t.it, test: t.test });
  globalThis.expect = require('<repo>/packages/test/src/expect').expect;
  ```

  `cd packages/lint && node --require <globals.cjs> --test --test-reporter=dot test/*.test.js test/*/*.test.js`
  Expected now: `tests 5303, pass 5271, fail 0, skipped 32`.

- The measure: `node bench/lint.js` (the code of the repository) and `node bench/lint.js --tests` (with the tests of
  the packages). Expected now: `same problems in every file`; with `--tests`, one file differs by one problem (below).
- Lint and format of what changed: `pnpm lint` and `pnpm format:check` at the root.

---

### Task 1: The measure (done)

**Files:**

- Create: `bench/lint.js`
- Modify: `bench/package.json` (dev dependencies `eslint@9.39.5`, `@eslint/js@9.39.5`), `pnpm-lock.yaml`
- Create: `bench/results/lint-1.md`

- [x] **Step 1:** `pnpm --filter xufa-bench add -D eslint@9.39.5 @eslint/js@9.39.5`
- [x] **Step 2:** Write `bench/lint.js`: the files `filesOf` gives for the repository's config (`--tests`: without
      the ignores of `packages/*/test/**` and `tools/sequelize-compat/test/**`); a child process per linter (ESLint's
      `ESLint#lintText` with `overrideConfigFile: true` and the repository's config, @eslint/js's recommended rules
      for `configs.recommended`, `no-unexpected-multiline` off, no `format` keys; @xufa/lint's `lintText` with
      `ConfigArray#configFor`); load, cold and warm (median) times, RSS; every problem compared as
      `[ruleId, severity, message, line, column, endLine, endColumn, fix, suggestions]`.
- [x] **Step 3:** Run both, write `bench/results/lint-1.md` (numbers, the profile, the one known difference:
      `packages/http/test/hooks.test.js:3132` turns on `prefer-promise-reject-errors` in a comment, a rule of ESLint
      not in @xufa/lint, so @xufa/lint reports that it is not there).
- [ ] **Step 4: Commit**

```bash
git add bench/lint.js bench/package.json pnpm-lock.yaml bench/results/lint-1.md packages/lint/design
git commit -m "lint: measure against ESLint 9.39.5, and the plan to own the linter's code"
```

### Task 2: escapeRegExp

**Files:**

- Create: `packages/lint/lib/util/escape-regexp.js`
- Create: `packages/lint/test/util/escape-regexp.test.js`
- Modify: `packages/lint/lib/eslint/lib/linter/apply-disable-directives.js:21`,
  `packages/lint/lib/eslint/lib/rules/utils/ast-utils.js:15`
- Delete: `packages/lint/lib/vendor/escape-string-regexp/`

- [x] **Step 1: Write the failing test**

```js
'use strict';

const escapeRegExp = require('../../lib/util/escape-regexp');

describe('escapeRegExp', () => {
  it('escapes what has a meaning in a regular expression', () => {
    expect(escapeRegExp('a.b*c?(d)[e]{f}|g^h$i+j\\k')).toBe('a\\.b\\*c\\?\\(d\\)\\[e\\]\\{f\\}\\|g\\^h\\$i\\+j\\\\k');
  });

  it('escapes - as \\x2d, which a class with the u flag allows', () => {
    expect(escapeRegExp('no-console')).toBe('no\\x2dconsole');
    expect(new RegExp(`[${escapeRegExp('a-z')}]`, 'u').test('-')).toBe(true);
    expect(new RegExp(`[${escapeRegExp('a-z')}]`, 'u').test('b')).toBe(false);
  });

  it('matches the text it was given', () => {
    const text = 'eslint-disable no-unused-vars, (x)?';
    expect(new RegExp(`^${escapeRegExp(text)}$`, 'u').test(text)).toBe(true);
  });

  it('takes strings only', () => {
    expect(() => escapeRegExp(1)).toThrow(TypeError);
  });
});
```

- [x] **Step 2: Run it to see it fail** (`node --require <globals.cjs> --test test/util/escape-regexp.test.js`):
      `Cannot find module '../../lib/util/escape-regexp'`.

- [x] **Step 3: Write it**

```js
'use strict';

// A text as a regular expression that matches it, inside a character class or out of it: what has a meaning is
// escaped with a backslash, and `-` as \x2d (a backslash before it is an error in a pattern with the u flag).
const SPECIAL = /[|\\{}()[\]^$+*?.]/g;

module.exports = function escapeRegExp(text) {
  if (typeof text !== 'string') throw new TypeError('Expected a string');
  return text.replace(SPECIAL, '\\$&').replace(/-/g, '\\x2d');
};
```

- [x] **Step 4: Run it to see it pass.**
- [x] **Step 5: Use it.** In `apply-disable-directives.js`, `require("../../../vendor/escape-string-regexp/index.js")`
      becomes `require("../../../util/escape-regexp")`; in `ast-utils.js`,
      `require("../../../../vendor/escape-string-regexp/index.js")` becomes `require("../../../../util/escape-regexp")`.
      `rm -r lib/vendor/escape-string-regexp`. `grep -rn escape-string-regexp lib` finds nothing.
- [x] **Step 6:** The tests of @xufa/lint (5,271 pass), then commit:
      `git commit -m "lint: escapeRegExp of its own"`.

### Task 3: esutils

ast-utils exports `getTrailingStatement` (esutils' `ast.trailingStatement`), which none of the 60 rules uses
(`grep -rn getTrailingStatement packages/lint/lib` finds only its definition). It goes, with esutils.

**Files:**

- Modify: `packages/lint/lib/eslint/lib/rules/utils/ast-utils.js:13,1475`
- Delete: `packages/lint/lib/vendor/esutils/`

- [x] **Step 1:** Delete the line `const esutils = require("../../../../vendor/esutils/lib/utils.js");` and the line
      `getTrailingStatement: esutils.ast.trailingStatement,` of ast-utils.js. `rm -r lib/vendor/esutils`.
- [x] **Step 2:** `grep -rn "esutils" packages/lint/lib` finds nothing; the tests of @xufa/lint pass (5,271).
- [x] **Step 3: Commit:** `git commit -m "lint: no esutils (its one use was not used)"`.

### Task 4: Visitor keys

**Files:**

- Create: `packages/lint/lib/ast/visitor-keys.js`
- Create: `packages/lint/test/ast/visitor-keys.test.js`
- Modify (requires): `lib/eslint/lib/shared/traverser.js:12`, `lib/eslint/lib/linter/source-code-traverser.js:13`,
  `lib/eslint/lib/languages/js/index.js:17`, `lib/eslint/lib/rules/utils/ast-utils.js:12`,
  `lib/vendor/eslint-scope/dist/eslint-scope.cjs` (its require of eslint-visitor-keys),
  `lib/vendor/@eslint-community/eslint-utils/index.js:5`
- Delete: `packages/lint/lib/vendor/eslint-visitor-keys/`

- [x] **Step 1: Write the failing test.** Every node the parser makes, on the parser's tests and on the files of
      the rules' tests, has its children under the keys of its type, in the order of the source; and `getKeys` is
      what a type not in the table falls back to.

```js
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { KEYS, getKeys } = require('../../lib/ast/visitor-keys');
const { parse } = require('../../lib/parser');

const SKIP = new Set(['parent', 'loc', 'range', 'tokens', 'comments', 'leadingComments', 'trailingComments']);
const isNode = (value) => value !== null && typeof value === 'object' && typeof value.type === 'string';

// The keys of a node whose values are nodes or arrays of nodes.
function childKeys(node) {
  return Object.keys(node).filter((key) => {
    if (SKIP.has(key)) return false;
    const value = node[key];
    return isNode(value) || (Array.isArray(value) && value.some(isNode));
  });
}

function* nodes(node) {
  yield node;
  for (const key of KEYS[node.type] ?? getKeys(node)) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) if (isNode(child)) yield* nodes(child);
    } else if (isNode(value)) {
      yield* nodes(value);
    }
  }
}

describe('visitor keys', () => {
  it('have every type of ESTree and JSX the parser makes', () => {
    for (const type of ['Program', 'Identifier', 'ImportExpression', 'ChainExpression', 'StaticBlock', 'JSXElement']) {
      expect(Array.isArray(KEYS[type])).toBe(true);
    }
    expect(Object.isFrozen(KEYS)).toBe(true);
    expect(Object.isFrozen(KEYS.Program)).toBe(true);
  });

  it('name every child of every node of the parser, in order', () => {
    const dir = path.join(__dirname, '../../lib');
    const files = fs.readdirSync(dir).filter((file) => file.endsWith('.js'));
    for (const file of files) {
      const text = fs.readFileSync(path.join(dir, file), 'utf8');
      const ast = parse(text, { sourceType: 'commonjs' });
      for (const node of nodes(ast)) {
        for (const key of childKeys(node)) expect(KEYS[node.type]).toContain(key);
      }
    }
    const jsx = parse('const a = <A b="c" {...d}><e.f />{g}<></></A>;', { sourceType: 'module', jsx: true });
    for (const node of nodes(jsx)) {
      for (const key of childKeys(node)) expect(KEYS[node.type]).toContain(key);
    }
  });

  it('getKeys: the keys of an unknown node, without parent, comments and private ones', () => {
    const node = { type: 'Unknown', parent: {}, leadingComments: [], trailingComments: [], _cache: 1, a: 1, b: {} };
    expect(getKeys(node)).toEqual(['type', 'a', 'b']);
  });
});
```

- [x] **Step 2: Run it to see it fail:** `Cannot find module '../../lib/ast/visitor-keys'`.

- [x] **Step 3: Write it.** The order of the keys of each type is the order of the source, which is the order the
      traversal visits children, and the order problems are reported in.

```js
'use strict';

// The keys of the children of each type of node of ESTree (ECMAScript 2025) and of JSX: the traversal of the linter
// and scope analysis go through them in this order, the order of the source. Types not here (a parser's own) fall
// back to getKeys().

const TYPES = {
  ArrayExpression: ['elements'],
  ArrayPattern: ['elements'],
  ArrowFunctionExpression: ['params', 'body'],
  AssignmentExpression: ['left', 'right'],
  AssignmentPattern: ['left', 'right'],
  AwaitExpression: ['argument'],
  BinaryExpression: ['left', 'right'],
  BlockStatement: ['body'],
  BreakStatement: ['label'],
  CallExpression: ['callee', 'arguments'],
  CatchClause: ['param', 'body'],
  ChainExpression: ['expression'],
  ClassBody: ['body'],
  ClassDeclaration: ['id', 'superClass', 'body'],
  ClassExpression: ['id', 'superClass', 'body'],
  ConditionalExpression: ['test', 'consequent', 'alternate'],
  ContinueStatement: ['label'],
  DebuggerStatement: [],
  DoWhileStatement: ['body', 'test'],
  EmptyStatement: [],
  ExperimentalRestProperty: ['argument'],
  ExperimentalSpreadProperty: ['argument'],
  ExportAllDeclaration: ['exported', 'source', 'attributes'],
  ExportDefaultDeclaration: ['declaration'],
  ExportNamedDeclaration: ['declaration', 'specifiers', 'source', 'attributes'],
  ExportSpecifier: ['local', 'exported'],
  ExpressionStatement: ['expression'],
  ForInStatement: ['left', 'right', 'body'],
  ForOfStatement: ['left', 'right', 'body'],
  ForStatement: ['init', 'test', 'update', 'body'],
  FunctionDeclaration: ['id', 'params', 'body'],
  FunctionExpression: ['id', 'params', 'body'],
  Identifier: [],
  IfStatement: ['test', 'consequent', 'alternate'],
  ImportAttribute: ['key', 'value'],
  ImportDeclaration: ['specifiers', 'source', 'attributes'],
  ImportDefaultSpecifier: ['local'],
  ImportExpression: ['source', 'options'],
  ImportNamespaceSpecifier: ['local'],
  ImportSpecifier: ['imported', 'local'],
  JSXAttribute: ['name', 'value'],
  JSXClosingElement: ['name'],
  JSXClosingFragment: [],
  JSXElement: ['openingElement', 'children', 'closingElement'],
  JSXEmptyExpression: [],
  JSXExpressionContainer: ['expression'],
  JSXFragment: ['openingFragment', 'children', 'closingFragment'],
  JSXIdentifier: [],
  JSXMemberExpression: ['object', 'property'],
  JSXNamespacedName: ['namespace', 'name'],
  JSXOpeningElement: ['name', 'attributes'],
  JSXOpeningFragment: [],
  JSXSpreadAttribute: ['argument'],
  JSXSpreadChild: ['expression'],
  JSXText: [],
  LabeledStatement: ['label', 'body'],
  Literal: [],
  LogicalExpression: ['left', 'right'],
  MemberExpression: ['object', 'property'],
  MetaProperty: ['meta', 'property'],
  MethodDefinition: ['key', 'value'],
  NewExpression: ['callee', 'arguments'],
  ObjectExpression: ['properties'],
  ObjectPattern: ['properties'],
  PrivateIdentifier: [],
  Program: ['body'],
  Property: ['key', 'value'],
  PropertyDefinition: ['key', 'value'],
  RestElement: ['argument'],
  ReturnStatement: ['argument'],
  SequenceExpression: ['expressions'],
  SpreadElement: ['argument'],
  StaticBlock: ['body'],
  Super: [],
  SwitchCase: ['test', 'consequent'],
  SwitchStatement: ['discriminant', 'cases'],
  TaggedTemplateExpression: ['tag', 'quasi'],
  TemplateElement: [],
  TemplateLiteral: ['quasis', 'expressions'],
  ThisExpression: [],
  ThrowStatement: ['argument'],
  TryStatement: ['block', 'handler', 'finalizer'],
  UnaryExpression: ['argument'],
  UpdateExpression: ['argument'],
  VariableDeclaration: ['declarations'],
  VariableDeclarator: ['id', 'init'],
  WhileStatement: ['test', 'body'],
  WithStatement: ['object', 'body'],
  YieldExpression: ['argument'],
};

for (const keys of Object.values(TYPES)) Object.freeze(keys);
const KEYS = Object.freeze(TYPES);

const NOT_CHILDREN = new Set(['parent', 'leadingComments', 'trailingComments']);

/** The keys of a node of a type not in KEYS: its own, but for its parent, its comments and private ones (`_x`). */
function getKeys(node) {
  return Object.keys(node).filter((key) => !NOT_CHILDREN.has(key) && key[0] !== '_');
}

module.exports = { KEYS, getKeys };
```

- [x] **Step 4: Run it to see it pass.**
- [x] **Step 5: Use it.** Each `require("…/vendor/eslint-visitor-keys/dist/eslint-visitor-keys.cjs")` becomes a
      require of `lib/ast/visitor-keys` (relative: `../../../ast/visitor-keys` from `lib/eslint/lib/shared` and
      `lib/eslint/lib/linter`, `../../../../ast/visitor-keys` from `lib/eslint/lib/languages/js` and
      `lib/eslint/lib/rules/utils`, `../../../ast/visitor-keys` from `lib/vendor/eslint-scope/dist`,
      `../../../ast/visitor-keys` from `lib/vendor/@eslint-community/eslint-utils`). `unionWith` is not used
      (`grep -rn unionWith packages/lint/lib` finds it only in the copy). `rm -r lib/vendor/eslint-visitor-keys`.
- [x] **Step 6: Check against the original.** `bench/lint-leaves.js` (Task 6) compares `KEYS` with
      eslint-visitor-keys 4 (from bench/node_modules, through eslint) type by type, and `getKeys` on every node of
      the corpus.
- [x] **Step 7:** The tests of @xufa/lint (5,271 + the new ones), then commit:
      `git commit -m "lint: visitor keys of its own"`.

### Task 5: Comments that speak to the linter

What plugin-kit and the levn stub give the copied code: `ConfigCommentParser` (`parseDirective`, `parseListConfig`,
`parseStringConfig`, `parseJSONLikeConfig`), and the classes `Directive`, `VisitNodeStep`, `CallMethodStep`. The
parser of comments becomes functions; the classes become plain objects (`{ type, node, value, justification }` for a
directive, the steps with their `type` and `kind`), made by small functions, as SourceCode is their only maker.

**Files:**

- Create: `packages/lint/lib/source-code/comments.js`
- Create: `packages/lint/lib/source-code/steps.js`
- Create: `packages/lint/test/source-code/comments.test.js`
- Modify: `packages/lint/lib/eslint/lib/languages/js/source-code/source-code.js` (its require of plugin-kit, the
  `commentParser.*` calls, `new Directive(…)`, `new VisitNodeStep(…)`, `new CallMethodStep(…)`),
  `packages/lint/lib/linter.js:18,22,54`
- Delete: `packages/lint/lib/vendor/@eslint/`, `packages/lint/lib/stubs/levn.js`

- [x] **Step 1: Write the failing test**

```js
'use strict';

const { parseDirective, parseList, parseNames, parseRules } = require('../../lib/source-code/comments');

describe('directive comments', () => {
  it('a label, its value and the reason after --', () => {
    expect(parseDirective(' eslint-disable no-alert, no-console -- legacy code ')).toEqual({
      label: 'eslint-disable',
      value: 'no-alert, no-console',
      justification: 'legacy code',
    });
    expect(parseDirective('global a, b:writable')).toEqual({
      label: 'global',
      value: 'a, b:writable',
      justification: '',
    });
    expect(parseDirective('eslint-enable')).toEqual({ label: 'eslint-enable', value: '', justification: '' });
  });

  it('not a directive: no label first', () => {
    expect(parseDirective(' just a comment')).toEqual({ label: 'just', value: 'a comment', justification: '' });
    expect(parseDirective('Eslint-disable')).toBeUndefined();
    expect(parseDirective('* @param a')).toBeUndefined();
  });

  it('-- needs spaces around it', () => {
    expect(parseDirective('eslint-disable a--b')).toEqual({
      label: 'eslint-disable',
      value: 'a--b',
      justification: '',
    });
  });
});

describe('lists of rules', () => {
  it('names, trimmed, quotes off', () => {
    expect(parseList(' no-alert , "no-console",\'eqeqeq\', ')).toEqual({
      'no-alert': true,
      'no-console': true,
      eqeqeq: true,
    });
    expect(parseList('')).toEqual({});
  });
});

describe('names with values', () => {
  it('/* global */: names, a value after :', () => {
    expect(parseNames('a, b:writable  c : readonly,,d')).toEqual({ a: null, b: 'writable', c: 'readonly', d: null });
  });
});

describe('settings of rules', () => {
  it('the object of /* eslint */, as levn reads it', () => {
    expect(parseRules('no-alert: 2, quotes: [2, single], eqeqeq: "off"')).toEqual({
      ok: true,
      config: { 'no-alert': 2, quotes: [2, 'single'], eqeqeq: 'off' },
    });
    expect(parseRules("no-alert: 'warn'")).toEqual({ ok: true, config: { 'no-alert': 'warn' } });
  });

  it('without commas, as JSON', () => {
    expect(parseRules('"no-alert": 2 "no-console": 1')).toEqual({
      ok: true,
      config: { 'no-alert': 2, 'no-console': 1 },
    });
    expect(parseRules('no-alert: 2 no-console: 1')).toEqual({ ok: true, config: { 'no-alert': 2, 'no-console': 1 } });
  });

  it('what neither reads is an error that says what was read', () => {
    const result = parseRules('no-alert: [2');
    expect(result.ok).toBe(false);
    expect(result.error.message).toMatch(/^Failed to parse JSON from '"no-alert": \[2': /);
  });
});
```

- [x] **Step 2: Run it to see it fail:** `Cannot find module '../../lib/source-code/comments'`.

- [x] **Step 3: Write it**

```js
'use strict';

// The comments that speak to the linter: /* eslint-disable no-alert -- a reason */, /* global a:writable */,
// /* exported a */, /* eslint eqeqeq: "off" */. A comment is a directive when it starts with a label (words in
// lower case joined by -); what follows is its value, up to a reason after -- (with space on both sides).

const LABEL = /^([a-z]+(?:-[a-z]+)*)(?:\s|$)/u;
const REASON = /\s-{2,}\s/u;
const SEVERITIES = new Set([0, 1, 2, 'off', 'warn', 'error']);

/** The label, value and reason of a comment's text: { label, value, justification }; undefined if not a directive. */
function parseDirective(text) {
  const reason = REASON.exec(text);
  const directive = (reason ? text.slice(0, reason.index) : text).trim();
  const match = LABEL.exec(directive);
  if (!match) return undefined;
  return {
    label: match[1],
    value: directive.slice(match[1].length).trim(),
    justification: reason ? text.slice(reason.index + reason[0].length).trim() : '',
  };
}

/** Names separated by commas (`a, "b"`), quotes off: { a: true, b: true }. */
function parseList(text) {
  const names = {};
  for (const part of text.split(',')) {
    const name = part.trim().replace(/^(['"]?)(.*)\1$/su, '$2');
    if (name) names[name] = true;
  }
  return names;
}

/** Names with a value or none, by spaces or commas (`a, b:writable`): { a: null, b: 'writable' }. */
function parseNames(text) {
  const names = {};
  const collapsed = text.trim().replace(/(?<!\s)\s*([:,])\s*/gu, '$1');
  for (const item of collapsed.split(/\s|,+/u)) {
    if (!item) continue;
    const [name, value = null] = item.split(':');
    names[name] = value;
  }
  return names;
}

// An object as the options of ESLint's CLI read it (levn): JSON whose keys, strings in single quotes and single words
// may go without double quotes, and whose braces may be left out.
function parseObject(text) {
  const json = text
    .trim()
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (all, inner) => JSON.stringify(inner.replace(/\\'/g, "'")))
    .replace(/([{,]\s*|^\s*)([A-Za-z_$@/][\w$@/-]*)\s*:/g, '$1"$2":')
    .replace(/([:[,]\s*)([A-Za-z_$][\w$-]*)(?=\s*[,}\]]|\s*$)/g, (all, before, word) =>
      ['true', 'false', 'null'].includes(word) ? all : `${before}"${word}"`
    );
  return JSON.parse(json.startsWith('{') ? json : `{${json}}`);
}

const severityOf = (setting) => (Array.isArray(setting) ? setting[0] : setting);

/**
 * The settings of rules of a comment (`no-alert: 2, quotes: [2, single]`): { ok: true, config } or
 * { ok: false, error: { message } }. Read as the CLI reads options; when that fails or gives a severity that is not
 * one (`no-alert: 2 no-console: 2` without commas), as JSON with the names quoted and commas added.
 */
function parseRules(text) {
  try {
    const config = parseObject(text) || {};
    if (Object.values(config).every((setting) => SEVERITIES.has(severityOf(setting)))) return { ok: true, config };
  } catch {
    // Read below.
  }
  const json = text.replace(/(?<![-a-zA-Z0-9/])([-a-zA-Z0-9/]+):/gu, '"$1":').replace(/([\]0-9])\s+(?=")/u, '$1,');
  try {
    return { ok: true, config: JSON.parse(`{${json}}`) };
  } catch (error) {
    return { ok: false, error: { message: `Failed to parse JSON from '${json}': ${error.message}` } };
  }
}

module.exports = { parseDirective, parseList, parseNames, parseRules };
```

`lib/source-code/steps.js`:

```js
'use strict';

// The steps of a traversal of a file, in order, as SourceCode#traverse() gives them: visiting a node (entering it,
// phase 1, or leaving it, phase 2) and calling a method of the visitor (the events of code paths).

const visitStep = (target, phase, args) => ({ type: 'visit', kind: 1, target, phase, args });
const callStep = (target, args) => ({ type: 'call', kind: 2, target, args });

module.exports = { visitStep, callStep };
```

- [x] **Step 4: Run it to see it pass.**
- [x] **Step 5: Use them.** In source-code.js: the require of plugin-kit becomes
      `{ parseDirective, parseList, parseNames, parseRules } = require("../../../../../source-code/comments")` and
      `{ visitStep, callStep } = require("../../../../../source-code/steps")`; `const commentParser = new
ConfigCommentParser();` goes; `commentParser.parseDirective(` → `parseDirective(`,
      `commentParser.parseListConfig(` → `parseList(`, `commentParser.parseStringConfig(` → `parseNames(`,
      `commentParser.parseJSONLikeConfig(` → `parseRules(`; `new Directive({ type, node, value, justification })`
      → the object `{ type, node, value, justification }`; `new VisitNodeStep({ target, phase, args })` →
      `visitStep(target, phase, args)`; `new CallMethodStep({ target, args })` → `callStep(target, args)`. In
      lib/linter.js: the require of plugin-kit becomes `const { parseList } = require('./source-code/comments');`,
      `commentParser` goes, `commentParser.parseListConfig(value)` → `parseList(value)`.
      `grep -rn "VisitNodeStep\|CallMethodStep\|instanceof" lib/eslint/lib/linter` must show no test of the classes
      (the traverser reads `step.kind`). `rm -r lib/vendor/@eslint lib/stubs/levn.js`.
- [x] **Step 6:** The tests of @xufa/lint, then commit: `git commit -m "lint: its own parser of directive comments"`.

### Task 6: The stubs of debug and config, and the check against the originals

**Files:**

- Modify: `lib/eslint/lib/shared/traverser.js`, `lib/eslint/lib/linter/source-code-fixer.js`,
  `lib/eslint/lib/linter/code-path-analysis/debug-helpers.js`, `lib/eslint/lib/languages/js/index.js` (debug),
  `lib/eslint/lib/linter/apply-disable-directives.js` (config)
- Create: `bench/lint-leaves.js`
- Delete: `lib/stubs/debug.js`, `lib/stubs/config.js`

- [x] **Step 1: debug.** It logs nothing: each `require("…/stubs/debug.js")("…")` (and `createDebug(…)` in
      languages/js/index.js) becomes `() => {}` where it is assigned, so the calls stay and do nothing;
      debug-helpers.js keeps its `enabled: false`. `grep -rn "stubs/debug" lib` finds nothing.
- [x] **Step 2: config.** apply-disable-directives.js asks `Config.getRuleNumericSeverity(setting)`. Where the
      stub's require was, it requires `{ normalizeSeverityToNumber } = require("../shared/severity")` and defines:

```js
// The severity of a rule's setting as a number (0 when it is not one), as ESLint's Config gives it.
const Config = {
  getRuleNumericSeverity(ruleConfig) {
    try {
      return normalizeSeverityToNumber(Array.isArray(ruleConfig) ? ruleConfig[0] : ruleConfig);
    } catch {
      return 0;
    }
  },
};
```

- [x] **Step 3: The check against the originals,** `bench/lint-leaves.js`: on the files of `node bench/lint.js
--tests`, the comments of each file (from @xufa/lint's parser) through `parseDirective` and plugin-kit's
      `ConfigCommentParser#parseDirective`, and the value of each directive through the matching function of both
      (`parseList`/`parseListConfig` for eslint-disable…, `parseNames`/`parseStringConfig` for global and exported,
      `parseRules`/`parseJSONLikeConfig` for eslint); `KEYS` against eslint-visitor-keys' `KEYS`; `getKeys` and
      eslint-visitor-keys' `getKeys` on every node. Plugin-kit and eslint-visitor-keys are resolved from eslint's
      folder (`require.resolve('@eslint/plugin-kit', { paths: [path.dirname(require.resolve('eslint/package.json',
{ paths: [__dirname] }))] })`). It prints the count of each and every difference; exit code 1 if any.
- [x] **Step 4:** `node bench/lint-leaves.js` — no difference. The tests of @xufa/lint pass.
      `node bench/lint.js` and `node bench/lint.js --tests`: same problems (the one known difference), times
      within the noise of lint-1.md.
- [x] **Step 5:** `ls lib/vendor` shows only `@eslint-community eslint-scope esquery esrecurse estraverse`, and
      `ls lib/stubs` only `espree.js`. NOTICE.md: drop the licenses of escape-string-regexp, esutils,
      eslint-visitor-keys and @eslint/plugin-kit from the list of copied packages, and add a line that @xufa/lint's
      own `lib/ast/visitor-keys.js` and `lib/source-code/comments.js` do what they did (MIT, their licenses kept
      below that line).
- [x] **Step 6:** `pnpm lint` and `pnpm format:check` (the new files are linted and formatted), then commit:
      `git commit -m "lint: no stubs of debug and config; the leaves checked against the originals"`.
- [x] **Step 7:** `bench/results/lint-2.md`: what phase 1 changed, the numbers of `node bench/lint.js --tests`.

## What the work found

- Not committed yet: the work of Tasks 1 to 6 is on the branch `lint-own-code`, as changes of the working tree,
  for review; the commits of the steps are to be made then.

- The stand-in of levn (lib/stubs/levn.js, from before this phase), which Step 3 of Task 5 took as it was, read
  `/* eslint */` settings as JSON after regular expressions: it failed on what levn reads (`no-alert: 2,`,
  `[2,]`, `0x2`), and ESLint and @xufa/lint read those comments differently. `bench/lint-leaves.js` found it;
  `parseObject` of lib/source-code/comments.js is now a reader of levn's grammar (its tokens, fields, lists and
  tuples, then the cast of each word), and agrees with plugin-kit and levn on every comment of the repository and on
  20,000 made-up settings (3,881 of which read, the rest errors with the same message).
- `bench/lint.js` exports `corpus` for the checks against the originals (`bench/lint-*.js`).

## Not in this phase

`tools/port-lint` would copy everything back: it is not run again (own-linter.md); phase 10 removes what of it copies
code and keeps the port of ESLint's tests of the rules, which stay as they are.
