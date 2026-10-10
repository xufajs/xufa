import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import xufa from '@xufa/http';
import { plugin, TemplateEngine } from '../index.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-views-'));
const write = (name, text) => {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

write('hello.html', '<p>Hello {{ name }} from {{ site }}{{#if admin}} (admin){{/if}}</p>');
write('layout.html', '<html><title>{{ title ?? site }}</title><body>{{ body }}</body></html>');
write('other-layout.html', '[{{ body }}]');
write('users/show.html', '{{> partials/card}}<ul>{{#each user.tags as tag}}<li>{{ tag }}</li>{{/each}}</ul>');
write('partials/card.html', '<div class="card">{{ user.name }}</div>');
write('broken.html', '{{#if open}}never closed');
write('escape.html', '{{> ../outside}}');
fs.writeFileSync(path.join(path.dirname(root), 'outside.html'), 'SECRET');

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function makeApp(options = {}) {
  const app = xufa();
  app.register(plugin, { root, defaultContext: { site: 'xufa' }, ...options });
  return app;
}

describe('reply.view', () => {
  it('renders a view with the data and the default context, and sends it as HTML', async () => {
    const app = makeApp();
    app.get('/', (request, reply) => reply.view('hello', { name: '<Ada>' }));
    const response = await app.inject('/');
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(response.body).toBe('<p>Hello &lt;Ada&gt; from xufa</p>');
  });

  it('takes reply.locals of hooks between the default context and the data', async () => {
    const app = makeApp();
    app.addHook('onRequest', async (request, reply) => {
      reply.locals = { admin: true, name: 'from a hook' };
    });
    app.get('/', (request, reply) => reply.view('hello', { site: 'given' }));
    expect((await app.inject('/')).body).toBe('<p>Hello from a hook from given (admin)</p>');
  });

  it('puts the view in its layout as body (of the plugin, of the call, or none)', async () => {
    const app = makeApp({ layout: 'layout' });
    app.get('/', (request, reply) => reply.view('hello', { name: 'Ada', title: 'Hi' }));
    app.get('/other', (request, reply) => reply.view('hello', { name: 'Ada' }, { layout: 'other-layout' }));
    app.get('/none', (request, reply) => reply.view('hello', { name: 'Ada' }, { layout: false }));
    expect((await app.inject('/')).body).toBe(
      '<html><title>Hi</title><body><p>Hello Ada from xufa</p></body></html>'
    );
    expect((await app.inject('/other')).body).toBe('[<p>Hello Ada from xufa</p>]');
    expect((await app.inject('/none')).body).toBe('<p>Hello Ada from xufa</p>');
  });

  it('renders views in folders, with partials that are files', async () => {
    const app = makeApp();
    app.get('/user', (request, reply) => reply.view('users/show', { user: { name: 'Ada', tags: ['math', 'engines'] } }));
    expect((await app.inject('/user')).body).toBe(
      '<div class="card">Ada</div><ul><li>math</li><li>engines</li></ul>'
    );
  });

  it('keeps the content type given', async () => {
    const app = makeApp();
    app.get('/', (request, reply) => reply.type('text/plain').view('hello', { name: 'x' }));
    expect((await app.inject('/')).headers['content-type']).toMatch(/^text\/plain/);
  });

  it('answers 500 for views that are not there, fail, or lead out of root', async () => {
    const app = makeApp();
    app.get('/view/*', (request, reply) => reply.view(request.params['*']));
    app.get('/broken', (request, reply) => reply.view('broken'));
    app.get('/escape', (request, reply) => reply.view('escape'));
    const missing = await app.inject('/view/nothing');
    expect(missing.statusCode).toBe(500);
    expect(missing.json().message).toMatch(/No view nothing/);
    // Through requests (the router may refuse them first: 404) and through the plugin itself.
    for (const name of ['..%2Foutside', '%2E%2E/outside', '..%5Coutside']) {
      const response = await app.inject(`/view/${name}`);
      expect([404, 500]).toContain(response.statusCode);
      expect(response.body).not.toContain('SECRET');
    }
    for (const name of ['../outside', '..\\outside', 'users/../../outside', path.join(path.dirname(root), 'outside')]) {
      await expect(app.view(name)).rejects.toMatchObject({ code: 'XUFA_TEMPLATE_ERR_NOT_FOUND' });
    }
    expect((await app.inject('/broken')).json().message).toMatch(/\{\{#if\}\} is not closed \(broken/);
    const escape = await app.inject('/escape');
    expect(escape.statusCode).toBe(500);
    expect(escape.body).not.toContain('SECRET');
  });
});

describe('app.view and reply.viewAsync', () => {
  it('give the text', async () => {
    const app = makeApp({ layout: 'other-layout' });
    app.get('/', async (request, reply) => {
      const html = await reply.viewAsync('hello', { name: 'Ada' });
      return { html };
    });
    await app.ready();
    expect(await app.view('hello', { name: 'Grace' })).toBe('[<p>Hello Grace from xufa</p>]');
    expect((await app.inject('/')).json()).toEqual({ html: '[<p>Hello Ada from xufa</p>]' });
  });

  it('reads the files again without cache, and once with it', async () => {
    write('changing.html', 'one');
    const live = makeApp({ cache: false });
    const kept = makeApp({ cache: true });
    await live.ready();
    await kept.ready();
    expect(await live.view('changing')).toBe('one');
    expect(await kept.view('changing')).toBe('one');
    write('changing.html', 'two');
    expect(await live.view('changing')).toBe('two');
    expect(await kept.view('changing')).toBe('one');
  });

  it('takes an engine of its own, and another property name', async () => {
    const engine = new TemplateEngine({ filters: { shout: (value) => `${value}!` } });
    write('shout.html', '{{ name | shout }}');
    const app = xufa();
    app.register(plugin, { root, engine, propertyName: 'render' });
    app.get('/', (request, reply) => reply.render('shout', { name: 'hey' }));
    expect((await app.inject('/')).body).toBe('hey!');
    expect(await app.render('shout', { name: 'ho' })).toBe('ho!');
    expect(app.hasRender('shout')).toBe(true);
  });

  it('app.hasView: whether a view is in a root (none out of them)', async () => {
    const app = makeApp();
    await app.ready();
    expect(app.hasView('hello')).toBe(true);
    expect(app.hasView('users/show.html')).toBe(true);
    expect(app.hasView('nope')).toBe(false);
    expect(app.hasView('../outside')).toBe(false);
    expect(app.hasView('')).toBe(false);
  });
});
