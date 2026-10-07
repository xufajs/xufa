# docs generators

Makes the generated pages of `docs/` again. Every package has a folder of its own: `docs/<package>/index.html`,
with its other pages beside it (`docs/schema/guide.html`, `api.html`, `playground.html`...). The pages of the site
are at the root: `index.html`, `guide.html`, `packages.html`, `benchmarks.html`, `playground.html`, with
`style.css`, `main.js` and `xufa.js`.

- **The pages of the packages** from `pages/*.page.html`: each starts with a comment of JSON (`file`, `name`,
  `title`, `description`, the `groups` of its sidebar, and optionally `package`, `layout`, `scripts`, `nav`, `packages`) and
  has the content of its `<article>` (or of its `<main>`, with `layout: 'tool'` or `'home'`). The head, the header,
  the sidebar, the tabs of a package with several pages (`SECTIONS` in `lib/pages.js`) and the footer are added by
  `lib/pages.js`, which checks that every section of the sidebar is in the page. A comment
  `<!--generated: router-performance-->` (or `logger-performance`) is replaced by what that generator makes. The
  pages of the header (`guide`, `http`, `orm`, `auth`, `sequelize`) are sources too: `nav` marks their link of the header,
  `packages: false` leaves the list of the packages out of their sidebar, and an item of a sidebar can be a page of
  the site (`["benchmarks.html#http", "Benchmarks"]`). The home page is one too (`index.page.html`: `layout: 'home'`,
  `nav: 'home'`, `fullTitle`, `og` for its Open Graph tags), its table of the packages filled by
  `lib/packages-index.js`.
- **Where every page is** (`lib/paths.js`): the sources name pages by their flat names (`schema-guide.html`,
  `http.html#routes`, `style.css`), and the build writes each page in its folder with those links as paths from
  there. The old addresses of the packages (`http.html`...) are small pages that send to their folders.
- **The index of the packages** (`packages.html`): its sidebar and its cards, from the list in `lib/packages-index.js`,
  and the table of the packages of `index.html`.
- **The sections of `benchmarks.html`** from the reports of `bench/results` (`lib/benchmarks.js`).
- **The pages of reference** (`lib/reference.js`): `docs/<package>/reference.html` of every package with
  declarations of its own (all but `http`, `schema`, whose API pages are written, and the umbrella `xufa`), made from
  `packages/<package>/index.d.ts` with the TypeScript compiler: every function, class, constant, interface and type in
  the order of the file (those of a `declare namespace` as the package's), its signature as written, its doc comment
  (`/** */`, with `@param`, `@returns`, `@default`, `@example`, `@deprecated`), and the members of classes and
  interfaces in tables whose types link to their declarations. Those packages have tabs: Overview, Reference, and
  Playground when the playground of the site has a tool for them (`PLAYGROUND_TOOLS` in `lib/pages.js`; the tab
  opens `playground.html#<tool>`). A better reference is a better doc comment in the declarations.
- **The scripts for browsers** (`lib/browser-bundle.js`): `schema/schema.js` (@xufa/schema, for its playground) and
  `xufa.js` (the packages of the playground of the site: schema, expression, template, yaml, marshal, router,
  serializer; with a small `Buffer` of its own, over `Uint8Array`, for the writer of the serializer).
- **How xufa fares in each chart** (`lib/outcomes.js`), for its colors: a pair card gets `win`, `lose` or `even`
  from its badge, and each row of ours in a chart from its bar against the best of the others. Done on the generated
  pages.

Written by hand: `packages.html` and `benchmarks.html` (but what is made into them), the scripts of the playgrounds
(`playground.js`, `schema/playground.js`, `schema/playground-examples.js`, `schema/infer.js`) and `style.css`,
`main.js`. Their links are paths relative to where they are.

```sh
pnpm docs           # writes the pages that changed
pnpm docs:check     # writes nothing; fails when a page differs from its sources, the crawl finds a problem, or an
                    # example does not run as shown
pnpm docs:crawl     # the crawl alone
pnpm docs:examples  # the examples alone (node tools/docs/examples/run.js --all: which blocks run as they are)
pnpm docs:types     # the TypeScript examples alone (node tools/docs/examples/types.js --all: which compile)
```

### Examples that run

A block of code marked `<pre data-run>` in a source is run by `examples/run.js`, in a process of its own, with
`@xufa/*` and `xufa/*` resolved to the packages of the repository: it must end without an error (servers it opens,
closed; nothing on stderr; in 10 s). When the block right after it is a `<pre data-output>`, what the example prints
must be that, exactly; the page shows it as its output.

```html
<!--run-before: const xufa = require('@xufa/http'); const app = xufa(); -->
<pre data-run="not-found"><code class="language-js">app.setNotFoundHandler(...);
console.log((await app.inject('/nope')).statusCode);</code></pre>
<pre data-output><code class="language-plaintext">404</code></pre>
```

- `<!--run-before: code-->` just before an example is code for that one only, not shown: the requires and the
  values a snippet takes from the text around it.
- `<pre data-setup>` is shown, and runs before every example after it in its page.
- `<!--run-setup: code-->` is not shown, and runs before every example after it in its page: the models and the data
  a page talks about (the Guide of the ORM has one before its queries).
- Examples run without `NODE_ENV`, in a temporary folder (files they write are removed).
- `--all` runs every JavaScript block, marked or not, to find those that run as they are; it does not run unmarked
  ones that name a server of a database (`postgres://`, `mongodb://`...), which would write to one on the machine.
  `--show` prints what the examples without an output print, to show it.

A TypeScript block (`language-ts`) marked `<pre data-run>` is not run: `examples/types.js` compiles it, strict and
without emitting, against the declarations of the packages of the repository, and it must have no errors. Each one is
a module of its own, compiled alone (a `declare module '@xufa/http'` of one is not seen by the others, and the module it
augments is imported for it); `<!--run-before: code-->` adds declarations it takes from the text around it
(`declare const client: MongoClient;`).

The crawl (`crawl.js`) opens every page in a browser from the disk (`file://`, as the docs are read), following the
links from `index.html`: a link to a page or file that is not there, to a folder, or to an anchor that is not in its
page, a page without the style of the site, and an error of a script fail it. It drives Chrome or Edge as installed
(`CHROME` gives another) with playwright-core, and is skipped without one.

Edit the sources here, not the generated pages: `docs:check` fails on a generated page edited by hand. `docs/` is not
formatted by prettier (`.prettierignore`), so the pages are written as the generators make them.

After a new run of a benchmark, update the name of its report in the generator (`router-2.md`, `logger-2.md`...) and
run `pnpm docs`.
