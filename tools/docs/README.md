# docs generators

Makes the generated pages of `docs/` again:

- **The page of every package** (`pg.html`, `mongo.html`, `expression.html`, `template.html`, `cluster.html`,
  `logger.html`, `router.html`, `serializer.html`, `inject.html`, `boot.html`, `errors.html`) from `pages/*.page.html`:
  each starts with a comment of JSON (`file`, `name`, `title`, `description`, and the `groups` of its sidebar) and has
  the content of its `<article>`. The head, the header, the sidebar (its sections, then every package) and the footer
  are added by `lib/pages.js`, which checks that every section of the sidebar is in the page. A comment
  `<!--generated: router-performance-->` (or `logger-performance`) is replaced by what that generator makes
  (`lib/router-performance.js`, `lib/logger-performance.js`, from `bench/results`).
- **The index of the packages** (`packages.html`): its sidebar and its cards, from the list in `lib/packages-index.js`.
- **The sections of `benchmarks.html`** from the PostgreSQL driver to "Run them yourself", from the reports of
  `bench/results` (`lib/benchmarks.js`). The rest of that page is written by hand.
- **How xufa fares in each chart** (`lib/outcomes.js`), for its colors: a pair card gets `win`, `lose` or `even`
  from its badge (1.05× or more, 0.95× or less, in between), and each row of ours in a chart from its bar against the
  best of the others (`data-better="lower"` for times and sizes, `data-compare="previous"` against the row before).
  Done on the generated pages and on the hand-written ones with charts (`HAND_WRITTEN` in `build.js`).

The other pages of `docs/` (`index.html`, `guide.html`, `http.html`, `orm.html`, `auth.html`, `sequelize.html`) are
written by hand.

```sh
pnpm docs         # writes the pages that changed
pnpm docs:check   # writes nothing; fails when a page differs from its sources
```

Edit the sources here, not the generated pages: `docs:check` fails on a generated page edited by hand. `docs/` is not
formatted by prettier (`.prettierignore`), so the pages are written as the generators make them.

After a new run of a benchmark, update the name of its report in the generator (`router-2.md`, `logger-2.md`...) and
run `pnpm docs`.
