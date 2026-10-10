// Templates that extend others, as Django's {% extends %} and {% block %}: a base with blocks (their contents are
// the defaults), templates that fill some of them (block.super: the contents of the one they extend), in chains, with
// blocks in blocks; files of the plugin, layouts and streams.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import xufa from '@xufa/http';
import { TemplateEngine, plugin } from '../index.js';

const BASE =
  '<title>{{#block title}}Library{{/block}}</title>' +
  '[{{#block sidebar}}<ul>{{#block links}}<li>Home</li>{{/block}}</ul>{{/block}}]' +
  '<main>{{#block content}}{{/block}}</main>';
const CATALOG =
  "{{extends 'base'}}" +
  '{{#block title}}Catalog - {{ block.super }}{{/block}}' +
  '{{#block links}}{{ block.super }}<li>Books</li>{{/block}}';

const engine = () => new TemplateEngine({ partials: { base: BASE, catalog: CATALOG } });

describe('{{extends}} and {{#block}}', () => {
  it('a base alone: the contents of its blocks', () => {
    expect(engine().compile(BASE)({})).toBe('<title>Library</title>[<ul><li>Home</li></ul>]<main></main>');
  });

  it('a template fills the blocks it has, block.super gives those of the one it extends, in chains', () => {
    const page = engine().compile(
      "{{!-- a book --}}\n{{extends 'catalog'}}not written" +
        '{{#block title}}{{ book }} | {{ block.super }}{{/block}}' +
        '{{#block content}}<p>{{ book }}</p>{{/block content}}' +
        '{{#block links}}{{ block.super }}<li>Authors</li>{{/block}}'
    );
    expect(page({ book: 'Dune <1>' })).toBe(
      '<title>Dune &lt;1&gt; | Catalog - Library</title>' +
        '[<ul><li>Home</li><li>Books</li><li>Authors</li></ul>]' +
        '<main><p>Dune &lt;1&gt;</p></main>'
    );
    // Nothing filled: the base.
    expect(engine().compile("{{extends 'base'}}")({})).toBe('<title>Library</title>[<ul><li>Home</li></ul>]<main></main>');
  });

  it('a block that holds others: filling it takes them away, unless it writes block.super', () => {
    const e = engine();
    expect(e.compile("{{extends 'base'}}{{#block sidebar}}none{{/block}}{{#block links}}x{{/block}}")({})).toBe(
      '<title>Library</title>[none]<main></main>'
    );
    expect(e.compile("{{extends 'base'}}{{#block sidebar}}<nav>{{ block.super }}</nav>{{/block}}{{#block links}}x{{/block}}")({})).toBe(
      '<title>Library</title>[<nav><ul>x</ul></nav>]<main></main>'
    );
  });

  it('blocks see the context and the names around them; partials see the blocks', () => {
    const e = engine();
    e.partial('row', '{{#block row}}<li>{{ item }}</li>{{/block}}');
    e.partial('list', '{{#block content}}{{#each items as item}}{{> row}}{{/each}}{{/block}}');
    const page = e.compile("{{extends 'list'}}{{#block row}}<li>{{ loop.number }}. {{ item }}</li>{{/block}}");
    expect(page({ items: ['a', 'b'] })).toBe('<li>1. a</li><li>2. b</li>');
  });

  it('mistakes: extends not first, a name twice, a template not there, a wrong close, too deep', () => {
    const e = engine();
    expect(() => e.compile("x {{extends 'base'}}")).toThrow("{{extends 'name'}} is the first tag of a template");
    expect(() => e.compile('{{#block a}}{{/block}}{{#block a}}{{/block}}')).toThrow('Two blocks named a');
    expect(() => e.compile('{{#block a b}}{{/block}}')).toThrow('a b cannot be the name of a block');
    expect(() => e.compile('{{#block a}}{{/block b}}')).toThrow('{{/block b}} closes {{#block}}');
    expect(() => e.compile("{{extends 'nope'}}")({})).toThrow('Unknown template nope to extend');
    e.partial('loop', "{{extends 'loop'}}");
    expect(() => e.compile("{{extends 'loop'}}")({})).toThrow('Templates deeper than 32');
  });

  it('{{extends layout}}: the name an expression gives when it renders', () => {
    const page = engine().compile("{{extends layout ?? 'base'}}{{#block content}}{{ text }}{{/block}}");
    expect(page({ text: 'hi' })).toBe('<title>Library</title>[<ul><li>Home</li></ul>]<main>hi</main>');
    expect(page({ text: 'hi', layout: 'catalog' })).toBe(
      '<title>Catalog - Library</title>[<ul><li>Home</li><li>Books</li></ul>]<main>hi</main>'
    );
    expect([...page.stream({ text: 'hi', layout: 'catalog' })].join('')).toBe(page({ text: 'hi', layout: 'catalog' }));
    expect(() => engine().compile('{{extends layout}}')({})).toThrow('{{extends layout}} gives no name of a template');
    expect(() => engine().compile('x {{extends layout}}')).toThrow('is the first tag of a template');
  });

  it('streams of templates that extend others', async () => {
    const page = engine().compile("{{extends 'catalog'}}{{#block content}}{{ text }}{{/block}}");
    expect([...page.stream({ text: 'hi' })].join('')).toBe(page({ text: 'hi' }));
  });

  it('files of the plugin: extends finds them as partials, with layout: false', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-extends-'));
    try {
      fs.writeFileSync(path.join(root, 'base.html'), BASE);
      fs.mkdirSync(path.join(root, 'catalog'));
      fs.writeFileSync(path.join(root, 'catalog', 'base.html'), CATALOG);
      fs.writeFileSync(
        path.join(root, 'catalog', 'book.html'),
        "{{extends 'catalog/base'}}\n{{#block content}}{{ title }}{{/block}}\n"
      );
      const app = xufa();
      app.register(plugin, { root });
      app.get('/', (request, reply) => reply.view('catalog/book', { title: 'Emma' }));
      const res = await app.inject('/');
      expect(res.body).toBe('<title>Catalog - Library</title>[<ul><li>Home</li><li>Books</li></ul>]<main>Emma</main>');
      await app.close();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('several roots', () => {
  it('a name is the file of the first root that has it (the app over its apps); extends and partials too', async () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-roots-project-'));
    const catalog = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-roots-catalog-'));
    try {
      fs.writeFileSync(path.join(project, 'base.html'), '[{{#block content}}{{/block}}]');
      fs.mkdirSync(path.join(catalog, 'catalog'));
      fs.writeFileSync(path.join(catalog, 'base.html'), 'not this one');
      fs.writeFileSync(path.join(catalog, 'catalog', 'list.html'), "{{extends 'base'}}{{#block content}}{{> catalog/row}}{{/block}}");
      fs.writeFileSync(path.join(catalog, 'catalog', 'row.html'), 'a row');
      const app = xufa();
      app.register(plugin, { root: [project, catalog] });
      app.get('/', (request, reply) => reply.view('catalog/list'));
      app.get('/nope', (request, reply) => reply.view('catalog/nope'));
      expect((await app.inject('/')).body).toBe('[a row]');
      expect((await app.inject('/nope')).json().message).toMatch(/^No view catalog\/nope in /);
      await app.close();
    } finally {
      fs.rmSync(project, { recursive: true, force: true });
      fs.rmSync(catalog, { recursive: true, force: true });
    }
  });
});
