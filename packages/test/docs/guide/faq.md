# FAQ

## Do I have to change my tests?

Usually not. @xufa/test runs Jest and Vitest tests as they are, including their imports and your Jest configuration. [Migrating](../migrating/introduction.md) lists the few differences.

## My tests call `process.send`.

Jest runs tests in child processes, where `process.send` exists. In @xufa/test's worker threads it is there too, and does nothing; with `--pool forks` it is the real one.

## What is not supported yet?

In browser mode: coverage outside Chromium on Playwright. [Migrating](../migrating/missing.md) has the whole list.

## My tests expect `NODE_ENV=test`.

Jest and Vitest set it when it is not set; @xufa/test leaves the environment as it is, as some applications do much more work under `test`. Set it for the run (`NODE_ENV=test npx xufa-test`), or in `xufa.test.config.js`: `env: { NODE_ENV: 'test' }`.

## Where is the cache, and can I delete it?

In `node_modules/.cache/xufa-test`. Deleting it is always safe: the next run is slower while it fills it again. It is rebuilt by itself when your dependencies change.
