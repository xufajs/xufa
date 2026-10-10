// The plugin of templates for @xufa/http (and fastify), as @fastify/view: views are files of a folder, rendered with
// the data given and sent as HTML.
//
//   app.register(template.plugin, { root: 'views', layout: 'layout', defaultContext: { site: 'xufa' } });
//   app.get('/users/:id', async (request, reply) => reply.view('users/show', { user }));
//
// reply.view(name, data, options) renders <root>/<name><extension> and sends it (text/html, unless the reply has a
// content type); reply.viewAsync() and app.view() give the text. The context of a view is defaultContext, then
// reply.locals (set in hooks), then the data given. With a layout (of the plugin, or options.layout of a call; false
// for none), the view is rendered first and given to the layout as body. Partials are files too:
// {{> partials/header}} is <root>/partials/header<extension>.
//
// With `stream` (of the plugin, or of a call), the view is sent in chunks (chunkSize characters, 64 KB) made as the
// client reads them: the first bytes go at once, and a large page is never whole in memory. Its files are read and
// compiled first (a view that is not there is a 500); an error while it renders cuts the response.
//
// The context of each view of a request (Django's context processors): `context`, functions of (request, reply)
// that give values (or promises of them), run for every reply.view(); other plugins add theirs with
// app.viewContext(fn) (@xufa/auth's accounts adds user and perms). With `builtins` (true), every view of a request
// has: request ({ path, url, query, method }), url(name, ...params) (app.reverse of the named routes), staticUrl(path)
// (with xufa.staticFiles), csrfToken (of @xufa/session with csrf) and messages (request.session.message()). The order:
// defaultContext, the builtins, the context functions, reply.locals, then the data of the call.
//
// Names are inside root: a name that leads out of it (.., an absolute path) is refused, so a view named by a request
// cannot read other files. Files are read once with `cache` (by default when NODE_ENV is production); without it,
// every render reads them again (edits are seen at once), and the templates are compiled again only when they changed.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import diagnostics from 'node:diagnostics_channel';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { TemplateError } from './errors.js';
import { SafeString } from './filters.js';
import * as indexModule from '../index.js';

// The views rendered for replies: { request, reply, name, context } (xufa:template:render).
const RENDERS = diagnostics.channel('xufa:template:render');
// The most names whose files (and sources, with cache) are kept.
const MAX_NAMES = 1000;

