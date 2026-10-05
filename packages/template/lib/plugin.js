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
// Names are inside root: a name that leads out of it (.., an absolute path) is refused, so a view named by a request
// cannot read other files. Files are read once with `cache` (by default when NODE_ENV is production); without it,
// every render reads them again (edits are seen at once), and the templates are compiled again only when they changed.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Readable } = require('node:stream');
const { TemplateError } = require('./errors');
const { SafeString } = require('./filters');

function templatePlugin(app, options, done) {
  // The engine is required here: index.js requires this file.
  const { TemplateEngine } = require('..'); // eslint-disable-line global-require
  const {
    root = 'views',
    extension = '.html',
    layout = null,
    defaultContext = {},
    cache = process.env.NODE_ENV === 'production',
    propertyName = 'view',
    stream = false,
    chunkSize = 65536,
    engine: given,
    ...engineOptions
  } = options;
  const base = path.resolve(root);
  const files = new Map();

  // The file of a name, inside root (null: the name leads out of it).
  const fileOf = (name) => {
    if (typeof name !== 'string' || name === '' || name.includes('\0') || path.isAbsolute(name)) return null;
    const file = path.resolve(base, path.extname(name) ? name : `${name}${extension}`);
    const relative = path.relative(base, file);
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return null;
    return file;
  };
  const notFound = (name, cause) => {
    const err = new TemplateError(`No view ${name} in ${root}`, { code: 'XUFA_TEMPLATE_ERR_NOT_FOUND', cause });
    err.statusCode = 500;
    return err;
  };

  async function read(name) {
    const file = fileOf(name);
    if (!file) throw notFound(name);
    if (cache && files.has(file)) return files.get(file);
    let source;
    try {
      source = await fsp.readFile(file, 'utf8');
    } catch (err) {
      throw notFound(name, err);
    }
    if (cache) files.set(file, source);
    return source;
  }

  // Partials while a template renders: read at once (the renders are synchronous), kept with `cache`.
  function readPartial(name) {
    const file = fileOf(name);
    if (!file) return undefined;
    if (cache && files.has(file)) return files.get(file);
    let source;
    try {
      source = fs.readFileSync(file, 'utf8');
    } catch {
      return undefined;
    }
    if (cache) files.set(file, source);
    return source;
  }

  const engine = given || new TemplateEngine({ ...engineOptions, loadPartial: readPartial });
  if (given && !given.loadPartial) given.loadPartial = readPartial;

  // A view ready to render: its template, its layout's (or null) and its context; the files are read and compiled
  // here, so a view that is not there fails before anything is sent.
  async function prepare(name, data, callOptions = {}, locals) {
    const context = { ...defaultContext, ...locals, ...data };
    const page = engine.compile(await read(name), { name });
    const outer = callOptions.layout === undefined ? layout : callOptions.layout;
    const frame = outer ? engine.compile(await read(outer), { name: outer }) : null;
    return { page, frame, context };
  }

  // The text of a view: rendered with its context, then given to its layout as body.
  async function render(name, data, callOptions, locals) {
    const { page, frame, context } = await prepare(name, data, callOptions, locals);
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
  if (!app.hasReplyDecorator('locals')) app.decorateReply('locals', null);
  app.decorateReply(`${propertyName}Async`, function viewAsync(name, data, callOptions) {
    return render(name, data, callOptions, this.locals);
  });
  app.decorateReply(propertyName, function view(name, data, callOptions = {}) {
    const streamed = callOptions.stream === undefined ? stream : callOptions.stream;
    const sent = streamed
      ? prepare(name, data, callOptions, this.locals).then((view) => Readable.from(chunks(view), { objectMode: false }))
      : render(name, data, callOptions, this.locals);
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

module.exports = { templatePlugin };
