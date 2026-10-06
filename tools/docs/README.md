# docs generators

Makes the generated pages of `docs/` again. Every package has a folder of its own: `docs/<package>/index.html`,
with its other pages beside it (`docs/schema/guide.html`, `api.html`, `playground.html`...). The pages of the site
are at the root: `index.html`, `guide.html`, `packages.html`, `benchmarks.html`, `playground.html`, with
`style.css`, `main.js` and `xufa.js`.

- **The pages of the packages** from `pages/*.page.html`: each starts with a comment of JSON (`file`, `name`,
  `title`, `description`, the `groups` of its sidebar, and optionally `package`, `layout`, `scripts`, `nav`) and
  has the content of its `<article>` (or of its `<main>`, with `layout: 'tool'` or `'home'`). The head, the header,
  the sidebar, the tabs of a package with several pages (`SECTIONS` in `lib/pages.js`) and the footer are added by
  `lib/pages.js`, which checks that every section of the sidebar is in the page. A comment
  `<!--generated: router-performance-->` (or `logger-performance`) is replaced by what that generator makes.
- **Where every page is** (`lib/paths.js`): the sources name pages by their flat names (`schema-guide.html`,
  `http.html#routes`, `style.css`), and the build writes each page in its folder with those links as paths from
  there. The old addresses of the packages (`http.html`...) are small pages that send to their folders.
- **The index of the packages** (`packages.html`): its sidebar and its cards, from the list in `lib/packages-index.js`,
  and the table of the packages of `index.html`.
- **The sections of `benchmarks.html`** from the reports of `bench/results` (`lib/benchmarks.js`).
- **The scripts for browsers** (`lib/browser-bundle.js`): `schema/schema.js` (@xufa/schema, for its playground) and
  `xufa.js` (the packages of the playground of the site).
- **How xufa fares in each chart** (`lib/outcomes.js`), for its colors: a pair card gets `win`, `lose` or `even`
  from its badge, and each row of ours in a chart from its bar against the best of the others. Done on the generated
  pages and on the hand-written ones with charts (`HAND_WRITTEN` in `build.js`).

Written by hand: `index.html` (but its table of packages), `guide.html`, `http/`, `orm/`, `auth/`, `sequelize/`, the
scripts of the playgrounds (`playground.js`, `schema/playground.js`, `schema/playground-examples.js`,
`schema/infer.js`) and `style.css`, `main.js`. Their links are paths relative to where they are.

```sh
pnpm docs         # writes the pages that changed
pnpm docs:check   # writes nothing; fails when a page differs from its sources
```

Edit the sources here, not the generated pages: `docs:check` fails on a generated page edited by hand. `docs/` is not
formatted by prettier (`.prettierignore`), so the pages are written as the generators make them.

After a new run of a benchmark, update the name of its report in the generator (`router-2.md`, `logger-2.md`...) and
run `pnpm docs`.
