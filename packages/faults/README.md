# @xufa/faults

Faults made to happen, to see what an app does when what it uses fails: operations that fail, wait, hang or find
their service down, by rules that say which operations, how often and how many times. No dependencies. It is the
engine of the faults of xufa:

| Faults                                             | Operations                                                       | Filters             |
| -------------------------------------------------- | ---------------------------------------------------------------- | ------------------- |
| `db.faults` of [@xufa/orm](../orm)                 | select, count, aggregate, insert, update, delete, transaction... | `models`, `tenants` |
| `cache.faults` of the ORM caches                   | get, set, delete, clear (`read`, `write`)                        | `keys`              |
| `client.faults` of [@xufa/client](../client)       | get, head, options, post, put, patch, delete (`read`, `write`)   | `urls`, `paths`     |
| `bus.faults` of [@xufa/cluster](../cluster)        | send, sendTo, broadcast, request (`events`)                      | `events`            |
| `netcache.faults` of [@xufa/netcache](../netcache) | get, set, delete, clear (`read`, `write`)                        | `keys`              |

```js
db.faults.fail({ operations: 'write', models: [Order], rate: 0.2 }); // 1 write of Order in 5 fails
client.faults.respond({ status: 503, headers: { 'retry-after': '1' }, paths: '/payments', times: 3 });
cache.faults.down(); // the cache is lost: the database answers
bus.faults.drop({ events: 'invalidate', rate: 0.1 }); // 1 message in 10 is lost
const hung = netcache.faults.hang({ keys: 'session:' }); // until hung.release()
```

## Rules

`faults.fail(options)`, `delay({ ms, jitter, ...options })`, `hang(options)` and `down(options)` (every operation
fails until `faults.up()`) add a rule and give it back. `faults.clear()` removes them all (and lets go what they hold).

- `operations`: names or groups (`'read'`, `'write'`...); the defaults of those faults when not given.
- Filters of each faults (`models`, `keys`, `paths`...): names, prefixes (keys, paths, urls) or regular expressions;
  classes by their names.
- `match(context)`: a check of your own of the operation (`{ operation, model, key, path, event, ... }`).
- `rate`: the chance of each match, 0 to 1. `faults.random` is `Math.random`: give it a function of your own in tests,
  for results that do not change.
- `after`: the first n matches are left alone. `times`: removed after n hits.
- `error`: the error of a fail (an error, or a function of the context); `message`: its message.

A rule counts its `hits`; `remove()` takes it away; `release()` lets the operations it holds (`hang`) go on. Waits
(`delay`, `hang`) end with the signal of the operation, when it has one: the timeout of a client call ends a hang as it
would end a call that does not answer.

Without rules, the operations are as they were: one check of an empty list.

## In tests

A test that fails before its `faults.clear()` would leave its faults to the tests after it. `clearFaults()` removes
every rule of every faults (the database, its caches, the clients, the bus...) and lets go what they hold:

```js
// In the setup files of the runner (setupFiles of Jest, Vitest or vyntra; --require of Mocha):
require('@xufa/faults/register'); // or require('xufa/faults/register')

// Or in a test file, with the hooks of the runner:
const { useFaults } = require('@xufa/faults'); // or require('xufa/faults')
useFaults(); // afterEach of the runner (a global); useFaults(require('node:test')) for node:test
```

- `strict`: a test that ends with faults still set fails, with what it left (`database: fail of insert (hits 0)`); they are
  cleared all the same, so the next test is not the one that fails for it. `useFaults({ strict: true })`,
  `useFaults(require('node:test'), { strict: true })`, or `require('@xufa/faults/register-strict')` in the setup files. A
  test that clears its faults in an `afterEach` of its own is fine: those run before the one of the setup files.
- `clearFaults()` gives the number of rules it removed; `activeFaults()` the faults that have rules now.
- They reach every copy of this package in the process (the registry is global), so the faults of every part of xufa
  are cleared, whichever one they came from.
- A faults whose rules are gone (removed, of their `times`, `up()`, `clear()`) is not kept in the registry.

## Over HTTP (staging)

