// The playground of xufa (playground.html): packages of xufa that run in a browser (xufa.js, made by the build of the
// docs; xufa-http.js for the routes, loaded when its tool is opened), each with examples to start from. The result
// updates as you type; "Copy link" keeps the tool and what was written in the address.
(function () {
  'use strict';

  function $(id) {
    return document.getElementById(id);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // A problem with what was written in a panel (shown on that panel).
  function Problem(panel, message) {
    this.panel = panel;
    this.message = message;
  }

  function json(text, panel) {
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Problem(panel, 'Not JSON: ' + err.message);
    }
  }

  // Code of the editor: JavaScript run here, in your browser, with the names given, giving the variable `name`.
  function code(text, panel, names, name) {
    try {
      var keys = Object.keys(names);
      var fn = new Function(keys.join(','), text + '\n;return typeof ' + name + ' === "undefined" ? undefined : ' + name + ';');
      var value = fn.apply(null, keys.map(function (key) { return names[key]; }));
      if (value === undefined) throw new Error('Define `' + name + '`, as in the example');
      return value;
    } catch (err) {
      if (err instanceof Problem) throw err;
      throw new Problem(panel, err.message);
    }
  }

  // Code of the editor that may await: an async function with the names given, giving the variable `name`.
  var AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  function asyncCode(text, panel, names, name) {
    var keys = Object.keys(names);
    var fn;
    try {
      fn = new AsyncFunction(keys.join(','), text + '\n;return typeof ' + name + ' === "undefined" ? undefined : ' + name + ';');
    } catch (err) {
      return Promise.reject(new Problem(panel, err.message));
    }
    return fn.apply(null, keys.map(function (key) { return names[key]; })).then(
      function (value) {
        if (value === undefined) throw new Problem(panel, 'Define `' + name + '`, as in the example');
        return value;
      },
      function (err) {
        throw err instanceof Problem ? err : new Problem(panel, err && err.message ? err.message : String(err));
      }
    );
  }

  // The console of the page, put back after a tool that shows what an app logs.
  var CONSOLE = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  function restoreConsole() {
    Object.keys(CONSOLE).forEach(function (key) { console[key] = CONSOLE[key]; });
  }

  // Requests, one a line: METHOD /url, and below it, indented, headers (name: value) and then a body (JSON or text).
  function parseRequests(text) {
    var list = [];
    text.split('\n').forEach(function (line, i) {
      if (!line.trim() || /^\s*(#|\/\/)/.test(line)) return;
      var current = list[list.length - 1];
      if (/^\s/.test(line)) {
        if (!current) throw new Problem('requests', 'Line ' + (i + 1) + ': a header or a body before any request');
        var header = /^\s+([A-Za-z0-9-]+):\s*(.*)$/.exec(line);
        if (header && current.body === null) current.options.headers[header[1].toLowerCase()] = header[2];
        else current.body = (current.body === null ? '' : current.body + '\n') + line.trim();
        return;
      }
      var match = /^([A-Za-z]+)\s+(\S+)$/.exec(line.trim());
      if (!match) throw new Problem('requests', 'Line ' + (i + 1) + ': write METHOD /url (GET /books), with headers and a body indented below it');
      var method = match[1].toUpperCase();
      list.push({ label: method + ' ' + match[2], body: null, options: { method: method, url: match[2], headers: {} } });
    });
    if (list.length === 0) throw new Problem('requests', 'Write a request: GET /');
    list.forEach(function (request) {
      if (request.body === null) return;
      request.options.payload = request.body;
      if (!request.options.headers['content-type']) {
        var isJson = true;
        try {
          JSON.parse(request.body);
        } catch (err) {
          isJson = false;
        }
        request.options.headers['content-type'] = isJson ? 'application/json' : 'text/plain';
      }
    });
    return list;
  }

  // A script of the docs, loaded once (the packages of a tool that is not in xufa.js).
  var loading = {};
  function loadScript(src) {
    if (!loading[src]) {
      loading[src] = new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = function () {
          delete loading[src];
          reject(new Error('The packages did not load (' + src + ').'));
        };
        document.head.appendChild(script);
      });
    }
    return loading[src];
  }

  function show(value) {
    if (value === undefined) return 'undefined';
    if (typeof value === 'bigint') return value + 'n';
    if (typeof value === 'string') return JSON.stringify(value);
    try {
      var text = JSON.stringify(value, function (key, inner) {
        return typeof inner === 'bigint' ? inner + 'n' : inner;
      }, 2);
      return text === undefined ? String(value) : text;
    } catch (err) {
      return String(value);
    }
  }

  // The tools: their panels (a panel of code or data each), examples, and what they show.
  var TOOLS = [
    {
      id: 'http',
      label: 'Routes',
      page: 'http/index.html',
      name: '@xufa/http',
      intro:
        'An app of @xufa/http, run in your browser: its routes, schemas, hooks and plugins, called with app.inject() (the requests of the tests, without a server). The same code runs on Node.js.',
      needs: { global: 'xufaHttp', src: 'xufa-http.js' },
      panels: [
        { id: 'app', label: 'App', note: 'JavaScript: xufa and s are given; define `app`', big: true },
        { id: 'requests', label: 'Requests', note: 'METHOD /url; indented below it, headers and a body' },
      ],
      examples: [
        {
          label: 'Routes, parameters and the query',
          hint: 'Add a route, or a request to it: the replies update as you type.',
          values: {
            app: "const app = xufa();\n\napp.get('/hello/:name', async (request) => {\n  return { hello: request.params.name, lang: request.query.lang ?? 'en' };\n});\n\napp.get('/text', async (request, reply) => {\n  reply.type('text/plain').header('x-powered-by', 'xufa');\n  return 'plain text';\n});",
            requests: 'GET /hello/ada?lang=es\nGET /hello/grace\nGET /text\nGET /nope',
          },
        },
        {
          label: 'Schemas: the body checked, the reply filtered',
          hint: 'The secret is not in the replies: the schema of the response writes only its properties. Make pages required.',
          values: {
            app: "const app = xufa();\n\nconst Book = s.object({\n  id: s.integer(),\n  title: s.string({ minLength: 1 }),\n  pages: s.optional(s.integer({ minimum: 1 })),\n});\nconst NewBook = s.omit(Book, ['id']);\nconst books = [];\n\napp.post('/books', { schema: { body: NewBook, response: { 201: Book } } }, async (request, reply) => {\n  const book = { id: books.length + 1, ...request.body, secret: 'not in the reply' };\n  books.push(book);\n  reply.code(201);\n  return book;\n});\n\napp.get('/books', { schema: { response: { 200: s.array(Book) } } }, async () => books);",
            requests: 'POST /books\n  {"title": "Dune", "pages": 412}\nPOST /books\n  {"title": ""}\nPOST /books\n  {"title": "Emma", "pages": "many"}\nGET /books',
          },
        },
        {
          label: 'Hooks, decorators and plugins',
          hint: 'Send the token to /admin/stats (authorization: Bearer secret), or move the hook out of the plugin.',
          values: {
            app: "const app = xufa({ logger: true });\n\napp.decorateRequest('user', null);\napp.addHook('onRequest', async (request) => {\n  request.user = request.headers.authorization === 'Bearer secret' ? { name: 'ada' } : null;\n});\n\napp.get('/', async (request) => ({ user: request.user }));\n\n// A plugin: its hooks apply to its routes only.\napp.register(\n  async (admin) => {\n    admin.addHook('preHandler', async (request, reply) => {\n      if (!request.user) return reply.code(401).send({ error: 'Log in first' });\n    });\n    admin.get('/stats', async (request) => ({ hello: request.user.name, routes: 3 }));\n  },\n  { prefix: '/admin' }\n);",
            requests: 'GET /\nGET /admin/stats\nGET /admin/stats\n  authorization: Bearer secret',
          },
        },
        {
          label: 'Errors and their handlers',
          hint: 'Remove the error handler: the default one answers with statusCode, error and message.',
          values: {
            app: "const app = xufa();\n\napp.get('/books/:id', async (request) => {\n  const err = new Error(`No book ${request.params.id}`);\n  err.statusCode = 404;\n  throw err;\n});\napp.get('/crash', async () => {\n  throw new Error('Something broke');\n});\n\napp.setErrorHandler(async (err, request, reply) => {\n  reply.code(err.statusCode ?? 500);\n  return { error: err.message, at: request.url };\n});\napp.setNotFoundHandler(async (request, reply) => {\n  reply.code(404);\n  return { error: 'No such route', method: request.method };\n});",
            requests: 'GET /books/7\nGET /crash\nDELETE /books',
          },
        },
      ],
      run: function (v) {
        var x = window.xufaHttp;
        var requests = parseRequests(v.requests);
        var logs = [];
        var capture = function () {
          logs.push(Array.prototype.map.call(arguments, function (item) {
            return typeof item === 'string' ? item : show(item);
          }).join(' '));
        };
        console.log = console.info = console.warn = console.error = capture;
        var app = null;
        return Promise.resolve()
          .then(function () {
            return asyncCode(v.app, 'app', { xufa: x.http, s: x.schema.s }, 'app');
          })
          .then(function (made) {
            app = made;
            if (!app || typeof app.inject !== 'function') throw new Problem('app', '`app` is not an app: const app = xufa();');
            return app.ready().catch(function (err) {
              throw new Problem('app', err.message);
            });
          })
          .then(function () {
            var results = [];
            return requests
              .reduce(function (chain, request) {
                return chain.then(function () {
                  return app.inject(request.options).then(function (res) {
                    results.push({ request: request, res: res });
                  });
                });
              }, Promise.resolve())
              .then(function () {
                return results;
              });
          })
          .then(function (results) {
            var sections = results.map(function (result) {
              var res = result.res;
              var lines = [res.statusCode + ' ' + (res.statusMessage || '')];
              Object.keys(res.headers).forEach(function (name) {
                if (name !== 'date' && name !== 'connection') lines.push(name + ': ' + res.headers[name]);
              });
              var body = res.body;
              if (/json/.test(res.headers['content-type'] || '')) {
                try {
                  body = JSON.stringify(JSON.parse(body), null, 2);
                } catch (err) {
                  body = res.body;
                }
              }
              return { title: result.request.label + ' → ' + res.statusCode, pre: lines.join('\n') + (body ? '\n\n' + body : '') };
            });
            if (logs.length) sections.push({ title: 'Logs', pre: logs.join('\n') });
            return {
              ok: results.every(function (result) { return result.res.statusCode < 500; }),
              status: results.map(function (result) { return result.res.statusCode; }).join(', '),
              note: 'app.inject() of each request, in order, after app.ready() (the date and connection headers left out)',
              sections: sections,
            };
          })
          .finally(function () {
            restoreConsole();
            if (app && typeof app.close === 'function') app.close().catch(function () {});
          });
      },
    },
    {
      id: 'schema',
      label: 'Schemas',
      page: 'schema/index.html',
      name: '@xufa/schema',
      intro:
        'Schemas written with s (plain JSON Schema, with their types) or in JSON Schema (draft-04 to 2020-12), compiled into functions that check values: the validator of the routes of xufa.',
      more: { href: 'schema/playground.html', text: 'Its own playground: every mode, the builder of types, and the code it generates' },
      panels: [
        { id: 'schema', label: 'Schema', note: 's (JavaScript) or JSON Schema', big: true },
        { id: 'value', label: 'Value to check', note: 'JSON' },
      ],
      examples: [
        {
          label: 'With s: an object, optional and nullable',
          hint: 'See the JSON Schema s writes; then make pages optional with s.optional(), or editor nullable with s.nullable().',
          values: {
            schema: "// s is the builder of @xufa/schema. Define `schema`.\nconst schema = s.object(\n  {\n    id: s.integer({ minimum: 1 }),\n    title: s.string({ minLength: 1, maxLength: 200 }),\n    pages: s.integer({ minimum: 1 }),\n    status: s.enum(['draft', 'published']),\n    editor: s.nullable(s.email()),\n  },\n  { additionalProperties: false }\n);",
            value: '{ "id": 1, "title": "Dune", "status": "sold", "editor": "ada@", "extra": true }',
          },
        },
        {
          label: 'With s: objects from objects (omit, partial)',
          hint: 'The body of a create (without id) and of an update (every key optional), from one schema: try newBook.',
          values: {
            schema: "const book = s.object({\n  id: s.integer(),\n  title: s.string(),\n  tags: s.array(s.string(), { uniqueItems: true }),\n});\nconst newBook = s.omit(book, ['id']); // a create\nconst schema = s.partial(newBook); // an update",
            value: '{ "tags": ["sf", "sf"] }',
          },
        },
        {
          label: 'JSON Schema: an object with rules',
          hint: 'Fix the value (an integer age of 18 or more, a valid email) until it is valid.',
          values: {
            schema: '{\n  "type": "object",\n  "required": ["name", "age"],\n  "properties": {\n    "name": { "type": "string", "minLength": 1 },\n    "age": { "type": "integer", "minimum": 18 },\n    "email": { "type": "string", "format": "email" },\n    "tags": { "type": "array", "items": { "type": "string" }, "uniqueItems": true }\n  },\n  "additionalProperties": false\n}',
            value: '{\n  "name": "Ada",\n  "age": 17.5,\n  "email": "ada@",\n  "tags": ["math", "math"],\n  "extra": true\n}',
          },
        },
        {
          label: 'JSON Schema 2020-12: prefixItems, unevaluated',
          hint: 'Add a third item, or a key that no keyword evaluates: they are refused.',
          values: {
            schema: '{\n  "$schema": "https://json-schema.org/draft/2020-12/schema",\n  "type": "object",\n  "properties": {\n    "point": { "prefixItems": [{ "type": "number" }, { "type": "number" }], "items": false }\n  },\n  "allOf": [{ "properties": { "label": { "type": "string" } } }],\n  "unevaluatedProperties": false\n}',
            value: '{ "point": [1, 2], "label": "home" }',
          },
        },
        {
          label: 'JSON Schema: a discriminator (OpenAPI)',
          hint: 'Change petType to "dog": the object is then checked against Dog only.',
          values: {
            schema: '{\n  "$defs": {\n    "Cat": { "type": "object", "properties": { "lives": { "type": "integer" } }, "required": ["petType", "lives"] },\n    "Dog": { "type": "object", "properties": { "bark": { "type": "boolean" } }, "required": ["petType"] }\n  },\n  "oneOf": [{ "$ref": "#/$defs/Cat" }, { "$ref": "#/$defs/Dog" }],\n  "discriminator": { "propertyName": "petType", "mapping": { "cat": "#/$defs/Cat", "dog": "#/$defs/Dog" } }\n}',
            value: '{ "petType": "cat" }',
          },
        },
      ],
      run: function (v, x) {
        // JSON Schema when it starts as an object; otherwise code with s.
        var built = !/^\s*\{/.test(v.schema);
        var schema = built ? code(v.schema, 'schema', { s: x.schema.s }, 'schema') : json(v.schema, 'schema');
        var value = json(v.value, 'value');
        var errors;
        try {
          errors = x.schema.compileJsonSchema(schema, { formats: true })(value);
        } catch (err) {
          throw new Problem('schema', (built ? 'The schema does not compile: ' : '') + err.message);
        }
        return {
          ok: errors.length === 0,
          status: errors.length === 0 ? 'Valid' : errors.length === 1 ? '1 error' : errors.length + ' errors',
          list: errors,
          note: 'compileJsonSchema(schema, { formats: true })(value) returned ' + (errors.length ? 'these messages' : '[]'),
          sections: built ? [{ title: 'The JSON Schema s made', pre: show(schema) }] : [],
        };
      },
    },
    {
      id: 'expression',
      label: 'Expressions',
      page: 'expression/index.html',
      name: '@xufa/expression',
      intro: 'A safe part of JavaScript, compiled once: for rules of models, configuration templates and conditions written by users.',
      panels: [
        { id: 'expression', label: 'Expression', note: 'JavaScript expression', big: true },
        { id: 'context', label: 'Its names', note: 'JSON' },
      ],
      examples: [
        {
          label: 'Arithmetic and conditions',
          hint: 'Change the quantity: the result changes as you type.',
          values: {
            expression: "price * quantity > 100 ? 'free shipping' : 'shipping: ' + (5).toFixed(2)",
            context: '{ "price": 30, "quantity": 3 }',
          },
        },
        {
          label: 'Arrays, closures, optional chaining',
          hint: 'Arrow functions, map and filter, ?. and ?? work; assignments do not.',
          values: {
            expression: "orders\n  .filter(o => o.status === 'paid')\n  .map(o => o.customer?.name ?? 'anonymous')\n  .join(', ')",
            context: '{\n  "orders": [\n    { "status": "paid", "customer": { "name": "Ada" } },\n    { "status": "draft", "customer": { "name": "Grace" } },\n    { "status": "paid" }\n  ]\n}',
          },
        },
        {
          label: 'What it refuses',
          hint: 'Expressions cannot reach the process, constructors or prototypes, nor assign: try `total = 1`.',
          values: {
            expression: 'constructor.constructor("return process")()',
            context: '{}',
          },
        },
      ],
      run: function (v, x) {
        var context = json(v.context, 'context');
        var value;
        try {
          value = x.expression.evaluate(v.expression, context);
        } catch (err) {
          throw new Problem('expression', err.message);
        }
        return { ok: true, status: 'Its value', pre: show(value) };
      },
    },
    {
      id: 'template',
      label: 'Templates',
      page: 'template/index.html',
      name: '@xufa/template',
      intro: 'Templates of text and HTML over safe expressions: values escaped for HTML, blocks, filters and partials.',
      panels: [
        { id: 'template', label: 'Template', note: 'Text or HTML', big: true },
        { id: 'data', label: 'Data', note: 'JSON' },
      ],
      examples: [
        {
          label: 'A list, conditions and filters',
          hint: 'Empty the list of items: the {{else}} of #each is written instead.',
          values: {
            template: '<h1>Hello, {{ user.name | capitalize }}</h1>\n{{#if user.admin}}<p>You are an admin.</p>{{/if}}\n<ul>\n{{#each items as item}}\n  <li>{{ loop.number }}. {{ item.title }}: {{ item.price | fixed(2) }} €</li>\n{{else}}\n  <li>No items</li>\n{{/each}}\n</ul>',
            data: '{\n  "user": { "name": "ada", "admin": true },\n  "items": [\n    { "title": "Notebook", "price": 3.5 },\n    { "title": "Pen", "price": 1 }\n  ]\n}',
          },
        },
        {
          label: 'Escaping HTML',
          hint: 'Values are escaped; | safe writes trusted HTML as it is.',
          values: {
            template: '<p>Escaped: {{ comment }}</p>\n<p>Trusted: {{ banner | safe }}</p>',
            data: '{\n  "comment": "<script>alert(1)</script>",\n  "banner": "<strong>Sale</strong>"\n}',
          },
        },
      ],
      run: function (v, x) {
        var data = json(v.data, 'data');
        var text;
        try {
          text = x.template.render(v.template, data);
        } catch (err) {
          throw new Problem('template', err.message);
        }
        return { ok: true, status: 'Rendered', pre: text };
      },
    },
    {
      id: 'yaml',
      label: 'YAML',
      page: 'yaml/index.html',
      name: '@xufa/yaml',
      intro: 'YAML 1.2, with the API and the tests of js-yaml: load and dump.',
      panels: [{ id: 'yaml', label: 'YAML', note: 'YAML 1.2', big: true }],
      examples: [
        {
          label: 'A configuration',
          hint: 'Anchors (&) and aliases (*) reuse a value; a tab for indentation is an error, with its line.',
          values: {
            yaml: "server:\n  port: 8080\n  hosts: [a.example.com, b.example.com]\ndefaults: &defaults\n  retries: 3\n  timeout: 30s\npayments:\n  <<: *defaults\n  url: https://pay.example.com\nenabled: true\nratio: 0.75\nempty: ~",
          },
        },
      ],
      run: function (v, x) {
        var value;
        try {
          value = x.yaml.load(v.yaml);
        } catch (err) {
          throw new Problem('yaml', err.message);
        }
        var back = x.yaml.dump(value);
        return {
          ok: true,
          status: 'Loaded',
          pre: show(value),
          sections: [{ title: 'dump() of it, back to YAML', pre: back }],
        };
      },
    },
    {
      id: 'marshal',
      label: 'Marshal',
      page: 'marshal/index.html',
      name: '@xufa/marshal',
      intro: 'Values as JSON that keeps what JSON.stringify loses: dates, Map, Set, BigInt, errors, shared references and cycles.',
      panels: [{ id: 'code', label: 'A value', note: 'JavaScript', big: true }],
      examples: [
        {
          label: 'What JSON loses',
          hint: 'Compare the two outputs: JSON.stringify loses the Map, the Set, the date and the BigInt.',
          values: {
            code: "// Define `value`.\nconst value = {\n  at: new Date('2026-10-06T10:00:00Z'),\n  scores: new Map([['ada', 10], ['grace', 9]]),\n  tags: new Set(['a', 'b']),\n  big: 9007199254740993n,\n  nothing: undefined,\n};",
          },
        },
        {
          label: 'Cycles and shared references',
          hint: 'The same object twice stays one object after parse(), and a cycle does not throw.',
          values: {
            code: "const ada = { name: 'Ada' };\nada.self = ada;\nconst value = { first: ada, again: ada, error: new TypeError('boom') };",
          },
        },
      ],
      run: function (v, x) {
        var value = code(v.code, 'code', {}, 'value');
        var text = x.marshal.stringify(value);
        var back = x.marshal.parse(text);
        var plain;
        try {
          plain = JSON.stringify(value);
        } catch (err) {
          plain = 'throws: ' + err.message;
        }
        var kinds = function (input) {
          if (input === null || typeof input !== 'object') return typeof input;
          return Object.prototype.toString.call(input).slice(8, -1);
        };
        var after = Object.keys(back)
          .map(function (key) {
            var same = Object.keys(back).filter(function (other) { return other !== key && back[other] === back[key] && typeof back[key] === 'object'; });
            return key + ': ' + kinds(back[key]) + (same.length ? ' (the same object as ' + same.join(', ') + ')' : '');
          })
          .join('\n');
        return {
          ok: true,
          status: 'stringify(value)',
          pre: text,
          sections: [
            { title: 'parse() of it: what each key is again', pre: after },
            { title: 'JSON.stringify(value), for comparison', pre: plain === undefined ? 'undefined' : plain },
          ],
        };
      },
    },
    {
      id: 'router',
      label: 'Router',
      page: 'router/index.html',
      name: '@xufa/router',
      intro: 'The router of @xufa/http, with the API of find-my-way: parameters, wildcards, regular expressions, compiled to code.',
      panels: [
        { id: 'routes', label: 'Routes', note: 'METHOD /path, one a line', big: true },
        { id: 'requests', label: 'Requests', note: 'METHOD /url, one a line' },
      ],
      examples: [
        {
          label: 'Parameters, wildcards, regular expressions',
          hint: 'Add a request: /users/abc is no user (its id must be digits), and a static route wins over a parameter.',
          values: {
            routes: 'GET /\nGET /users/me\nGET /users/:id(^\\d+$)\nGET /users/:id/posts/:post\nGET /files/*\nPOST /users\nGET /archive/:year-:month',
            requests: 'GET /users/42\nGET /users/me\nGET /users/abc\nGET /users/7/posts/hello?draft=1\nGET /files/docs/readme.md\nPOST /users\nDELETE /users/42\nGET /archive/2026-10',
          },
        },
      ],
      run: function (v, x) {
        var router = x.router();
        var lines = function (text) {
          return text.split('\n').map(function (line) { return line.trim(); }).filter(Boolean);
        };
        lines(v.routes).forEach(function (line, i) {
          var parts = line.split(/\s+/);
          if (parts.length !== 2) throw new Problem('routes', 'Line ' + (i + 1) + ': METHOD /path');
          try {
            router.on(parts[0].toUpperCase(), parts[1], function () {}, { route: line });
          } catch (err) {
            throw new Problem('routes', 'Line ' + (i + 1) + ': ' + err.message);
          }
        });
        var found = 0;
        var list = lines(v.requests).map(function (line, i) {
          var parts = line.split(/\s+/);
          if (parts.length !== 2) throw new Problem('requests', 'Line ' + (i + 1) + ': METHOD /url');
          var match = router.find(parts[0].toUpperCase(), parts[1].split('?')[0]);
          if (!match) return line + '  →  no route (404)';
          found += 1;
          var query = parts[1].indexOf('?') >= 0 ? '  query ' + show(Object.fromEntries(new URLSearchParams(parts[1].split('?')[1]))).replace(/\s+/g, ' ') : '';
          return line + '  →  ' + match.store.route + '  params ' + show(match.params).replace(/\s+/g, ' ') + query;
        });
        return {
          ok: true,
          status: found + ' of ' + list.length + ' found',
          pre: list.join('\n'),
          sections: [{ title: 'The tree of the routes (prettyPrint())', pre: router.prettyPrint() }],
        };
      },
    },
    {
      id: 'serializer',
      label: 'Serializer',
      page: 'serializer/index.html',
      name: '@xufa/serializer',
      intro: 'JSON written by a function compiled from a JSON Schema, with the API of fast-json-stringify: the replies of the routes of @xufa/http.',
      panels: [
        { id: 'schema', label: 'Schema', note: 'JSON Schema', big: true },
        { id: 'value', label: 'Value', note: 'JSON' },
      ],
      examples: [
        {
          label: 'Only what the schema has',
          hint: 'The password is not in the schema: it is not written. Add it to the properties and it is.',
          values: {
            schema: '{\n  "type": "object",\n  "properties": {\n    "id": { "type": "integer" },\n    "name": { "type": "string" },\n    "tags": { "type": "array", "items": { "type": "string" } },\n    "createdAt": { "type": "string", "format": "date-time" }\n  }\n}',
            value: '{\n  "id": 7,\n  "name": "Ada",\n  "password": "$scrypt$...",\n  "tags": ["admin", "author"],\n  "createdAt": "2026-10-07T12:00:00.000Z"\n}',
          },
        },
        {
          label: 'Types converted',
          hint: 'Values are written as the type of the schema says: "42" as an integer, 1 as a boolean, null where it is allowed.',
          values: {
            schema: '{\n  "type": "object",\n  "properties": {\n    "count": { "type": "integer" },\n    "active": { "type": "boolean" },\n    "price": { "type": "number" },\n    "note": { "type": ["string", "null"] }\n  }\n}',
            value: '{ "count": "42", "active": 1, "price": "9.5", "note": null }',
          },
        },
      ],
      run: function (v, x) {
        var schema = json(v.schema, 'schema');
        var value = json(v.value, 'value');
        var serialize;
        try {
          serialize = x.serializer(schema);
        } catch (err) {
          throw new Problem('schema', err.message);
        }
        var text;
        try {
          text = serialize(value);
        } catch (err) {
          throw new Problem('value', err.message);
        }
        var plain = JSON.stringify(value);
        return {
          ok: true,
          status: 'Written: ' + text.length + ' characters',
          pre: text,
          sections: [{ title: 'JSON.stringify() of the value, for comparison (' + plain.length + ' characters)', pre: plain }],
        };
      },
    },
  ];

  var tool = TOOLS[0];
  var timer = null;

  function encode(data) {
    var bytes = new TextEncoder().encode(JSON.stringify(data));
    var text = '';
    bytes.forEach(function (byte) { text += String.fromCharCode(byte); });
    return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decode(text) {
    var binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  // The panels of the tool: the first on the left, the others on the right, above the result.
  function build(values) {
    var main = $('panels-main');
    var side = $('panels-side');
    main.textContent = '';
    side.querySelectorAll('.pg-input').forEach(function (node) { node.remove(); });
    tool.panels.forEach(function (panel, i) {
      var section = el('section', 'pg-panel pg-input' + (i === 0 ? ' pg-schema' : ''));
      var head = el('div', 'pg-panel-head');
      var title = el('h2');
      title.appendChild(el('span', 'pg-step', String(i + 1)));
      title.appendChild(document.createTextNode(' ' + panel.label));
      head.appendChild(title);
      head.appendChild(el('span', 'pg-note', panel.note));
      section.appendChild(head);
      var area = el('textarea', i === 0 ? '' : 'pg-value');
      area.id = 'panel-' + panel.id;
      area.spellcheck = false;
      area.setAttribute('autocapitalize', 'off');
      area.setAttribute('autocomplete', 'off');
      area.setAttribute('wrap', 'off');
      area.setAttribute('aria-label', panel.label);
      area.value = values[panel.id] || '';
      area.addEventListener('input', schedule);
      section.appendChild(area);
      if (i === 0) main.appendChild(section);
      else side.insertBefore(section, $('output'));
    });
    $('result-step').textContent = String(tool.panels.length + 1);
  }

  function values() {
    var out = {};
    tool.panels.forEach(function (panel) { out[panel.id] = $('panel-' + panel.id).value; });
    return out;
  }

  // The result of the tool for what is written (a tool may give a promise: the latest one written is shown).
  var runs = 0;
  function render() {
    var run = (runs += 1);
    var box = $('result');
    tool.panels.forEach(function (panel) { $('panel-' + panel.id).classList.remove('pg-invalid'); });
    if (tool.needs && !window[tool.needs.global]) {
      box.className = 'pg-result';
      box.textContent = 'Loading ' + tool.name + '…';
      loadScript(tool.needs.src).then(
        function () { if (run === runs) render(); },
        function (err) { if (run === runs) showProblem(err); }
      );
      return;
    }
    var output;
    try {
      output = tool.run(values(), window.xufa);
    } catch (err) {
      showProblem(err);
      return;
    }
    if (output && typeof output.then === 'function') {
      output.then(
        function (result) { if (run === runs) showOutput(result); },
        function (err) { if (run === runs) showProblem(err); }
      );
    } else {
      showOutput(output);
    }
  }

  function showProblem(err) {
    var box = $('result');
    box.textContent = '';
    var problem = err instanceof Problem ? err : new Problem(null, err && err.message ? err.message : String(err));
    if (problem.panel) $('panel-' + problem.panel).classList.add('pg-invalid');
    box.className = 'pg-result is-problem';
    var where = tool.panels.filter(function (panel) { return panel.id === problem.panel; })[0];
    box.appendChild(el('p', 'pg-status', where ? 'A problem in ' + where.label.toLowerCase() : 'A problem'));
    box.appendChild(el('pre', 'pg-message', problem.message));
  }

  function showOutput(output) {
    var box = $('result');
    box.textContent = '';
    box.className = 'pg-result ' + (output.ok ? 'is-valid' : 'is-invalid');
    box.appendChild(el('p', 'pg-status', output.status));
    if (output.list && output.list.length) {
      var list = el('ul', 'pg-errors');
      output.list.forEach(function (item) { list.appendChild(el('li', '', item)); });
      box.appendChild(list);
    }
    if (output.pre !== undefined) box.appendChild(el('pre', '', output.pre));
    if (output.note) box.appendChild(el('p', 'pg-returns', output.note));
    (output.sections || []).forEach(function (section) {
      box.appendChild(el('p', 'pg-after-title', section.title));
      box.appendChild(el('pre', 'pg-after', section.pre));
    });
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(render, 150);
  }

  function pickExample(index) {
    var example = tool.examples[index];
    $('example').value = String(index);
    $('hint').textContent = example.hint;
    build(example.values);
    render();
  }

  function pickTool(id, values) {
    tool = TOOLS.filter(function (t) { return t.id === id; })[0] || TOOLS[0];
    document.querySelectorAll('#tools button').forEach(function (button) {
      button.setAttribute('aria-selected', String(button.dataset.tool === tool.id));
    });
    $('tool-name').textContent = tool.name;
    $('tool-name').href = tool.page;
    $('tool-intro').textContent = tool.intro;
    $('tool-more').hidden = !tool.more;
    if (tool.more) {
      $('tool-more').href = tool.more.href;
      $('tool-more').textContent = tool.more.text + ' →';
    }
    var select = $('example');
    select.textContent = '';
    tool.examples.forEach(function (example, i) {
      var option = el('option', '', example.label);
      option.value = String(i);
      select.appendChild(option);
    });
    if (values) {
      $('hint').textContent = 'Shared with a link: edit it as you like.';
      build(values);
      render();
    } else {
      pickExample(0);
    }
  }

  function init() {
    if (!window.xufa) {
      $('result').textContent = 'The packages did not load (xufa.js).';
      return;
    }
    var tabs = $('tools');
    TOOLS.forEach(function (t) {
      var button = el('button', '', t.label);
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.dataset.tool = t.id;
      button.id = t.id; // playground.html#<tool> is a link to it (the pages of the packages have them)
      button.addEventListener('click', function () {
        history.replaceState(null, '', location.pathname + '#' + t.id);
        pickTool(t.id);
      });
      tabs.appendChild(button);
    });
    $('example').addEventListener('change', function () { pickExample(Number($('example').value)); });
    $('reset').addEventListener('click', function () { pickExample(Number($('example').value) || 0); });
    $('share').addEventListener('click', function () {
      var url = location.href.split('#')[0] + '#' + tool.id + ':' + encode(values());
      history.replaceState(null, '', url);
      var done = function () { $('share').textContent = 'Link copied'; setTimeout(function () { $('share').textContent = 'Copy link'; }, 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, done);
      else done();
    });
    var hash = location.hash.slice(1);
    var id = hash.split(':')[0];
    var shared = null;
    if (hash.indexOf(':') > 0) {
      try {
        shared = decode(hash.slice(hash.indexOf(':') + 1));
      } catch (err) {
        shared = null;
      }
    }
    pickTool(id, shared);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
