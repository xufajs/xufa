# @xufa/logger

A fast JSON logger with the API of [pino](https://getpino.io), and no dependencies. It is the logger of
[xufa](../xufa), and works on its own.

```js
const logger = require('@xufa/logger')({ level: 'debug', redact: ['req.headers.authorization'] });

logger.info('hello %s', 'world'); // {"level":30,"time":...,"pid":...,"hostname":...,"msg":"hello world"}
logger.child({ requestId: 'r1' }).warn({ user: 7 }, 'slow request');
logger.error(new Error('failed')); // the error serialized as "err", its message as "msg"
```

## Same as pino

The options, methods and output of pino: `level`, `customLevels`, `useOnlyCustomLevels`, `levels`, `name`, `base`,
`timestamp` (and `stdTimeFunctions`), `messageKey`, `errorKey`, `nestedKey`, `msgPrefix`, `mixin`,
`mixinMergeStrategy`, `formatters` (`level`, `bindings`, `log`), `serializers` (and `stdSerializers`), `redact`
(paths, `censor`, `remove`), `hooks` (`logMethod`, `streamWrite`), `onChild`, `crlf`, `enabled`; `child()`,
`bindings()`, `setBindings()`, `isLevelEnabled()`, `flush()`, `symbols`, `multistream()` and `destination()`.

`destination()` gives a `Destination`, which writes to a file descriptor or a file, synchronously (the default) or
buffered (`{ sync: false, minLength }`), as sonic-boom does for pino:

```js
const pino = require('@xufa/logger');
const logger = pino(pino.destination({ dest: './app.log', sync: false, mkdir: true }));
process.on('SIGHUP', () => logger[pino.symbols.streamSym].reopen()); // log rotation
```

## Not supported

- **Transports** (`transport` option, `pino.transport()`): it throws. Logs go to a stream: give one, or pipe the
  output of the process (`node app.js | pino-pretty`).
- The `level-change` event, `levelComparison`, `depthLimit` and `edgeLimit`, and pino's browser build.

## TypeScript

pino's declarations, without transports and with `Destination` (`index.d.ts`, `std-serializers.d.ts`).

## License

MIT. The declarations are ported from pino and pino-std-serializers (MIT).
