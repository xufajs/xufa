# @xufa/marshal

Values as JSON that keeps what JSON loses: the classes of your objects (through a registry), objects referenced
twice, cycles, and `undefined`, `NaN`, `-0`, BigInt, Date, RegExp, Map, Set, Buffer and typed arrays, errors (with
their class, cause and fields), URL... It is safe to parse what comes from outside, and has no dependencies.

```sh
npm install @xufa/marshal
```

```js
const { stringify, parse, clone, registry } = require('@xufa/marshal');

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
const { ENCODE, DECODE } = require('@xufa/marshal');

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
| `marshal(value, options)`   | The same as plain JSON data (an array of nodes), for channels that carry objects. |
| `unmarshal(nodes, options)` | The value again.                                                                  |
| `clone(value, options)`     | A deep copy, in the process: every class keeps its prototype, functions are kept. |

| Option      | Default    | What it does                                                                           |
| ----------- | ---------- | -------------------------------------------------------------------------------------- |
| `registry`  | `registry` | The classes that come back as themselves.                                              |
| `unknown`   | `'object'` | Instances of classes not registered: their fields as a plain object, or `'error'`.     |
| `functions` | `'throw'`  | A function as a value: an error, or `'skip'` (a field left out, `undefined` in lists). |
| `stack`     | `true`     | Whether the stacks of errors are written (`false` for what goes to clients).           |
| `maxDepth`  | `1000`     | Deeper values are an error (`XUFA_MARSHAL_ERR_DEPTH`).                                 |
| `maxNodes`  | 10,000,000 | Larger input is an error when parsing (`XUFA_MARSHAL_ERR_SIZE`).                       |

## The format

`stringify({ a: shared, b: shared, at: new Date(0) })` is
`[{"a":1,"b":1,"at":3},{"n":2},1,["Date",0]]`: a flat list of nodes (after [devalue](https://github.com/sveltejs/devalue)), the
first one the value. A node is a JSON primitive, an array of indexes, an object of indexes, or a tagged array
(`["Date", ms]`, `["Map", k, v, ...]`, `["Class", "Point", {fields}]`). Arrays of values hold only numbers, so a string
first is always a tag: no string of your data is ever taken for something else.

## Safe for input from outside

`parse()` looks up no constructor or global by a name of the input (only registered classes and a fixed list of
built-ins), calls no constructor, defines the fields of instances (no setter of a class runs), takes `"__proto__"` as
a field like any other, and has limits of depth and size. Malformed input is always a `MarshalError`.

## With xufa

- **@xufa/cluster**: `start({ marshal: registry })`: the messages of the bus keep their classes, and the errors thrown
  by the handlers of requests arrive as their class.
- **@xufa/netcache**: `new NetCache({ marshal: registry })`: cached values keep their classes on every machine.

## Performance

`stringify` + `parse` (`node bench/micro/marshal.js`): about JSON on small objects (and faster than `v8.serialize`),
0.7x to 0.8x of `v8.serialize` on rows of a database, 0.5x on many class instances (`v8.serialize` writes binary and
loses the classes), and twice as fast as the serializer it replaces.

## License

MIT
