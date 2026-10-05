# @xufa/yaml

YAML 1.2 for Node.js with no dependencies: the code of [js-yaml](https://github.com/nodeca/js-yaml) 4.1.0 (MIT,
`LICENSE.js-yaml`) and its test suite. `require('js-yaml')` can be replaced by `require('@xufa/yaml')`.

```js
const yaml = require('@xufa/yaml');

const doc = yaml.load(fs.readFileSync('openapi.yaml', 'utf8')); // one document (safe: no code is run)
const docs = yaml.loadAll(text); // every document of a stream
const text = yaml.dump({ openapi: '3.1.0', info: { title: 'Books' } }, { noRefs: true, lineWidth: -1 });
```

- `load(text, { schema, filename, json, onWarning })`: the default schema has the types of YAML 1.2 and the ones of
  js-yaml (timestamps, binary, sets, ordered maps, merge keys); `JSON_SCHEMA`, `CORE_SCHEMA` and `FAILSAFE_SCHEMA` have
  fewer. Errors are `YAMLException`s with the line and column (`mark`) and a snippet of the text.
- `dump(value, options)`: `indent`, `flowLevel`, `sortKeys`, `lineWidth`, `noRefs`, `quotingType`, `forceQuotes`,
  `replacer`, `skipInvalid`...
- `new Type(tag, options)` and `schema.extend(types)` for tags of your own.

The documentation of js-yaml applies as it is.

## Tests

`test/` is the suite of js-yaml (units, the samples of loading and of load errors, the dumper, a fuzzy dumper with
fast-check, and its issues), ported to vyntra by `tools/port-yaml` from a checkout of its repository. The library is
kept as js-yaml has it, so it can be ported again.

## TypeScript

The declarations of `@types/js-yaml` 4.0.9, with `types` (the types of the default schema) added.

## License

MIT. js-yaml: MIT, Vitaly Puzrin (`LICENSE.js-yaml`).
