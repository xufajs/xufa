# @xufa/marshal

Values as JSON that keeps what JSON loses: the classes of your objects (through a registry), objects referenced
twice, cycles, and `undefined`, `NaN`, `-0`, BigInt, Date, RegExp, Map, Set, Buffer and typed arrays, errors (with
their class, cause and fields), URL... It is safe to parse what comes from outside, and has no dependencies.

```sh
npm install @xufa/marshal
```

```js
import { stringify, parse, clone, registry } from '@xufa/marshal';

class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  norm() {
    return Math.hypot(this.x, this.y);
  }
}
registry.register(Point);

const shared = { n: 1 };
const text = stringify({ at: new Date(), point: new Point(3, 4), big: 10n, a: shared, b: shared });
const back = parse(text);
back.point.norm(); // 5: a Point again
back.a === back.b; // true: one object, as it was

clone(value); // a deep copy that keeps classes (registered or not), references and cycles
```

## Classes

`registry.register(Point)` (or several: `register(A, B, C)`) makes the instances of a class come back as themselves:
their own enumerable fields are written, and an instance is made again from the prototype of the class, **without
calling its constructor**. A class with state that is not in its fields (private `#fields`, a handle) says how it is
written:

```js
import { ENCODE, DECODE } from '@xufa/marshal';

class Money {
  #cents;
  constructor(cents, currency) {
    this.#cents = cents;
    this.currency = currency;
  }
  static [ENCODE](money) {
    return [money.#cents, money.currency];
  }
  static [DECODE]([cents, currency]) {
    return new Money(cents, currency);
  }
}
registry.register(Money); // or register(Money, { name: 'money', encode, decode })
```

Classes are known by name (`Class.name`, or `{ name }` when two classes share one). Errors of registered classes come
back as their class, with `message`, `stack`, `cause` and their fields. Separate registries (`new Registry()`, passed
as `{ registry }`) keep apart the classes of different parts of an app.

## API

| Function                    | What it does                                                                      |
| --------------------------- | --------------------------------------------------------------------------------- |
| `stringify(value, options)` | JSON text.                                                                        |
| `parse(text, options)`      | The value again.                                                                  |
| `marshal(value, options)`   | The same as plain JSON data, for channels that carry objects.                     |
| `unmarshal(data, options)`  | The value again.                                                                  |
| `clone(value, options)`     | A deep copy, in the process: every class keeps its prototype, functions are kept. |

| Option      | Default    | What it does                                                                           |
| ----------- | ---------- | -------------------------------------------------------------------------------------- |
| `registry`  | `registry` | The classes that come back as themselves.                                              |
| `unknown`   | `'object'` | Instances of classes not registered: their fields as a plain object, or `'error'`.     |
| `functions` | `'throw'`  | A function as a value: an error, or `'skip'` (a field left out, `undefined` in lists). |
| `stack`     | `true`     | Whether the stacks of errors are written (`false` for what goes to clients).           |
| `maxDepth`  | `1000`     | Deeper values are an error (`XUFA_MARSHAL_ERR_DEPTH`).                                 |
| `maxNodes`  | 10,000,000 | More values is an error when parsing (`XUFA_MARSHAL_ERR_SIZE`).                        |

## The format

The value as JSON writes it, with what JSON cannot say written so that `JSON.parse` makes as few objects as it can:
`stringify({ a: shared, b: shared, at: new Date(0), tags: ['x'] })` is
`{"a":{"n":2},"b":"¤R1","at":"¤D0","tags":["x"]}`, and an instance of a registered class is
`{"@":"Point","x":1,"y":2}`.

- Marked strings (starting with `¤`): `"¤D" + ms` (a Date), `"¤R" + n` (the object numbered n, in the order they are
  written: shared objects and cycles), `"¤B" + digits` (BigInt), `"¤u"` (undefined), `"¤h"` (a hole), `"¤N"`, `"¤I"`,
  `"¤i"`, `"¤z"` (NaN, ±Infinity, -0).
- An array of plain objects, or of instances of one registered class, all with the same fields, is a table:
  `["¤Table", "Point", ["x", "y"], 1, 2, 3, 4]` (`null` for plain objects), the keys written once and no copy of each
  row made.
- Tagged arrays, whose first item is a marked string: `["¤Map", k, v, ...]`, `["¤Set", ...]`,
  `["¤RegExp", source, flags]`, `["¤Error", ...]`, `["¤@Money", data, 1]` (written by the class's `encode()`)...
- Data that would look like them is escaped: a string starting with `¤` is `"¤S" + the string`, an object with a field
  `"@"` is `["¤Object", {...}]`, and an array whose first item is written marked is `["¤Array", ...items]`. Nothing of
  your data is ever taken for something else.
- Long strings (64 characters or more) are written once, and then as references.

## Safe for input from outside

`parse()` looks up no constructor or global by a name of the input (only registered classes and a fixed list of
built-ins), calls no constructor, defines the fields of instances (no setter of a class runs), takes `"__proto__"` as
a field like any other, and has limits of depth and size. Malformed input is always a `MarshalError`.

## With xufa

- **@xufa/cluster**: `start({ marshal: registry })`: the messages of the bus keep their classes, and the errors thrown
  by the handlers of requests arrive as their class.
- **@xufa/netcache**: `new NetCache({ marshal: registry })`: cached values keep their classes on every machine.

## Performance

`stringify` + `parse` (`node bench/micro/marshal.js`, `bench/results/marshal-4.md`): 2.4x of `v8.serialize` on small
objects (and faster than JSON), 1.2x to 1.6x on rows of a database with Dates, 2x on arrays of class instances
(`v8.serialize` writes binary and loses the classes), 0.92x on Maps and Sets. On Linux
(`bench/results/marshal-linux-5.md`): 2x on small objects, 1.1x on rows, 1.8x on instances, 1x on Maps and Sets.

## License

MIT
