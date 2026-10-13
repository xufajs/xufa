# @xufa/expression

Expressions of JavaScript, a safe part of it, compiled once and run many times on data of their own: for rules,
formulas, conditions and templates that users or configuration write. No dependencies.

```js
import { compile, evaluate } from '@xufa/expression';

const total = compile('items.filter(i => i.price > min).reduce((sum, i) => sum + i.price * i.quantity, 0)');
total({ items, min: 10 }); // compiled once: as fast as JavaScript written by hand

evaluate('user.name?.toUpperCase() ?? "anonymous"', { user });
evaluate('`${user.name} has ${user.tags.length} tags`', { user });
```

## The language

Expressions are those of JavaScript, with the same results:

- literals: numbers (`1.5e3`, `0x1f`, `0b101`, `1_000`, `10n`), strings with their escapes, template literals,
  regular expressions (`/\d+/g`, a new one each time), `true`, `false`, `null`, `undefined`; arrays and objects
  (`[a, ...b]`, `{ a, b: 1, [key]: 2, ...rest }`);
- operators: arithmetic (`+ - * / % **`), comparisons, `&& || ??`, `!`, `typeof`, `in`, bitwise operators, `? :`;
- members, calls and optional chains: `a.b`, `a[b]`, `a?.b`, `a?.[b]`, `f(x, ...rest)`, `a.f?.()`; methods of
  values (`s.slice(1)`, `list.map(...)`) are called on them;
- arrow functions with an expression body: `items.map((item, i) => item.price * i)`.

There is nothing else. Expressions do not allow:

- statements (`let`, `const`, `if`, loops, `return`, labels) and assignments (`=`, `+=` and the rest, `++`, `--`);
- `new`, `this`, `delete`, `void`, `instanceof` and the comma operator (`(a, b)`);
- `function`, `class`, `async` and `await`, generators, `import` and `export`;
- methods, getters and setters in object literals, holes in arrays (`[1, , 2]`), and destructuring in the parameters
  of arrow functions;
- comments and tagged templates.

Each is a syntax error with its line and column. Programs (below, `statements: true`) allow all of this list, except
`this` outside the methods of classes and objects.

## What an expression can reach

An expression reads the context it is given, the parameters of its arrow functions and its globals. Its globals are
those that compute: `Math`, `JSON` (`parse`, `stringify`), `Number`, `String`, `Boolean` (conversions and their
static helpers), `Array.isArray`, `Object.keys`/`values`/`entries`/`fromEntries`, `Date.now`/`parse`, `parseInt`,
`parseFloat`, `isNaN`, `isFinite`, `encodeURIComponent` and the rest of URI coding, `Infinity`, `NaN`.

It cannot:

- read `__proto__`, `constructor`, `prototype`, `caller`, `callee`, `arguments` nor the old accessors of
  `Object.prototype` (`__defineGetter__`...), by name or computed (`x['__pro' + 'to__']` is refused when it runs:
  `XUFA_EXPR_ERR_FORBIDDEN`). So no expression reaches `Function`, and with it the process;
- assign anything, so it cannot change its context nor the prototypes of the process; objects it makes have their keys
  as their own properties (`__proto__` cannot be a key);
- reach `process`, `require`, `globalThis`, timers or modules: they are not names it has.

The functions in the context are called as they are: what they can do is what they do.

### Limits

An expression has no loops of its own, so its time and memory follow from its length and its data; but a method can
still make a large value (`'x'.repeat(1e9)`, `list.map(...)` of a large list). For expressions of people you do not
trust, give contexts of data (not objects of your application with methods), keep `maxLength` small, and run them where
a slow one does not hold others (a worker with a time limit).

## Programs

An engine with `statements: true` compiles programs: the code of rules, methods and scripts that need more than one
expression, with the same safety.

```js
const engine = new Engine({ statements: true });
const total = engine.compile(`
  let total = 0;
  for (const line of order.lines) {
    if (line.quantity > 10) total += line.price * line.quantity * 0.9; // bulk
    else total += line.price * line.quantity;
  }
  return Math.round(total * 100) / 100;
`);
total({ order });
```

- Statements: `let`, `const` and `var`, blocks, `if`, `for`, `for...of`, `while`, `do...while`, `switch`,
  `break`, `continue`, `return`, `throw`, `try`/`catch`/`finally`, `function` declarations and expressions, arrow
  functions with a body of statements; assignments (`=`, `+=` and the others, `&&=`, `||=`, `??=`), `++`, `--`,
  `delete` and comments. A line end ends a statement as in JavaScript.
