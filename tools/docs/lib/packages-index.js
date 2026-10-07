// docs/packages.html: its sidebar and its article, an index of cards linking to the page of every package (the head
// and the header of the page are kept as they are).

const GROUPS = [
  [
    'The framework',
    'framework',
    [
      [
        'http.html',
        '@xufa/http',
        'fastify',
        'The HTTP framework: routes, schemas, hooks, plugins and decorators, with the API of fastify.',
      ],
      [
        'websocket.html',
        '@xufa/websocket',
        'ws, @fastify/websocket',
        'WebSockets: the client and server of ws, WebSocket routes, and rooms across workers and machines.',
      ],
      [
        'openapi.html',
        '@xufa/openapi',
        '@fastify/swagger, @fastify/swagger-ui',
        'OpenAPI documents of the routes, with resources and security documented, and an explorer.',
      ],
      [
        'client.html',
        '@xufa/client',
        'got, axios',
        'A client of HTTP APIs on fetch: JSON, timeouts, retries, and the cancellation of the request that calls.',
      ],
      [
        'schema.html',
        '@xufa/schema',
        'ajv, @sinclair/typebox',
        'Schemas as code (plain JSON Schema, typed) or JSON Schema draft-04 to 2020-12, compiled into fast validators.',
      ],
      [
        'orm.html',
        '@xufa/orm',
        'the Django ORM',
        'Models, querysets and migrations for PostgreSQL, MongoDB, SQLite, files, stores of objects (S3, Azure Blob) and email, with tenants and caches.',
      ],
      [
        'auth.html',
        '@xufa/auth',
        'jsonwebtoken, otplib',
        'Passwords, JWT, refresh tokens, TOTP and lockout, as a plugin of @xufa/http.',
      ],
      [
        'admin.html',
        '@xufa/admin',
        'the Django admin',
        'The admin of the models: lists with search, filters and pages, forms with their validation, for every backend.',
      ],
      [
        'session.html',
        '@xufa/session',
        '@fastify/session, express-session',
        'Sessions of browsers: signed cookies, stores in memory or in the database, flash messages and CSRF tokens.',
      ],
      [
        'sequelize.html',
        '@xufa/sequelize',
        'Sequelize',
        'The API of Sequelize 6 over the xufa ORM: existing code runs as it is.',
      ],
    ],
  ],
  [
    'Drivers',
    'drivers',
    [
      ['pg.html', '@xufa/pg', 'pg', 'A PostgreSQL driver: Client, Pool, transactions, TLS, COPY and LISTEN/NOTIFY.'],
      [
        'mongo.html',
        '@xufa/mongo',
        'mongodb',
        'A MongoDB driver with its own BSON: cursors, sessions, transactions and replica sets.',
      ],
    ],
  ],
  [
    'Expressions and templates',
    'templates',
    [
      [
        'expression.html',
        '@xufa/expression',
        'eval, expr-eval',
        'JavaScript expressions evaluated safely, compiled to closures and to code once they are hot.',
      ],
      [
        'template.html',
        '@xufa/template',
        'Handlebars, Mustache',
        'Templates with expressions, partials, layouts and streaming, and reply.view() for @xufa/http.',
      ],
    ],
  ],
  [
    'Security',
    'security',
    [
      [
        'jwt.html',
        '@xufa/jwt',
        'jsonwebtoken',
        'JSON Web Tokens with the API and the tests of jsonwebtoken, jws and jwa, with EdDSA. @xufa/auth signs with it.',
      ],
    ],
  ],
  [
    'Running',
    'running',
    [
      [
        'cluster.html',
        '@xufa/cluster',
        'node:cluster',
        'An app in a cluster of processes, restarted when they die, stopped gracefully, with a message bus and pools of nodes.',
      ],
      [
        'config.html',
        '@xufa/config',
        'node-config, convict, dotenv, node-vault',
        'The configuration from files by environment, .env, variables, HTTP, Consul and Vault, with safe templates, a schema and secrets redacted.',
      ],
      [
        'scheduler.html',
        '@xufa/scheduler',
        'node-cron, agenda',
        'Jobs on intervals, cron or once: no overlaps, timeouts, isolated failures, once among machines with a lock.',
      ],
      [
        'queue.html',
        '@xufa/queue',
        'BullMQ, Laravel queues, workflow engines',
        'Jobs in the background kept in a database of the ORM: workers anywhere, retries, timeouts, enqueued in transactions; pipelines of steps.',
      ],
      [
        'discovery.html',
        '@xufa/discovery',
        'UDP',
        'The nodes of a service found on the network by multicast, broadcast or seeds, with their meta, sealed with a secret.',
      ],
      [
        'netcache.html',
        '@xufa/netcache',
        'Redis, as a cache',
        'A cache shared by the machines of a service: a copy in each, every write sent to all over sealed TCP.',
      ],
      [
        'faults.html',
        '@xufa/faults',
        'Toxiproxy, nock',
        'Faults made to happen by rules: the database, caches, API calls or the bus fail, wait or hang, to test resilience.',
      ],
      [
        'marshal.html',
        '@xufa/marshal',
        'devalue, superjson',
        'Values as JSON that keeps classes, shared references, cycles, BigInt, Date, Map, Set and errors; safe to parse.',
      ],
      ['yaml.html', '@xufa/yaml', 'js-yaml', 'YAML 1.2: load and dump, with the API and the tests of js-yaml.'],
    ],
  ],
  [
    'The parts of @xufa/http',
    'parts',
    [
      [
        'logger.html',
        '@xufa/logger',
        'pino',
        'A JSON logger with levels, child loggers, redaction, serializers and destinations.',
      ],
      [
        'router.html',
        '@xufa/router',
        'find-my-way',
        'A radix-tree router compiled to code: parameters, wildcards, regular expressions and constraints.',
      ],
      [
        'serializer.html',
        '@xufa/serializer',
        'fast-json-stringify',
        'JSON written by functions compiled from JSON schemas.',
      ],
      [
        'inject.html',
        '@xufa/inject',
        'light-my-request',
        'Fake HTTP requests to a request handler, without a socket: the app.inject() of your tests.',
      ],
      [
        'boot.html',
        '@xufa/boot',
        'avvio',
        'Loading of plugins, in order, with encapsulation, after/ready/close hooks and timeouts.',
      ],
      [
        'errors.html',
        '@xufa/errors',
        '@fastify/error',
        'Classes of errors with a code, a status code and a formatted message.',
      ],
    ],
  ],
];

