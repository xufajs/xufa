const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const xufa = require('@xufa/http');
const { TemplateEngine, plugin } = require('..');

const data = () => ({
  title: 'Big <list>',
  items: Array.from({ length: 300 }, (_, i) => ({ id: i, name: `item ${i} & co`, tags: i % 3 ? ['a', 'b'] : [] })),
  user: null,
  settings: { theme: 'dark', size: 'L' },
});

describe('render.stream', () => {
  const engine = new TemplateEngine({ partials: { row: '<b>{{ item.id }}</b>' } });
  const templates = [
    '<h1>{{ title }}</h1>{{#each items as item}}<li>{{ item.name }}</li>{{/each}}<footer>end</footer>',
    '{{#each items as item}}{{> row}}{{#each item.tags as tag}}[{{ tag }}]{{else}}-{{/each}}{{/each}}',
    '{{#if user}}{{ user.name }}{{else if items.length > 10}}{{#each items as item}}{{ loop.number }},{{/each}}{{else}}none{{/if}}',
    '{{#each settings as value, key}}{{ key }}={{ value }};{{/each}}{{#each []}}x{{else}}empty{{/each}}',
    '{{#with items[0] as first}}{{#each items as item}}{{ first.id }}{{ item.id }}{{/each}}{{/with}}',
    'no tags at all',
  ];

  it('gives in chunks the text render() gives', () => {
    templates.forEach((source) => {
      const template = engine.compile(source);
      const whole = template(data());
      for (const chunkSize of [1, 50, 1000, 65536]) {
        const chunks = [...template.stream(data(), { chunkSize })];
        expect(chunks.join('')).toBe(whole);
        // Chunks of the size asked for, but the last (an item, or a text, is never cut).
        chunks.slice(0, -1).forEach((chunk) => expect(chunk.length).toBeGreaterThanOrEqual(chunkSize));
      }
    });
  });

  it('makes the chunks as they are read', () => {
    let rendered = 0;
    const counting = new TemplateEngine({ filters: { count: (value) => ((rendered += 1), value) } }); // eslint-disable-line no-sequences
    const items = Array.from({ length: 1000 }, (_, i) => i);
    const chunks = counting.compile('{{#each items as n}}{{ n | count }},{{/each}}').stream({ items }, { chunkSize: 100 });
    expect(rendered).toBe(0);
    chunks.next();
    // The first chunk needs a few dozen items, not the thousand.
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(100);
    const rest = [...chunks];
    expect(rendered).toBe(1000);
    expect(rest.length).toBeGreaterThan(10);
  });
});

describe('reply.view with stream', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-stream-'));
  const write = (name, text) => fs.writeFileSync(path.join(root, name), text);
  write('list.html', '<ul>{{#each items as item}}<li>{{ item.name }}</li>{{/each}}</ul>');
  write('layout.html', '<html><title>{{ title }}</title><body>{{ body }}</body></html>');
  write('twice.html', '{{ body }}|{{ body }}');
  write('filtered.html', '{{ body | upper }}');
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  const makeApp = (options = {}) => {
    const app = xufa();
    app.register(plugin, { root, layout: 'layout', chunkSize: 100, ...options });
    app.get('/', (request, reply) => reply.view('list', data(), { stream: true, layout: request.query.layout }));
    app.get('/plain', (request, reply) => reply.view('list', data(), { layout: request.query.layout }));
    app.get('/missing', (request, reply) => reply.view('nothing', {}, { stream: true }));
    return app;
  };

  it('sends the view in chunks, in its layout, as the view rendered whole', async () => {
    const app = makeApp();
    const streamed = await app.inject('/');
    const plain = await app.inject('/plain');
    expect(streamed.statusCode).toBe(200);
    expect(streamed.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(streamed.headers['transfer-encoding']).toBe('chunked');
    expect(streamed.body).toBe(plain.body);
    expect(streamed.body.startsWith('<html><title>Big &lt;list&gt;</title><body><ul><li>item 0 &amp; co</li>')).toBe(true);
    expect(streamed.body.endsWith('</ul></body></html>')).toBe(true);
  });

  it('renders whole a layout that does not write its body once as it is', async () => {
    const app = makeApp();
    for (const layout of ['twice', 'filtered']) {
      const streamed = await app.inject(`/?layout=${layout}`);
      expect(streamed.body).toBe((await app.inject(`/plain?layout=${layout}`)).body);
    }
  });

  it('answers 500 for a view that is not there, before it sends anything', async () => {
    const response = await makeApp().inject('/missing');
    expect(response.statusCode).toBe(500);
    expect(response.json().message).toMatch(/No view nothing/);
  });

  it('streams every view with the option of the plugin', async () => {
    const app = xufa();
    app.register(plugin, { root, stream: true });
    app.get('/', (request, reply) => reply.view('list', data()));
    const response = await app.inject('/');
    expect(response.headers['transfer-encoding']).toBe('chunked');
    expect(response.body.startsWith('<ul><li>item 0 &amp; co</li>')).toBe(true);
  });
});