- Destructuring (`const { a, b: [c] = [], ...rest } = o`, `[x, y] = [y, x]`, in parameters, `for...of` and
  `catch`), default and rest parameters, `for...in`, labels (`break outer`, `continue outer`), sequences (`a, b`),
  `void`, `instanceof` (of `Date`, `Map`, `Set`, `Array`, `Object`, `RegExp`, `Promise`, the errors and the
  constructors of the engine), tagged templates (`` String.raw`...` ``) and methods in objects (`{ total() {...} }`,
  without `this`). Destructuring and default values are lowered by the parser to declarations, members and
  conditionals: a destructured `constructor` is refused as `o.constructor` is.
- Classes: constructors, fields, methods, getters and setters, `static` members, computed keys, class expressions,
  `extends` of a class of the program or of `Error`, `TypeError`, `RangeError`, `Map`, `Set` and `Date`, `super(...)`
  and `super.method()`, and `new` of them (`new this(...)` in statics). `this` is that of the methods of classes and
  objects (getters and setters in objects too), and of the arrow functions in them; a `function` has none. Instances
  of classes of programs can be changed as plain objects can; their prototypes and constructors cannot be reached.
  Private members (`#count`, `#bump()`, `get #total()`, `static #made`, `#count in other`) are those of the class
  that declares them (and the classes in it): kept apart from the object, read only on objects of that class
  (`node?.#next` of null and undefined: undefined). Static blocks (`static { ... }`) run with the class as `this`, in
  their order among the static fields; in its body the name of a class is the class.
- `async` and `await`: async functions, arrow functions and methods, and `await` in them and at the top of a
  program (the program then gives a promise of its value). `Promise.all`, `allSettled`, `any`, `race`, `resolve`,
  `reject` and `new Promise(...)`. Steps count across awaits, and no `catch` stops the limit; calls of async functions
  waiting at once are not nested (their depth is not counted). The closures run async bodies as generators driven as
  JavaScript runs async functions; the function of JavaScript has `async` and `await` of its own.
- Programs have more globals: `BigInt`, `String.raw`, `Array.from`, `Array.of`, `structuredClone`, and
  `Object.assign` and `Object.freeze` of what a program can change (never with a key `__proto__`). Arrays made of a
  length (`new Array(n)`, `Array.from({ length: n })`) have at most 10 million items.
- The value of a program is that of its `return`, or of the last expression statement it ran (`x * 2`). A program
  of one expression is that expression, compiled and made fast as one.
- Names are variables of the program, never the context: a name assigned and declared nowhere (`total = total + 1`)
  is a variable of the program that starts with the value of that name in the context. A program can change the
  members of plain objects and arrays (those of its context too, as a function of JavaScript can), never those of the
  globals nor of what they reach (`Math.max = ...`), of functions, dates or instances of classes, nor by the names
  `__proto__`, `constructor` and `prototype` (instances of its classes too, as plain objects).
- `new` makes only what `constructors` names (`Date`, `Map`, `Set`, `Array`, `Error`, `TypeError`, `RangeError`).
- Loop turns and calls of its functions count, those of arrow functions given to `map`, `filter`, `sort`... too (in
  engines of expressions as well): past `maxSteps` (10 million) a program fails with
  `XUFA_EXPR_ERR_LIMIT`, and the same with calls nested deeper than `maxDepth` (1000). No `catch` of the program
  stops those errors.
- Programs start as closures and, run `inlineAfter` times, become one function of JavaScript as expressions do: its
  statements those of JavaScript, its names variables made for them (`v1`, `v2`...), and the checks (members changed,
  steps, depth, limits through `catch`) in helpers, with the same errors. 4 to 134 million runs a second for branches,
  switches, loops and functions: from a third of the speed of JavaScript itself to as fast, and 140 to 2,200 times that
  of SandboxJS (5 times with exceptions thrown). Compiling one takes about 10 microseconds
  (`node bench/micro/expression-programs.js` measures them). Random programs of every statement and feature run both
  ways and as JavaScript, with the same values and errors (`test/fuzz.test.js`; longer runs, of other seeds:
  `node test/fuzz/run.js --random --count 100000`).
- As in JavaScript, the arguments of a call are evaluated before what is called is checked, and a chain (`a?.[k]`,
  `a?.f(x)`) skips its keys and arguments past a null or undefined. Unknown names are undefined unless `strict`.
- A `let`, `const` or class used before its declaration runs is undefined by default. With `tdz: true` it is an
  error, as in JavaScript (its temporal dead zone): `x is used before its declaration`, `XUFA_EXPR_ERR_RUNTIME`, with
  its line and column, for reads, assignments, `typeof` and `new`, from functions called too early too. Scripts
  pasted from elsewhere then fail where they fail in JavaScript. `var`, functions and parameters are not checked.
