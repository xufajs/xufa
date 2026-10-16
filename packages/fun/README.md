# @xufa/fun

A functional library of plain functions that work on any value: lists, strings, objects, iterables, or one item.
They are curried, `_` holds an argument's place, paths read and write deep values, and classes can take part in the
operators. It has no dependencies, and is made to be the methods of expressions too: `prices.sum()`.

```sh
npm install @xufa/fun
```

```js
import { getAtPath, map, sum, subtract, median, _ } from '@xufa/fun';

const order = { lines: [{ price: 4 }, { price: 6 }], customer: { name: 'Ann' } };
getAtPath(order, 'customer.name'); // 'Ann'
getAtPath(order, 'lines[1].price'); // 6
sum(map(order.lines, (line) => line.price)); // 10
median([7, 1, 3]); // 3
subtract(_, 1)(10); // 9
```

## Any value

The functions walk what they are given: arrays, array-likes and strings by index, iterables (Set, Map, generators) in
order, objects by key, and anything else as one item; `null` and `undefined` have no items. `map`, `filter` and
`reduce` give arrays; their `*Src` forms give what the source is (a string of a string, an object of an object, a
typed array of a typed array).

## Currying

Given fewer arguments than they take, the functions give a function of the rest; `_` holds the place of one given
later: `clamp(0, 100)(140)` is 100, `subtract(_, 5)(12)` is 7. `curry(fn)` and `curryN(length, fn)` make functions of
yours so. A function of three without its last argument waits for it: `reduce(list, fn)` is a function of the initial
value.

## Paths

`getAtPath(value, 'a.b[0].c')` reads (undefined when a step has nothing), `setAtPath` sets on a copy and
`setAtPathMut` on the object itself, making the objects and arrays on the way. `getAt` and `setAt` take an index from
the end too: `getAt(list, -1)`.

## Operators

`add`, `subtract`, `mult`, `div`, `mod` and `pow` take any number of values. `add` merges objects, adds lists item by
item and adds strings and numbers as JavaScript does; the others take numbers. A class takes part with a static
method named by a tag (`ADD_TAG`, `SUBTRACT_TAG`, `MULT_TAG`, `DIV_TAG`, `MOD_TAG`, `POW_TAG`, `NEGATE_TAG`,
`AND_TAG`, `OR_TAG`, `NOT_TAG`, `APPROVE_TAG`):

```js
import { add, ADD_TAG } from '@xufa/fun';

class Money {
  constructor(cents) {
    this.cents = cents;
  }

  static [ADD_TAG](a, b) {
    return new Money(a.cents + (b.cents ?? b));
  }
}
add(new Money(250), new Money(100)).cents; // 350
```

## In expressions

Given to an engine of [@xufa/expression](../expression) as its `methods`, the functions are methods of every value
that has none of their name: `prices.sum()` is `sum(prices)`.

```js
import { Engine } from '@xufa/expression';
import * as fun from '@xufa/fun';

const engine = new Engine({ methods: fun });
engine.evaluate('prices.sum() / prices.len()', { prices: [4, 9, 2] }); // 5
```

## The functions

- Walking: `forEach`, `forEachRight`, `forWhile` (until false), `map`, `mapRight`, `mapSrc`, `mapRightSrc`, `filter`,
  `filterSrc`, `reduce`, `reduceRight`, `every`, `some`, `none`.
- Lists: `concat`, `zip`, `zipObj`, `zipWith`, `fromPairs`, `allowIndexes`, `denyIndexes` (and their `*Src`),
  `range`, `len`, `asArrayLike`, `boolDict`.
- Paths: `getAt`, `getAtPath`, `setAt`, `setAtPath`, `setAtPathMut`, `atPath`, `atIndex`.
- Numbers: `add`, `subtract`, `mult`, `div`, `mod`, `pow` (and their `*Op` of two), `inc`, `dec`, `negate`, `sum`,
  `mean`, `median`, `max`, `min`, `clamp`, `gt`, `gte`, `lt`, `lte`.
- Logic: `and`, `or`, `not`, `andOp`, `orOp`, `andFn`, `orFn` (of functions, for the same arguments).
- Functions and values: `curry`, `curryN`, `curry2`, `curry3`, `_`, `isPlaceholder`, `pipe`, `always`, `identity`,
  `merge` (deep, on a copy), `approve`, and the tests `isArray`, `isArrayLike`, `isObject`, `isString`,
  `isFunction`, `isIterable`, `isInteger`, `isNull`, `isPromise`, `has`.

## License

MIT
