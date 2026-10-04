# @xufa/router

A fast HTTP router with the API of [find-my-way](https://github.com/delvedor/find-my-way), and no dependencies. It
is the router of [xufa](../xufa), and works on its own.

```js
const http = require('node:http');
const router = require('@xufa/router')({ ignoreTrailingSlash: true });

router.get('/users/:id', (req, res, params, store, searchParams) => res.end(`user ${params.id}`));
router.on(['GET', 'HEAD'], '/files/*', (req, res, params) => res.end(params['*']));

http.createServer((req, res) => router.lookup(req, res)).listen(3000);
```

## Same as find-my-way

Parametric (`:id`), multi-parametric (`:from-:to`), regexp (`:id(^\\d+$)`) and wildcard (`*`) routes; constraints
(`version`, `host` and strategies of your own); `on()`, `off()`, the shorthands, `lookup()`, `find()`,
`findRoute()`, `hasRoute()`, `reset()`, `prettyPrint()`; the options `ignoreTrailingSlash`,
`ignoreDuplicateSlashes`, `caseSensitive`, `maxParamLength`, `allowUnsafeRegex`, `querystringParser`,
`useSemicolonDelimiter`, `defaultRoute`, `onBadUrl`, `onMaxParamLength`, `constraints`, `buildPrettyMeta`. It passes
find-my-way's test suite.

## What it adds

- **`match(method, url, constraints?)`**: what xufa calls for every request. It finds the route without calling its
  handler and leaves the query string as it is: the result has `status` (`FOUND`, `BAD_URL` or `MAX_PARAM_LENGTH`),
  `handler`, `store`, `params` and the unparsed `querystring` (parse it only if it is read). The result object is
  reused: read it before the next call.

  ```js
  const found = router.match('GET', '/users/7?full=true');
  if (found !== null && found.status === Router.FOUND) found.handler(req, res, found.params, found.store);
  ```

- **Static paths in a map**: routes without parameters are found with one lookup, before the tree is walked.
- The `QUERY` method, and the helpers `safeDecodeURI`, `safeDecodeURIComponent`, `isSafeRegex`, `httpMethods`.

## TypeScript

find-my-way's declarations, with `match()`, `MatchResult` and the helpers.

## License

MIT. The declarations are ported from find-my-way (MIT).
