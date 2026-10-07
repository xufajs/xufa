# fastify plugins on xufa

The main plugins of fastify, run on `@xufa/http` as their READMEs show them: CORS, helmet, rate limits, cookies,
sessions, CSRF, JWT, auth, multipart, form bodies, static files, compression, ETags, caching, content negotiation,
the request context, under-pressure, env, autoload and the HTTP proxy (21 in all, in `test/plugins.test.js`).

They are installed in this folder only (it is not in the pnpm workspace), so the packages of xufa keep no
dependencies:

```sh
cd tools/fastify-plugins
npm install
npm test
```

A plugin that fails here is a difference between xufa and fastify: fix it in `packages/http`, or write it down in
the page From fastify (`tools/docs/pages/http-fastify.page.html`) when it is on purpose.
