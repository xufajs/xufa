import { compile, render, fill, TemplateEngine, TemplateError, SafeString, escapeHtml } from '../index.js';

const data = () => ({
  title: 'Books <&> "quotes"',
  items: [
    { name: 'Ada', price: 12.5, tags: ['math', 'engines'] },
    { name: 'Grace', price: 7, tags: [] },
  ],
  empty: [],
  user: null,
  html: '<b>bold</b>',
  count: 3,
  settings: { theme: 'dark', size: 'L' },
});

describe('output', () => {
  it('writes values escaped for HTML, and as they are with {{{ }}}', () => {
    expect(render('<h1>{{ title }}</h1>', data())).toBe('<h1>Books &lt;&amp;&gt; &quot;quotes&quot;</h1>');
    expect(render('{{{ html }}}|{{ html }}', data())).toBe('<b>bold</b>|&lt;b&gt;bold&lt;/b&gt;');
    expect(render("{{ \"it's\" }}", {})).toBe('it&#39;s');
  });

  it('writes null and undefined as nothing, lists and plain objects as JSON, the rest as text', () => {
    expect(render('[{{ user }}][{{ missing }}][{{ count }}][{{ true }}]', data())).toBe('[][][3][true]');
    expect(render('{{{ settings }}} {{{ [1, 2] }}}', data())).toBe('{"theme":"dark","size":"L"} [1,2]');
  });

  it('reads members of null as nothing (strict: as errors)', () => {
    expect(render('[{{ user.name }}][{{ user.name.first }}]', data())).toBe('[][]');
    const strict = new TemplateEngine({ strict: true });
    expect(() => strict.render('{{ user.name }}', data())).toThrow(expect.objectContaining({ code: 'XUFA_TEMPLATE_ERR_RUNTIME' }));
    expect(() => strict.render('{{ nobody }}', {})).toThrow('nobody is not defined');
  });

  it('runs expressions: arrow functions, template literals, globals', () => {
    expect(render('{{ items.map(i => i.name).join(", ") }}', data())).toBe('Ada, Grace');
    expect(render('{{ `${count} items` }}', data())).toBe('3 items');
    expect(render('{{ Math.max(...items.map(i => i.price)) }}', data())).toBe('12.5');
    // }} inside strings and objects of the expression is not the end of the tag.
    expect(render('{{ "}}" }}{{ ({ a: { b: 1 } }).a.b }}', {})).toBe('}}1');
  });

  it('keeps comments out, takes out white space with ~ and writes \\{{ as {{', () => {
    expect(render('a {{! a comment }}b{{!-- with }} in it --}}c', {})).toBe('a bc');
    expect(render('a   {{~ "b" ~}}   c', {})).toBe('abc');
    expect(render('<ul>\n  {{~#each [1, 2] as n~}}\n  <li>{{ n }}</li>\n  {{~/each~}}\n</ul>', {})).toBe(
      '<ul><li>1</li><li>2</li></ul>'
    );
    expect(render(`${String.fromCharCode(92)}{{ not a tag }} {{ 1 }}`, {})).toBe('{{ not a tag }} 1');
  });
});

describe('filters', () => {
  it('changes values with the default filters', () => {
    const cases = [
      ['{{ "ada" | upper }}', 'ADA'],
      ['{{ "ADA" | lower }}', 'ada'],
      ['{{ "ada lovelace" | capitalize }}', 'Ada lovelace'],
      ['{{ "  x  " | trim }}', 'x'],
      ['{{ user | default("guest") }}', 'guest'],
      ['{{ settings | json }}', '{&quot;theme&quot;:&quot;dark&quot;,&quot;size&quot;:&quot;L&quot;}'],
      ['{{ items[0].tags | join(" / ") }}', 'math / engines'],
      ['{{ items | length }}/{{ settings | length }}/{{ "abc" | length }}', '2/2/3'],
      ['{{ items | first | json }}', '{&quot;name&quot;:&quot;Ada&quot;,&quot;price&quot;:12.5,&quot;tags&quot;:[&quot;math&quot;,&quot;engines&quot;]}'],
      ['{{ (items | last).name }}', 'Grace'],
      ['{{ [1, 2, 3] | reverse | join }}', '3, 2, 1'],
      ['{{ "abcdef" | slice(1, 3) }}', 'bc'],
      ['{{ settings | keys | join }}', 'theme, size'],
      ['{{ "a long sentence here" | truncate(10) }}', 'a long se…'],
      ['{{ "a-b-c" | replace("-", "+") }}', 'a+b+c'],
      ['{{ 3.14159 | round(2) }}', '3.14'],
      ['{{ 7 | fixed(2) }}', '7.00'],
      ['{{ 1234.5 | number("en-US") }}', '1,234.5'],
      ['{{ "2026-01-02T00:00:00Z" | date("en-US", { timeZone: "UTC" }) }}', '1/2/2026'],
      ['{{ "a b&c" | urlencode }}', 'a%20b%26c'],
      ['{{ html | safe }}', '<b>bold</b>'],
      ['{{{ html | escape }}}', '&lt;b&gt;bold&lt;/b&gt;'],
    ];
    cases.forEach(([source, expected]) => expect(render(source, data())).toBe(expected));
    // Iterables (a loaded QuerySet) by their items.
    const loaded = { *[Symbol.iterator]() { yield 'a'; yield 'b'; } };
    expect(render('{{ list | length }}: {{ list | join }}', { list: loaded })).toBe('2: a, b');
  });

  it('takes filters of its own', () => {
    const engine = new TemplateEngine({ filters: { money: (value) => `${value.toFixed(2)} €` } });
    expect(engine.render('{{ 5 | money }}', {})).toBe('5.00 €');
    engine.filter('shout', (value) => `${value}!`);
    expect(engine.render('{{ "hey" | shout | upper }}', {})).toBe('HEY!');
    expect(() => engine.render('{{ 1 | nope }}', {})).toThrow('Unknown filter nope');
  });
});

