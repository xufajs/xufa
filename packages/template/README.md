# @xufa/template

Templates of text and HTML, with the safe expressions of [`@xufa/expression`](../expression): blocks, filters,
partials and escaping, compiled once and rendered many times. No dependencies outside xufa.

```js
const { render, compile, fill } = require('@xufa/template');

const page = compile(`
<h1>{{ title | upper }}</h1>
<ul>
  {{~#each items as item~}}
  <li class="{{ loop.first ? 'first' : '' }}">{{ item.name }}: {{ item.price | number('en-US', { style: 'currency', currency: 'USD' }) }}</li>
  {{~else~}}
  <li>Nothing yet</li>
  {{~/each~}}
</ul>
{{#if user}}Hello, {{ user.name }}{{else}}<a href="/login">Log in</a>{{/if}}`);

page({ title: 'Books', items, user });
```

## Tags

| Tag                                              | What it does                                                                                                                                                                                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{{ expression }}`                               | Its value, escaped for HTML                                                                                                                                                                                                                     |
| `{{{ expression }}}`                             | Its value as it is                                                                                                                                                                                                                              |
| `{{ value \| filter(args) \| other }}`           | Filters: functions of the value                                                                                                                                                                                                                 |
| `{{#if a}} {{else if b}} {{else}} {{/if}}`       | The first branch whose condition holds                                                                                                                                                                                                          |
| `{{#each list as item, key}} {{else}} {{/each}}` | Each item (lists, strings, iterables, `Map`s and objects: the key is the index or key), `loop.index`, `loop.number`, `loop.first`, `loop.last`, `loop.length`, `loop.key`; `{{else}}` when there is none. `item` is the name when none is given |
| `{{#with value as name}} {{/with}}`              | A value by a name                                                                                                                                                                                                                               |
| `{{> name}}`, `{{> name context}}`               | A partial, with the context, or over it the properties of the one given                                                                                                                                                                         |
| `{{! comment }}`, `{{!-- comment --}}`           | Nothing (the second can hold `}}`)                                                                                                                                                                                                              |
| `{{~` and `~}}`                                  | Take out the white space before and after the tag                                                                                                                                                                                               |
| `\{{`                                            | The text `{{`                                                                                                                                                                                                                                   |

Expressions are those of [`@xufa/expression`](../expression): JavaScript without assignments, statements or access to
prototypes and constructors (`{{ items.map(i => i.name).join(', ') }}`, ``{{ `${count} items` }}``,
`{{ user?.name ?? 'guest' }}`). In templates they are lenient: a name that is not there, or a member of `null`, is
nothing (`strict: true` makes them errors). Values are written as text: `null` and `undefined` as nothing, lists and
plain objects as JSON.

## Filters

`upper`, `lower`, `capitalize`, `trim`, `default(fallback)`, `json(indent)`, `join(separator)`, `length`, `first`,
`last`, `reverse`, `slice(start, end)`, `keys`, `values`, `truncate(length, end)`, `replace(search, replacement)`,
`round(digits)`, `fixed(digits)`, `number(locale, options)` (`Intl.NumberFormat`), `date(locale, options)`
(`Intl.DateTimeFormat`), `urlencode`, `escape` and `safe` (HTML as it is). Filters of your own:
`new TemplateEngine({ filters: { money: (value) => ... } })` or `engine.filter(name, fn)`.

## Engines and options

`new TemplateEngine(options)` (`compile`, `render`, `fill`, `filter`, `partial`); the module's functions use a default
one.

| Option      | Default | What it does                                                               |
| ----------- | ------- | -------------------------------------------------------------------------- |
| `escape`    | `true`  | HTML escaping; `false`, or a function of the text                          |
| `filters`   | `{}`    | Filters over the default ones                                              |
| `partials`  | `{}`    | Sources of partials by name                                                |
| `globals`   | `{}`    | Names of the expressions over the default globals                          |
| `builtins`  | `true`  | `false`: no default globals in expressions                                 |
| `strict`    | `false` | Names not given and members of `null` are errors                           |
| `maxDepth`  | `32`    | Partials in partials                                                       |
| `cacheSize` | `500`   | Templates compiled kept                                                    |
| `inline`    | `true`  | Templates rendered often become one function, with their paths read inline |

`compile(source, { name })` names the template in its errors; `{ escape: false }` writes values as they are.
`SafeString` marks text that is HTML already, and `escapeHtml` escapes.

## With @xufa/http

`plugin` renders views, files of a folder, as `@fastify/view` does (on fastify too):

```js
const xufa = require('xufa');
const template = require('@xufa/template'); // or require('xufa/template')

const app = xufa();
app.register(template.plugin, { root: 'views', layout: 'layout', defaultContext: { site: 'Books' } });
app.addHook('preHandler', async (request, reply) => {
  reply.locals = { user: request.user }; // in the context of every view of the request
});
app.get('/books/:id', async (request, reply) => reply.view('books/show', { book: await findBook(request.params.id) }));
```

`reply.view(name, data, { layout })` renders `<root>/<name>.html` and sends it as `text/html` (unless the reply has a
content type); `reply.viewAsync()` and `app.view()` give the text. The context is `defaultContext`, then
`reply.locals`, then the data. With a layout (of the plugin, or of the call; `false` for none), the view is given to it
as `{{ body }}`. Partials are files too: `{{> partials/header}}` is `views/partials/header.html`.

| Option           | Default                     | What it does                                                                  |
| ---------------- | --------------------------- | ----------------------------------------------------------------------------- |
| `root`           | `'views'`                   | The folder of the views                                                       |
| `extension`      | `'.html'`                   | Added to names without one                                                    |
| `layout`         | none                        | The view each view is rendered in, as `body`                                  |
| `defaultContext` | `{}`                        | The context of every view                                                     |
| `cache`          | `NODE_ENV === 'production'` | Files read once; without it, every render reads them (edits are seen at once) |
| `stream`         | `false`                     | Every view sent in chunks made as the client reads them (see below)           |
| `chunkSize`      | `65536`                     | The size of those chunks, in characters                                       |
| `propertyName`   | `'view'`                    | The name of the decorations (`reply.view`, `app.view`)                        |
| `engine`         | a new one                   | A `TemplateEngine` of your own; or its options (`filters`...) here            |

### Large pages

`reply.view(name, data, { stream: true })` (or `stream: true` for every view) sends the view in chunks (`chunkSize`
characters, 64 KB) made as the client reads them: the first bytes go at once, and the page is never whole in memory.
The layout is cut where it writes `{{ body }}`: its head goes first, then the chunks of the view, then its tail (a
layout that writes its body otherwise, twice or through a filter, is rendered whole). The files are read and compiled
before anything is sent, so a view that is not there is still a 500; an error while the view renders cuts the
response. A page of 200,000 rows (20 MB): the first byte in 2 ms instead of 265, all of it in 127 ms instead of 286, and
3 MB more of memory instead of 40 (`node bench/view.js`).

`compile(source).stream(context, { chunkSize })` gives those chunks of any template (a generator).

A name that leads out of `root` (`..`, an absolute path) is refused, so a view named by a request cannot read other
files; a view that is not there, or fails, is an error (500).

## Data with templates

`fill(value, context)` fills the strings of data (configuration, messages) without escaping: a string that is one
`{{ expression }}` alone gives its value (a number, a list, an object), the others their text; arrays and plain objects
are filled item by item.

```js
fill(
  { host: '{{ env.DB_HOST }}', port: '{{ Number(env.DB_PORT ?? 5432) }}', url: 'postgres://{{ env.DB_HOST }}/app' },
  { env: process.env }
); // { host: 'db', port: 5432, url: 'postgres://db/app' }
```

## Escaping

HTML escaping (of `&`, `<`, `>`, `"`, `'` and the backtick) makes values safe in the text of elements and in quoted attributes; not in `<script>`,
in `style`, nor in URLs (`href="{{ url }}"` with `javascript:...`): check those values before they go there.

## Errors

`TemplateError`, with `code` (`XUFA_TEMPLATE_ERR_SYNTAX`, `XUFA_TEMPLATE_ERR_RUNTIME`, `XUFA_TEMPLATE_ERR_PARTIAL`, or
`XUFA_EXPR_ERR_FORBIDDEN`), the name of the template, `line` and `column` in it.

## License

MIT.
