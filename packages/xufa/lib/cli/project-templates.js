// The files of a new project (xufa new) and of a new app in it (xufa startapp), as Django's startproject and
// startapp: the project is its file, xufa.yaml; each app a folder found by its name.
//
//   xufa.yaml        the project: its apps, database, accounts, roles, admin, the defaults of its views
//   templates/       the templates of the project (base.html, that the others extend)
//   <app>/           models.js, urls.yaml, views.js, admin.yaml, templates/<app>/, migrations/
//   seeds/           data for development, as YAML (xufa seed)
//   test/            tests of node:test with useTestApp()

const title = (name) => name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const projectFiles = (name, app) => ({
  'package.json': `${JSON.stringify(
    {
      name,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        start: 'xufa start',
        dev: 'xufa dev',
        test: 'xufa test',
        migrate: 'xufa migrate',
        makemigrations: 'xufa makemigrations',
        seed: 'xufa seed',
        routes: 'xufa routes',
        shell: 'xufa shell',
      },
      dependencies: { xufa: '*' },
      engines: { node: '^22.22.3 || ^24.15.0 || >=25.7.0' },
    },
    null,
    2
  )}\n`,
  'xufa.yaml': `# The project (Django's settings.py and urls.py). The environment goes over it: DATABASE_URL, SECRET_KEY, DEBUG,
# PORT, HOST, SITE_URL, EMAIL_URL, or APP__<KEY>__<KEY> for any other key.
name: ${title(name)}
apps: [${app}] # INSTALLED_APPS: folders (xufa startapp <name> adds one)

database: { url: sqlite:data/${name}.db }
views: { baseTemplate: base, paginateBy: 20 }
# Writes of sessions do not wait for the disk (PostgreSQL; nothing changes in SQLite): pages that write theirs (a
# counter, a cart, messages) answer about twice as fast; a crash of the database server may lose its last fraction of a
# second of them (a user logged out, a message lost), never more. Logouts everywhere are always written to the disk.
# false: every write waits.
sessions: { asyncCommit: true }

# Users and their pages (an app with a model of AbstractUser of xufa/auth), roles and the admin:
# auth: { user: accounts.User, loginBy: username, pages: /accounts }
# rbac: { roles: { editor: ['*.view', Book.*] } }
# admin: { title: ${title(name)} administration }
`,
  'templates/base.html': `{{!-- The base of every page: the templates of the apps (and the built-in ones of the views) fill its block content. --}}
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{#block title}}{{ title ?? '${title(name)}' }}{{/block}}</title>
  </head>
  <body>
    <header><a href="/">${title(name)}</a></header>
    <main>
      {{#each messages as message}}
      <p class="message {{ message.level }}">{{ message.text }}</p>
      {{/each}}
      {{#block content}}{{/block}}
    </main>
  </body>
</html>
`,
  'seeds/README.md': [
    '# Seeds',
    '',
    'Data for development (`npx xufa seed`): YAML files of objects by model, in order, or JS functions.',
    '',
    '```yaml',
    '# seeds/library.yaml',
    '$unless: { Author: { lastName: Le Guin } } # once',
    'Author:',
    '  - { $key: leguin, firstName: Ursula, lastName: Le Guin }',
    'Book:',
    '  - { title: A Wizard of Earthsea, author: $leguin }',
    '```',
    '',
  ].join('\n'),
  [`test/${app}.test.js`]: `// The tests of the project (npm test: xufa test): useTestApp() builds the app once for the file, on SQLite in
// memory, and rolls back each test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useTestApp } from 'xufa/testing';

const app = useTestApp();

test('the home page answers', async () => {
  const res = await app.client().get('/');
  assert.equal(res.statusCode, 200);
  assert.match(res.textContent, /${title(name)}/);
});
`,
  '.env.example': `DATABASE_URL=sqlite:data/${name}.db
SECRET_KEY=change-me-a-long-random-text
DEBUG=true
PORT=8000
`,
  '.gitignore': `node_modules
data
.env
.xufa
`,
  'README.md': `# ${title(name)}

A project of [xufa](https://github.com/xufajs/xufa): \`xufa.yaml\` and its apps.

\`\`\`sh
npm install
npx xufa migrate            # the tables of the models
npm run dev                 # http://127.0.0.1:8000, restarted on changes
npm test
\`\`\`

- \`npx xufa startapp catalog\`: a new app (its models, urls.yaml, views, admin, templates), added to \`apps\`.
- \`npx xufa makemigrations\`, then \`npx xufa migrate\`, when models change.
- \`npx xufa seed\`: the data of \`seeds/\`. \`npx xufa shell\`: a REPL with the models.
- \`npx xufa routes\`: the routes, by name.
`,
});

// The files of an app; home: the first app of a new project, with its home page.
const appFiles = (app, { home = false } = {}) => ({
  [`${app}/models.js`]: `// The models of ${app} (models.py): tables ${app}_<model>.
//
//   export class Book extends Model {
//     static fields = { title: fields.string({ maxLength: 200 }), published: fields.date({ null: true }) };
//     static options = { ordering: ['title'], display: '{title}' };
//   }
import { Model, fields } from 'xufa/orm'; // eslint-disable-line no-unused-vars
`,
  [`${app}/urls.yaml`]: `# The pages of ${app} (urls.py): views of views.js, templates, redirects, and crud: the five pages of a model
# (books, book-detail, book-create, book-update, book-delete).
prefix: ${home ? '/' : `/${app}`}
routes:
${home ? `  - { path: /, name: home, template: ${app}/index }\n` : `  # - { path: /, name: ${app}-index, view: index }\n`}  # - { crud: Book, fields: [title, published] }
`,
  [`${app}/views.js`]: `// The views of ${app} with logic of their own (views.py): functions of (request, reply), or views of classes of
// xufa/views, exported by name. urls.yaml puts them at their addresses.
//
//   export async function index(request, reply) { ... }
export {};
`,
  [`${app}/admin.yaml`]: `# The models of ${app} in the admin (admin.py), with the options of their lists and forms:
# Book:
#   list: [title, published]
#   search: [title]
`,
  ...(home
    ? {
        [`${app}/templates/${app}/index.html`]: `{{extends 'base'}}

{{#block content}}
<h1>{{ title ?? 'Welcome' }}</h1>
<p>Your project works. Its pages are in the urls.yaml of its apps; this one is ${app}/templates/${app}/index.html.</p>
{{/block content}}
`,
      }
    : { [`${app}/templates/${app}/.gitkeep`]: '' }),
  [`${app}/migrations/.gitkeep`]: '',
});

// xufa.yaml with one app more in apps: [...] (a list in one line); null when it has not one.
function withApp(text, app) {
  const match = /^apps:\s*\[([^\]\n]*)\]/m.exec(text);
  if (!match) return null;
  const apps = match[1]
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (apps.includes(app)) return text;
  return text.replace(match[0], `apps: [${[...apps, app].join(', ')}]`);
}

export { projectFiles, appFiles, withApp, title };
