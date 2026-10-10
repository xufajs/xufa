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
  `true`, `false`, `null`, `undefined`; arrays and objects (`[a, ...b]`, `{ a, b: 1, [key]: 2, ...rest }`);
- operators: arithmetic (`+ - * / % **`), comparisons, `&& || ??`, `!`, `typeof`, `in`, bitwise operators, `? :`;
- members, calls and optional chains: `a.b`, `a[b]`, `a?.b`, `a?.[b]`, `f(x, ...rest)`, `a.f?.()`; methods of
  values (`s.slice(1)`, `list.map(...)`) are called on them;
- arrow functions with an expression body: `items.map((item, i) => item.price * i)`.

There is nothing else: no statements, assignments (`=`, `+=`, `++`), `new`, `this`, `function`, `delete`, comments nor
tagged templates. A syntax error says where it is (`line`, `column`).

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

## Options

`new Engine(options)` makes an engine of its own (`compile`, `evaluate`, `parse`); the module's functions use a default
one.

| Option        | Default | What it does                                                                            |
| ------------- | ------- | --------------------------------------------------------------------------------------- |
| `globals`     | `{}`    | Names over the default globals (`{ tax: (v) => v * 1.21 }`); the context goes over them |
| `builtins`    | `true`  | `false`: only the globals given                                                         |
| `filters`     | `null`  | Functions by name: `\|` separates them, `price \| round(2) \| money` (the value first)  |
| `lenient`     | `false` | Members of `null` or `undefined`, and calls of what is not a function, give `undefined` |
| `strict`      | `false` | Names that are not in the context nor the globals are errors (by default, `undefined`)  |
| `maxLength`   | `10000` | The longest source (`XUFA_EXPR_ERR_LENGTH`)                                             |
| `cacheSize`   | `1000`  | Expressions compiled kept (by source)                                                   |
| `inline`      | `true`  | Expressions run often become one function of JavaScript (`false`: closures always)      |
| `inlineAfter` | `64`    | Runs before an expression becomes that function (`0`: at once)                          |

With filters, `|` is not the bitwise or.

## Errors

`ExpressionError` with `code`: `XUFA_EXPR_ERR_SYNTAX`, `XUFA_EXPR_ERR_FORBIDDEN`, `XUFA_EXPR_ERR_RUNTIME` (reading a
member of `null`, calling what is not a function) or `XUFA_EXPR_ERR_LENGTH`, and `position`, `line` and `column`. The
errors of the functions called go through as they are.

## How fast

An expression starts as closures, one for each node of its tree, made once. One run often (`inlineAfter` times, 64)
becomes one function of JavaScript: its arrow functions are arrow functions of JavaScript, and what must be checked
(names, members, calls, computed keys, optional chains) is checked there as in the closures, with the same errors. Nothing
of the source is code in it: strings, names and keys are JSON literals, numbers are written by `String()`, operators come
from a fixed list and parameters get names of their own. With code generation off
(`--disallow-code-generation-from-strings`), or `inline: false`, the closures go on. A compiled expression runs 25 to 130 million
times a second on a desktop: 93% of the speed of JavaScript compiled by V8 for method calls, 70% for
`items.map(...).reduce(...)`, a third for the smallest (where the call of the function is most of the cost). Compiling
one takes a few microseconds.

`parse(source)` gives the tree (nodes as those of ESTree).

## License

MIT.
