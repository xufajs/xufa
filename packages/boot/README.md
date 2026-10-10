# @xufa/boot

Loading of plugins, asynchronously and in order, with encapsulation, `after`/`ready`/`close` hooks and timeouts, with
the API of [avvio](https://github.com/fastify/avvio), and no dependencies. It loads the plugins of [xufa](../xufa),
and works on its own.

```js
import boot from '@xufa/boot';

const server = { name: 'app' };
const app = boot(server); // server gets use(), after(), ready(), close() and onClose() too

app.use(
  async (instance, options) => {
    instance.db = await connect(options.url); // instance is server (or what override() gives)
  },
  { url: 'postgres://...' }
);

app.after((err) => {
  if (err) throw err;
  // every plugin registered before after() is loaded: server.db is set
});

app.onClose((instance, done) => instance.db.end(done));

await app.ready();
await app.close();
```

## Same as avvio

`boot(server?, options?, done?)` with the options `expose`, `autostart` and `timeout`; `use()`, `after()`, `ready()`,
`close()`, `onClose()`, `override`, `start()`, `toJSON()` and `prettyPrint()` (the tree of plugins with the time each
one took to load), the `start`, `preReady` and `close` events, and `Symbol.asyncDispose`. It passes avvio's test
suite.

## What is different

- The error codes are `BOOT_ERR_*` (avvio's `AVV_ERR_*`), in `boot.errors`, created with
  [`@xufa/errors`](../errors).
- The queue of plugins is part of the package (avvio uses fastq), with the same semantics.

## TypeScript

avvio's declarations, with `errors`, `kBoot` and `kPluginMeta`.

## License

MIT. The declarations are ported from avvio (MIT).