describe('blocks', () => {
  it('chooses with if, else if and else', () => {
    const template = compile('{{#if count > 5}}many{{else if count > 0}}some{{else}}none{{/if}}');
    expect(template({ count: 9 })).toBe('many');
    expect(template({ count: 2 })).toBe('some');
    expect(template({ count: 0 })).toBe('none');
    expect(render('{{#if user}}x{{/if}}', data())).toBe('');
  });

  it('goes through lists, objects, maps and strings with each, and else when there is nothing', () => {
    const template =
      '{{#each items as item}}{{ loop.number }}.{{ item.name }}{{#if !loop.last}}, {{/if}}{{else}}nothing{{/each}}';
    expect(render(template, data())).toBe('1.Ada, 2.Grace');
    expect(render(template, { items: [] })).toBe('nothing');
    expect(render(template, {})).toBe('nothing');
    expect(render('{{#each settings as value, key}}{{ key }}={{ value }};{{/each}}', data())).toBe('theme=dark;size=L;');
    expect(render('{{#each map as value, key}}{{ key }}:{{ value }} {{/each}}', { map: new Map([['a', 1]]) })).toBe(
      'a:1 '
    );
    expect(render('{{#each "ab"}}[{{ item }}{{ loop.index }}]{{/each}}', {})).toBe('[a0][b1]');
    expect(render('{{#each items as item, i}}{{ i }}{{ loop.length }}{{ loop.first }} {{/each}}', data())).toBe(
      '02true 12false '
    );
  });

  it('nests blocks, and reads the names around them', () => {
    const template =
      '{{#each items as item}}{{ item.name }}:{{#each item.tags as tag}}{{ tag }}@{{ item.name }}/{{ title.length }} {{else}}-{{/each}};{{/each}}';
    expect(render(template, data())).toBe('Ada:math@Ada/18 engines@Ada/18 ;Grace:-;');
  });

  it('names a value with with', () => {
    expect(render('{{#with items[0] as first}}{{ first.name }} {{ count }}{{/with}}', data())).toBe('Ada 3');
  });

  it('writes partials, with the context or the one given, up to maxDepth', () => {
    const engine = new TemplateEngine({ partials: { item: '<li>{{ item.name }}</li>', card: '[{{ name }}|{{ count }}]' } });
    expect(engine.render('<ul>{{#each items as item}}{{> item}}{{/each}}</ul>', data())).toBe(
      '<ul><li>Ada</li><li>Grace</li></ul>'
    );
    expect(engine.render('{{> card items[1]}}', data())).toBe('[Grace|3]');
    engine.partial('tree', '{{ node.name }}({{#each node.children as node}}{{> tree}}{{/each}})');
    const tree = { node: { name: 'a', children: [{ name: 'b', children: [{ name: 'c', children: [] }] }] } };
    expect(engine.render('{{> tree}}', tree)).toBe('a(b(c()))');
    engine.partial('loop', '{{> loop}}');
    expect(() => engine.render('{{> loop}}', {})).toThrow(expect.objectContaining({ code: 'XUFA_TEMPLATE_ERR_PARTIAL' }));
    expect(() => engine.render('{{> nope}}', {})).toThrow('Unknown partial nope');
    // A key __proto__ of the data given to a partial is a name, not the prototype of its context.
    engine.partial('proto', '{{ typeof __proto__ }}|{{ name }}');
    expect(() => engine.render('{{> proto data}}', { data: JSON.parse('{"__proto__": {"name": "x"}}') })).toThrow(
      expect.objectContaining({ code: 'XUFA_EXPR_ERR_FORBIDDEN' })
    );
    engine.partial('named', '[{{ name }}]');
    expect(engine.render('{{> named data}}', { data: JSON.parse('{"__proto__": {"name": "x"}}') })).toBe('[]');
  });
});

