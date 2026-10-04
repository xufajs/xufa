# @xufa/errors

Classes of errors with a code, a status code and a message formatted with the arguments given, with the API of
[@fastify/error](https://github.com/fastify/fastify-error), and no dependencies. The errors of [xufa](../xufa) are
made with it.

```js
const createError = require('@xufa/errors');

const NotFound = createError('APP_NOT_FOUND', 'User %s not found', 404);

const err = new NotFound('ada'); // or NotFound('ada')
err.code; // 'APP_NOT_FOUND'
err.statusCode; // 404
err.message; // 'User ada not found'
err instanceof NotFound; // true
err instanceof createError.XufaError; // true, for every error made by createError
```

## Same as @fastify/error

`createError(code, message, statusCode = 500, Base = Error, captureStackTrace = true)`: the message is formatted
with `util.format`; a last argument `{ cause }` sets the cause; `Base` is the class the errors extend (`TypeError`...).

## What is different

- The class every error is an instance of is `XufaError` (`FastifyError`), and so is the name of the errors.
- `createError.captureStackTrace = false` turns stack traces off for the errors created after it (the default of the
  last argument).

## TypeScript

@fastify/error's declarations, with `XufaError` and `captureStackTrace`.

## License

MIT. The declarations are ported from @fastify/error (MIT).
