# Phase 2: scope analysis — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace eslint-scope 8.4.0 (and esrecurse and estraverse, which only it uses) with @xufa/lint's own scope
analysis, `lib/scope/`: the same scopes, variables, definitions and references, field by field, for every file; and
without the cost of eslint-scope's visitors (lint-1.md: 2.1 s of 15.1 s copying the table of keys for each pattern).

**Architecture:** One walk of the tree (`Analyzer`), a `switch` over the types of nodes it treats as eslint-scope's
Referencer does, the children of the others by `lib/ast/visitor-keys`; patterns walked by a small walker without a
visitor object, and identifiers bound directly when the pattern is one (most parameters and declarators). The objects
rules see (`ScopeManager`, `Scope`, `Variable`, `Definition`, `Reference`) keep eslint-scope's fields and methods:
they are part of the API of rules.

**Tech Stack:** as phase 1. The original: eslint-scope 8.4.0 from bench/node_modules (through eslint).

## What eslint-scope does, as ESLint calls it

`analyze(ast, { ignoreEval: true, nodejsScope, impliedStrict, ecmaVersion, sourceType, childVisitorKeys, fallback })`
(languages/js/index.js), then SourceCode adds the globals of the config to the global scope (`new Variable(name,
globalScope)`), and resolves the references of `through` to them. What the new analysis keeps:

- **Scopes** (`type`): `global` (Program; strict when `"use strict"` leads it, never with `nodejsScope`/commonjs),
  `function` (also on Program with `nodejsScope` or commonjs), `module` (Program, modules from ES 2015),
  `function-expression-name` (a function expression with a name: the name only), `class` (the name inside),
  `class-field-initializer` (the value of a field), `class-static-block`, `block` (from ES 2015; not a function's
  body), `switch` (from ES 2015), `for` (`for`/`for-in`/`for-of` with `let`/`const`), `catch`, `with`. Fields:
  `type set taints dynamic block through variables references variableScope functionExpressionScope
directCallToEvalScope thisFound upper isStrict childScopes`, `implicit { set, variables, left }` for the global
  scope. Strictness is not supported before ES5. A scope is registered for its block in creation order
  (`acquire(node, inner)` skips a function scope with `functionExpressionScope` set: never, as only
  `function-expression-name` scopes have it).
- **Variables** (`name identifiers references defs tainted stack scope`): `arguments` in every non-arrow function
  (no identifier, no definition, tainted in `taints`); definitions of type `CatchClause`, `Parameter` (with `rest`),
  `FunctionName`, `ClassName` (twice for a class declaration: in the outer scope with parent/index/kind `null`, in
  the class scope with them `undefined`), `Variable` (parent the declaration, `index` of the declarator, `kind`),
  `ImportBinding` (node the specifier, parent the declaration), `ImplicitGlobalVariable` (in `implicit`, for
  assignments to undeclared names outside strict code). `var` goes to the variable scope, `let`/`const` to the
  current one. `getDeclaredVariables(node)`: by the definition's node and parent.
- **References** (`identifier from tainted resolved flag`, and when they write: `writeExpr partial init`; and
  `__maybeImplicitGlobal`): in the order eslint-scope makes them — a pattern's names first (each: its write to a
  default, then its write of the value), then the expressions of the pattern (defaults, computed keys, objects of
  member expressions: computed property before the object), then the initializer. `x++` and `x += 1` read and write.
  Labels, non-computed keys and members, `super`, `import.meta`, `this`, private names and JSX names are not
  references (`this` sets `thisFound` of the variable scope). `for (x in y)`: the write of `x` from `y`, partial. A
  reference in a function's parameters to a name declared only in its body is not resolved there.
- **Closing a scope** (when its block is left): static scopes resolve their references by name or pass them up
  (`through` of each scope); `with` taints them and passes them up; the global scope resolves only names whose every
  definition is `let`/`const`/`class` (others stay in `through`, all the way, for SourceCode to resolve against its
  globals), after defining the implicit globals.

## Tasks

### Task 1: The check against eslint-scope

**Files:** Create `bench/lint-scope.js`.

- [x] It lints, with no rules, every file of `node bench/lint.js --tests` (with its config) and every case of
      ESLint's tests of the rules (test/rules, through a RuleTester that collects them: code, filename,
      languageOptions); the analysis of each is caught where languages/js/index.js asks for it, and both analyses are
      run on the same tree with the same options. Each is written down as plain data — every scope (its fields, its
      variables and references by index), every variable (identifiers, definitions with all their fields, references),
      every reference (all its own fields, `__maybeImplicitGlobal`), `getDeclaredVariables` and `acquire(node, false)`
      and `acquire(node, true)` of every node — and the two are compared. Nodes are named by their index in a walk of
      the tree. It prints the counts and the first differences; exit code 1 if any.
- [x] Run against eslint-scope itself (both sides the original): no difference (the check checks).

### Task 2: Variables, definitions, references

**Files:** Create `lib/scope/variable.js`, `test/scope/analyze.test.js` (grows with Tasks 3 and 4).

- [x] `Variable` (and its definition types as statics), `Definition`, `ParameterDefinition`, `Reference` (READ,
      WRITE, RW; `isStatic isWrite isRead isReadOnly isWriteOnly isReadWrite`), with eslint-scope's fields.

### Task 3: Scopes and the scope manager

**Files:** Create `lib/scope/scope.js`, `lib/scope/scope-manager.js`.

- [x] `Scope` (one class; what differs by type is a field or a test of `type`) and `GlobalScope` (`implicit`, its
      closing) and `FunctionScope` (`arguments`, the resolution of parameters, `isArgumentsMaterialized`,
      `isThisMaterialized`); defining, referencing, closing as above; `resolve isStatic isUsedName`.
- [x] `ScopeManager`: `scopes globalScope acquire acquireAll release getDeclaredVariables isGlobalReturn isModule
isImpliedStrict isStrictModeSupported attach detach`; `Map`s, not `WeakMap`s (they live as long as a file).

### Task 4: The analysis

**Files:** Create `lib/scope/analyzer.js`, `lib/scope/index.js`.

- [x] Write the failing tests (`test/scope/analyze.test.js`): scopes of a module, of commonjs, of a class with fields
      and a static block; `var`/`let` targets; parameters with defaults and rest; destructuring with computed keys
      and member expressions (the order of references); `for-in` writes; implicit globals and strict code; `with`;
      a parameter's default referring to a name of the body; imports and exports; `getDeclaredVariables`;
      `acquire` of a named function expression.
- [x] `analyze(ast, options)` and the `Analyzer`, until the tests pass.
- [x] `node bench/lint-scope.js`: no difference.

### Task 5: Use it, remove the copies

**Files:** Modify `lib/eslint/lib/languages/js/index.js` (its require of eslint-scope), `.../source-code/source-code.js`
(its require; `new eslintScope.Variable`), NOTICE.md. Delete `lib/vendor/eslint-scope`, `lib/vendor/esrecurse`,
`lib/vendor/estraverse`.

- [x] Requires to `lib/scope`; `grep -rn "eslint-scope\|esrecurse\|estraverse" lib` finds nothing but comments of
      types. The tests of @xufa/lint; `node bench/lint-scope.js`; `node bench/lint.js` and `--tests` (same
      problems); the profile (where the time of esrecurse went).
- [x] NOTICE.md: eslint-scope (BSD-2-Clause) stays, as lib/scope is made from it; esrecurse and estraverse go
      (nothing is made from them: the walk is lib/ast/visitor-keys').
- [x] `bench/results/lint-3.md`; `pnpm lint`, `pnpm format:check`. Not committed: the user reviews first.