const sidebar = GROUPS.map(
  ([title, , items]) =>
    `        <h4>${title}</h4>\n        <ul>\n` +
    items.map(([href, name]) => `          <li><a href="${href}">${name}</a></li>\n`).join('') +
    '        </ul>\n'
).join('');

const article =
  `        <h1>Packages</h1>
        <p class="intro">
          Every part of xufa is a package of its own, with no dependencies, usable without the rest, and with a page of
          its own here. Most have the API of a library you may know, and pass that library's test suite: the name under
          each package is the library it can replace.
        </p>
        <pre><code class="language-sh">npm install xufa # all of them, as one package
npm install @xufa/pg # or only the one you need</code></pre>
` +
  GROUPS.map(
    ([title, id, items]) =>
      `\n        <h2 id="${id}">${title}</h2>\n        <div class="package-cards">\n` +
      items
        .map(
          ([href, name, replaces, text]) =>
            `          <a class="package-card" href="${href}">\n` +
            `            <h3>${name}</h3>\n` +
            `            <span class="package-replaces">${replaces}</span>\n` +
            `            <p>${text}</p>\n` +
            `          </a>\n`
        )
        .join('') +
      '        </div>\n'
  ).join('');

function buildPackagesIndex(page) {
  let html = page;
  const replaceBetween = (start, end, body) => {
    const a = html.indexOf(start);
    const b = html.indexOf(end, a);
    if (a < 0 || b < 0) throw new Error('not found: ' + start);
    html = html.slice(0, a + start.length) + '\n' + body + html.slice(b);
  };
  replaceBetween('<aside class="sidebar">', '      </aside>', sidebar);
  replaceBetween('<article class="content">', '      </article>', article);
  html = html.replace(
    /content="The packages of xufa[^"]*"/,
    'content="The packages of xufa, each usable alone and with a page of its own: the framework, the PostgreSQL and MongoDB drivers, expressions and templates, cluster, and the parts of @xufa/http."'
  );
  return html;
}

// The table of the packages of the home page (index.html), between <!--generated: packages-table--> and
// <!--/generated-->: the same packages as the index, by group.
const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function buildHomeTable(page) {
  const start = '<!--generated: packages-table-->';
  const end = '<!--/generated-->';
  const a = page.indexOf(start);
  const b = page.indexOf(end, a);
  if (a < 0 || b < 0) throw new Error('index.html has no <!--generated: packages-table--> ... <!--/generated-->');
  const rows = GROUPS.map(
    ([title, id, items]) =>
      `                <tr class="group"><th colspan="3"><a href="packages.html#${id}">${esc(title)}</a></th></tr>
` +
      items
        .map(
          ([href, name, replaces, text]) =>
            `                <tr><td><a href="${href}"><code>${esc(name)}</code></a></td><td>${esc(replaces)}</td><td>${esc(text)}</td></tr>
`
        )
        .join('')
  ).join('');
  return `${page.slice(0, a + start.length)}
${rows}                ${page.slice(b)}`;
}

module.exports = { buildPackagesIndex, buildHomeTable, GROUPS };