function templatePlugin(app, options, done) {
  // The engine is required here: index.js requires this file.
  const { TemplateEngine } = indexModule;
  const {
    root = 'views',
    extension = '.html',
    layout = null,
    defaultContext = {},
    cache = process.env.NODE_ENV === 'production',
    propertyName = 'view',
    stream = false,
    context = [],
    builtins = true,
    chunkSize = 65536,
    engine: given,
    ...engineOptions
  } = options;
  // root: a folder, or several (the app's, then those of its apps, as Django's DIRS and APP_DIRS): a name is the
  // file of the first that has it.
  const bases = [].concat(root).map((folder) => path.resolve(folder));
  const files = new Map();
  // With cache: the source of each name (the file of the first root that has it), so a view rendered again looks for
  // nothing.
  const sources = new Map();

  // The files a name may be, one in each root (none: the name leads out of them).
  const findFiles = (name) => {
    if (typeof name !== 'string' || name === '' || name.includes('\0') || path.isAbsolute(name)) return [];
    const candidates = [];
    for (const base of bases) {
      const file = path.resolve(base, path.extname(name) ? name : `${name}${extension}`);
      const relative = path.relative(base, file);
      if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return [];
      candidates.push(file);
    }
    return candidates;
  };
  // Kept by name (the roots do not change): every render asked for them again, resolving paths each time. At most
  // MAX_NAMES names, so names made of requests do not grow it.
  const candidatesByName = new Map();
  const filesOf = (name) => {
    if (typeof name !== 'string') return findFiles(name);
    let candidates = candidatesByName.get(name);
    if (candidates === undefined) {
      candidates = findFiles(name);
      if (candidatesByName.size >= MAX_NAMES) candidatesByName.clear();
      candidatesByName.set(name, candidates);
    }
    return candidates;
  };
  // The source of a name kept (with cache), and given back.
  const remember = (name, source) => {
    if (cache && typeof name === 'string') {
      if (sources.size >= MAX_NAMES) sources.clear();
      sources.set(name, source);
    }
    return source;
  };
  const notFound = (name, cause) => {
    const where = bases.length === 1 ? root : bases.join(', ');
    const err = new TemplateError(`No view ${name} in ${where}`, { code: 'XUFA_TEMPLATE_ERR_NOT_FOUND', cause });
    err.statusCode = 500;
    return err;
  };

  async function read(name) {
    if (cache) {
      const known = sources.get(name);
      if (known !== undefined) return known;
    }
    const candidates = filesOf(name);
    if (!candidates.length) throw notFound(name);
    let last;
    for (const file of candidates) {
      if (cache && files.has(file)) return remember(name, files.get(file));
      try {
        const source = await fsp.readFile(file, 'utf8');
        if (cache) files.set(file, source);
        return remember(name, source);
      } catch (err) {
        last = err;
      }
    }
    throw notFound(name, last);
  }

  // Partials while a template renders: read at once (the renders are synchronous), kept with `cache`.
  function readPartial(name) {
    if (cache) {
      const known = sources.get(name);
      if (known !== undefined) return known;
    }
    for (const file of filesOf(name)) {
      if (cache && files.has(file)) return remember(name, files.get(file));
      try {
        const source = fs.readFileSync(file, 'utf8');
        if (cache) files.set(file, source);
        return remember(name, source);
      } catch {
        // The next root.
      }
    }
    return undefined;
  }

  // The functions of the context of each view of a request.
  const processors = [].concat(context);
  for (const fn of processors) {
    if (typeof fn !== 'function') {
      done(new TemplateError('context of the templates is a function of (request, reply), or a list of them'));
      return;
    }
  }
  // The values every view of a request has (builtins).
  function builtinsOf(request) {
    const server = request.server;
    const session = request.session;
    const values = {
      request: { path: request.url.split('?')[0], url: request.url, query: request.query, method: request.method },
    };
    if (typeof server.reverse === 'function') values.url = (name, ...params) => server.reverse(name, params);
    if (typeof server.staticUrl === 'function') values.staticUrl = (file) => server.staticUrl(file);
    if (session && typeof session.csrfToken === 'function') {
      // Made when a template writes it (a session made for nothing is not saved).
      Object.defineProperty(values, 'csrfToken', { enumerable: true, get: () => session.csrfToken() });
    }
    if (session && typeof session.messages === 'function') {
      let read = null;
      Object.defineProperty(values, 'messages', {
        enumerable: true,
        get: () => {
          if (read === null) read = session.messages();
          return read;
        },
      });
    }
    return values;
  }
  // The context of a view of a reply: the builtins, then each function's values.
  async function contextOf(reply) {
    const request = reply.request;
    if (!request) return reply.locals;
    const values = builtins ? builtinsOf(request) : {};
    for (const fn of processors) Object.assign(values, await fn(request, reply));
    return Object.assign(values, reply.locals);
  }

  const engine = given || new TemplateEngine({ ...engineOptions, loadPartial: readPartial });
  if (given && !given.loadPartial) given.loadPartial = readPartial;

  // A view ready to render: its template, its layout's (or null) and its context; the files are read and compiled
  // here, so a view that is not there fails before anything is sent.
  async function prepare(name, data, callOptions = {}, locals, reply = null) {
    const context = { ...defaultContext, ...locals, ...data };
    // Each view of a reply, for those who listen (a test client: the templates and context of a response).
    if (reply && RENDERS.hasSubscribers) RENDERS.publish({ request: reply.request, reply, name, context });
    const page = engine.compile(await read(name), { name });
    const outer = callOptions.layout === undefined ? layout : callOptions.layout;
    const frame = outer ? engine.compile(await read(outer), { name: outer }) : null;
    return { page, frame, context };
  }

  // The text of a view: rendered with its context, then given to its layout as body.
  async function render(name, data, callOptions, locals, reply) {
    const { page, frame, context } = await prepare(name, data, callOptions, locals, reply);
    if (!frame) return page(context);
    return frame({ ...context, body: new SafeString(page(context)) });
  }

  // The text of a view in chunks, made as they are read: the layout is rendered with a marker as its body and cut
  // there (its head, the chunks of the view, its tail); a layout that does not write its body once, as it is, is
  // rendered whole.
  function* chunks({ page, frame, context }) {
    if (!frame) {
      yield* page.stream(context, { chunkSize });
      return;
    }
    const marker = `\u0000xufa-body-${randomUUID()}\u0000`;
    const outer = frame({ ...context, body: new SafeString(marker) });
    const at = outer.indexOf(marker);
    if (at === -1 || outer.indexOf(marker, at + 1) !== -1) {
      yield frame({ ...context, body: new SafeString(page(context)) });
      return;
    }
    yield outer.slice(0, at);
    yield* page.stream(context, { chunkSize });
    yield outer.slice(at + marker.length);
  }

  app.decorate(propertyName, (name, data, callOptions) => render(name, data, callOptions));
  // A function of the context of the views of requests, from another plugin.
  app.decorate('viewContext', (fn) => {
    if (typeof fn !== 'function') throw new TemplateError('viewContext(fn): fn is a function of (request, reply)');
    processors.push(fn);
  });
  // Whether a view is in one of the roots (a generic view falls back to its own template when the app has none).
  // With cache, the answer is kept by name (a generic view asks at every request, and the files do not change): a
  // missing file was looked for on the disk each time.
  const hasByName = new Map();
  app.decorate(`has${propertyName.charAt(0).toUpperCase()}${propertyName.slice(1)}`, (name) => {
    if (cache && typeof name === 'string') {
      const known = hasByName.get(name);
      if (known !== undefined) return known;
    }
    const found = filesOf(name).some((file) => (cache && files.has(file)) || fs.existsSync(file));
    if (cache && typeof name === 'string') {
      if (hasByName.size >= MAX_NAMES) hasByName.clear();
      hasByName.set(name, found);
    }
    return found;
  });
  if (!app.hasReplyDecorator('locals')) app.decorateReply('locals', null);
  app.decorateReply(`${propertyName}Async`, async function viewAsync(name, data, callOptions) {
    return render(name, data, callOptions, await contextOf(this), this);
  });
  app.decorateReply(propertyName, function view(name, data, callOptions = {}) {
    const streamed = callOptions.stream === undefined ? stream : callOptions.stream;
    const sent = contextOf(this).then((locals) =>
      streamed
        ? prepare(name, data, callOptions, locals, this).then((view) =>
            Readable.from(chunks(view), { objectMode: false })
          )
        : render(name, data, callOptions, locals, this)
    );
    sent.then(
      (body) => {
        if (!this.hasHeader('content-type')) this.type('text/html; charset=utf-8');
        this.send(body);
      },
      (err) => this.send(err)
    );
    return this;
  });
  done();
}

templatePlugin[Symbol.for('skip-override')] = true;
templatePlugin[Symbol.for('fastify.display-name')] = '@xufa/template';

export { templatePlugin };