describe('errors', () => {
  const cases = [
    ['an unclosed block', 'a{{#if x}}b', '{{#if}} is not closed', 1, 2],
    ['a block closed by another', '{{#if x}}{{/each}}', '{{/each}} closes {{#if}}', 1, 10],
    ['a close of nothing', 'x\n  {{/if}}', '{{/if}} closes no block', 2, 3],
    ['an unknown block', '{{#loop x}}{{/loop}}', 'Unknown block {{#loop}}', 1, 1],
    ['else out of a block', '{{else}}', '{{else}} out of {{#if}} or {{#each}}', 1, 1],
    ['an expression that fails to parse', 'line\n{{ a + }}', 'Unexpected end of the expression', 2, 7],
    ['an unclosed tag', 'a {{ b', 'Unclosed tag', 1, 3],
    ['an empty tag', '{{ }}', 'Empty tag', 1, 1],
    ['a name that cannot be', '{{#each xs as constructor}}{{/each}}', 'constructor cannot be a name', 1, 1],
  ];
  it.each(cases)('says where %s is', (title, source, message, line, column) => {
    try {
      render(source, {});
      throw new Error('no error');
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateError);
      expect(err.message).toContain(message);
      expect({ line: err.line, column: err.column }).toEqual({ line, column });
    }
  });

  it('names the template in its errors', () => {
    expect(() => compile('{{#if}}', { name: 'page.html' })).toThrow(/page\.html, line 1, column 1/);
  });

  it('cannot reach what expressions cannot', () => {
    expect(() => render('{{ items.constructor }}', data())).toThrow(expect.objectContaining({ code: 'XUFA_EXPR_ERR_FORBIDDEN' }));
    expect(render('{{ process }}{{ require }}', {})).toBe('');
  });
});

describe('fill', () => {
  it('fills data: a tag alone gives its value, the rest text, not escaped', () => {
    const env = { HOST: 'db', PORT: '6543', NAME: 'a&b' };
    const config = {
      host: '{{ env.HOST }}',
      port: '{{ Number(env.PORT) }}',
      url: 'postgres://{{ env.HOST }}:{{ env.PORT }}/{{ env.NAME }}',
      flags: ['{{ env.PORT > 1000 }}', 'plain'],
      nested: { list: '{{ [1, 2] }}', missing: '{{ env.MISSING ?? "default" }}' },
      number: 5,
      date: new Date(0),
    };
    expect(fill(config, { env })).toEqual({
      host: 'db',
      port: 6543,
      url: 'postgres://db:6543/a&b',
      flags: [true, 'plain'],
      nested: { list: [1, 2], missing: 'default' },
      number: 5,
      date: new Date(0),
    });
  });

  it('keeps a key __proto__ of the data as a key', () => {
    const filled = fill(JSON.parse('{"__proto__": {"polluted": "{{ 1 }}"}}'), {});
    expect(Object.getPrototypeOf(filled)).toBe(Object.prototype);
    expect({}.polluted).toBe(undefined);
  });
});

describe('engine', () => {
  it('compiles a template once', () => {
    const engine = new TemplateEngine();
    expect(engine.compile('{{ a }}')).toBe(engine.compile('{{ a }}'));
    expect(engine.compile('{{ a }}', { escape: false })).not.toBe(engine.compile('{{ a }}'));
  });

  it('escapes with a function of its own, or not at all', () => {
    const shout = new TemplateEngine({ escape: (text) => text.toUpperCase() });
    expect(shout.render('{{ "a" }} b', {})).toBe('A b');
    const plain = new TemplateEngine({ escape: false });
    expect(plain.render('{{ html }}', data())).toBe('<b>bold</b>');
    expect(render('{{ html }}', data(), { escape: false })).toBe('<b>bold</b>');
  });

  it('gives its escaping and SafeString', () => {
    expect(escapeHtml('<a href="x">\'&`</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#96;&lt;/a&gt;');
    expect(render('{{ trusted }}', { trusted: new SafeString('<i>ok</i>') })).toBe('<i>ok</i>');
  });
});