`plugin` gives an app routes that turn its faults on and off, so a staging environment can be made to fail from a
script, a dashboard or a game day, without deploying:

```js
const { plugin } = require('@xufa/faults'); // or require('xufa/faults')

app.register(plugin, {
  targets: { db, cache: db.cache, payments, bus }, // faults, or what has them
  token: process.env.FAULTS_TOKEN, // Authorization: Bearer <token>
});
```

```sh
curl -X POST localhost:3000/_faults/payments/respond -H "authorization: Bearer $FAULTS_TOKEN" \
  -H 'content-type: application/json' -d '{"status": 503, "paths": "/charges", "rate": 0.2, "for": "10m"}'
```

| Route                                     | What it does                                                     |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `GET /_faults`                            | The targets: their operations, groups, filters, kinds and rules  |
| `POST /_faults/:target/:kind`             | A rule (`fail`, `delay`, `hang`, `down`, `respond`, `drop`): 201 |
| `DELETE /_faults/:target/rules/:id`       | That rule removed                                                |
| `POST /_faults/:target/rules/:id/release` | What it holds goes on                                            |
| `POST /_faults/:target/up`                | No more `down`                                                   |
| `DELETE /_faults/:target`                 | The rules of the target removed                                  |
| `DELETE /_faults`                         | Every rule of every target removed                               |

- The body of a rule has its options as JSON: `operations`, `rate`, `after`, `times`, `ms`, `jitter`,
  `message`, the filters of the target (names, lists of them, or `{ "regex": "^user:" }`) and those of `respond`.
  Other keys are a 400; functions (`match`, `error`) cannot be sent.
- `for`: how long the rule stays (`30000`, `'30s'`, `'10m'`); never more than `maxDuration` (`'1h'`), so a fault
  that was forgotten does not stay. The rules made by the routes are removed when the app closes.
- Protected, always: `token` (16 characters or more; `Authorization: Bearer` or `x-faults-token`, compared in constant
  time), `authorize(request)`, or `auth` (a rule of [@xufa/auth](../auth), as the `config.auth` of the routes). Without
  one, registering fails.
- Off in production (`NODE_ENV`): it registers nothing. `enabled: true` there needs `allowProduction: true` too.
- Every change is logged (`fault injected`, `fault removed`, `fault expired`...) at warn, and the routes are left out of
  OpenAPI documents. `path` moves them (`/_faults`).

## Errors

The errors of `fail` and `down` are `FaultError`s (code `XUFA_FAULT`, status 503), or the ones of each part: those of
the ORM are its `FaultError` (`XUFA_ORM_ERR_FAULT`), those of the client a refused connection (a `RequestError`,
retried as such), those of the bus a `BusError`. `err instanceof FaultError` (and `isFault(err)`) is true of all of
them: of every error whose code ends in `FAULT`.

## Faults of your own

```js
const { Faults, wrap, cacheFaults } = require('@xufa/faults'); // or require('xufa/faults')

const faults = new Faults({
  operations: ['charge', 'refund'],
  groups: { money: ['charge', 'refund'] },
  filters: { customers: 'customer' }, // the option customers matches context.customer
});
const charge = (customer, amount) =>
  faults.apply({ operation: 'charge', customer }, () => gateway.charge(customer, amount));

faults.add('declined', { operations: 'charge', times: 1 }, { replace: () => ({ status: 'declined' }) });
```

- `new Faults({ operations, groups, defaults, filters, error, downMessage })`: `filters` maps options to fields of the
  context (`{ field: 'path', prefixes: true }` for prefixes).
- `faults.apply(context, run)`: runs the operation through the rules. `faults.pick(context)` gives the rules that act on
  it at once (for operations that cannot wait: the bus drops a message that way).
- `faults.add(kind, options, { replace })`: a kind of its own; `replace(context)` is what the operation gives instead.
- `wrap(faults, object, methods, contextOf)`: the methods of an object go through the faults.
- `cacheFaults(cache, name)`: the faults of an object with `get`, `set`, `delete` and `clear`.

## License

MIT.