- Generators (`function*`, `*method()`, `yield`, `yield*`, values sent back, `return()` and `throw()` running
  `finally` and `catch`), async generators (`async function*`) and `for await` (of async iterators, and of iterables
  of promises: each awaited). Their turns count as steps; a generator without end can be taken a part of.
- Modules: `import x, { a, b as c } from 'name'`, `import * as ns from 'name'` and `export` (`export const`,
  `export function`, `export class`, `export { a, b as c }`, `export default`) at the top of programs. The engine's
  `modules` option resolves a name to the source of a module (compiled by the engine, run for each import with a
  context of its own: its state is of that run) or to an object of what the host exports (a frozen copy of it);
  `engine.compile(source, { modules })` takes a resolver of its own, and `engine.imports(source)` lists what a program
  imports. Cycles of modules, exports a module lacks, `await` at the top of a module and `export ... from` are refused.
  A `{` that starts a statement is a block (an object as a statement needs parentheses).

`engine.compileTree(tree, source)` compiles a tree made by another parser, of another language, with the nodes that
`parse()` gives: the checks are those of the compiler, not of the parser. What the parser never makes is refused first
(`XUFA_EXPR_ERR_FORBIDDEN`): names, properties, keys and names of variables, parameters, constructors or filters that
are not strings (an array `['constructor']` would be read as that key), literals that are objects or functions,
trees that refer to themselves, and nodes that are not plain objects or arrays (instances of classes: nothing of a
tree comes from a prototype).

## Options

`new Engine(options)` makes an engine of its own (`compile`, `evaluate`, `parse`); the module's functions use a default
one.

| Option         | Default                | What it does                                                                            |
| -------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| `globals`      | `{}`                   | Names over the default globals (`{ tax: (v) => v * 1.21 }`); the context goes over them |
| `builtins`     | `true`                 | `false`: only the globals given                                                         |
| `filters`      | `null`                 | Functions by name: `\|` separates them, `price \| round(2) \| money` (the value first)  |
| `lenient`      | `false`                | Members of `null` or `undefined`, and calls of what is not a function, give `undefined` |
| `strict`       | `false`                | Names that are not in the context nor the globals are errors (by default, `undefined`)  |
| `tdz`          | `false`                | Programs: a `let` or `const` used before its declaration runs is an error               |
| `maxLength`    | `10000`                | The longest source (`XUFA_EXPR_ERR_LENGTH`)                                             |
| `cacheSize`    | `1000`                 | Expressions compiled kept (by source)                                                   |
| `inline`       | `true`                 | Expressions run often become one function of JavaScript (`false`: closures always)      |
| `inlineAfter`  | `64`                   | Runs before an expression becomes that function (`0`: at once)                          |
| `statements`   | `false`                | Sources are programs (see Programs)                                                     |
| `maxSteps`     | `1e7`                  | Loop turns and calls of a run of a program                                              |
| `maxDepth`     | `1000`                 | Calls of a program's functions nested                                                   |
| `constructors` | Date, Map, Set, errors | What `new` makes in programs, by name                                                   |

With filters, `|` is not the bitwise or.

## Errors

`ExpressionError` with `code`: `XUFA_EXPR_ERR_SYNTAX`, `XUFA_EXPR_ERR_FORBIDDEN`, `XUFA_EXPR_ERR_RUNTIME` (reading a
member of `null`, calling what is not a function), `XUFA_EXPR_ERR_LENGTH` or `XUFA_EXPR_ERR_LIMIT` (a program past its steps
or its depth), and `position`, `line` and `column`. The
errors of the functions called go through as they are.

## How fast

An expression starts as closures, one for each node of its tree, made once. One run often (`inlineAfter` times, 64)
becomes one function of JavaScript: its arrow functions are arrow functions of JavaScript, and what must be checked
(names, members, calls, computed keys, optional chains) is checked there as in the closures, with the same errors. Nothing
of the source is code in it: strings, names and keys are JSON literals, numbers are written by `String()`, operators come
from a fixed list and parameters get names of their own. With code generation off
(`--disallow-code-generation-from-strings`), or `inline: false`, the closures go on. A compiled expression runs 26 to 140 million
times a second on a desktop: 88% of the speed of JavaScript compiled by V8 for method calls, 71% for
`items.map(...).reduce(...)`, a third for the smallest (where the call of the function is most of the cost). Compiling
one takes a few microseconds.

`parse(source)` gives the tree (nodes as those of ESTree).

## License

MIT.
