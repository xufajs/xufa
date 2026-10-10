import { execFileSync } from 'node:child_process';
import { TemplateEngine, SafeString } from '../index.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Paths ({{ user.name }}) are read in a function made for each list of nodes rendered often; with inline: false, by
// closures. Both must give the same.
describe('paths read inline', () => {
  const engine = new TemplateEngine();
  // Rendered past the renders after which paths are read inline (16); each render the same.
  const inlined = {
    render(template, ctx) {
      const first = engine.render(template, ctx);
      for (let i = 0; i < 20; i += 1) expect(engine.render(template, ctx)).toBe(first);
      return engine.render(template, ctx);
    },
  };
  const closures = new TemplateEngine({ inline: false });
  const context = () => ({
    user: { name: 'Ada <&>', address: { city: 'London' }, tags: ['a', 'b'] },
    items: [{ price: 2 }, { price: 3, sale: true }],
    count: 0,
    nothing: null,
    $odd: 'dollar',
    flag: false,
    html: new SafeString('<i>safe</i>'),
    list: [1, 2],
    data: { a: 1 },
  });

  it('gives what the closures give', () => {
    const templates = [
      '{{ user.name }} lives in {{ user.address.city }}',
      '{{ user.missing }}|{{ user.missing.deeper }}|{{ nothing.x }}|{{ nobody }}|{{ nobody.x.y }}',
      '{{ user?.address?.city }} {{ user.tags[1] }} {{ items[1].price }} {{ items[5].price }}',
      '{{ count }} {{ flag }} {{ $odd }} {{ html }} {{ list }} {{ data }}',
      '{{{ user.name }}} {{{ html }}} {{{ data }}}',
      '{{ Math.PI }} {{ JSON }}',
      '{{#each items as item}}<li>{{ item.price }}{{#if item.sale}} sale{{/if}} {{ loop.index }}</li>{{/each}}',
      '{{ user.name | upper }} and {{ user . address . city }}',
    ];
    templates.forEach((template) => {
      expect(inlined.render(template, context())).toBe(closures.render(template, context()));
    });
    expect(inlined.render('{{ user.name }}', context())).toBe('Ada &lt;&amp;&gt;');
  });

  it('keeps texts and names as literals of the function it makes', () => {
    const texts = [
      '"); process.exit(1); ("',
      "'; throw new Error('x'); '",
      '\\"\n`${process}` */ // </script>',
      '\u2028\u2029\u0000 end',
    ];
    texts.forEach((text) => {
      expect(inlined.render(`${text}{{ user.name }}${text}`, context())).toBe(`${text}Ada &lt;&amp;&gt;${text}`);
    });
    // Names that cannot be reached are refused before, as in every expression.
    expect(() => inlined.render('{{ user.constructor }}', context())).toThrow(
      expect.objectContaining({ code: 'XUFA_EXPR_ERR_FORBIDDEN' })
    );
  });

  it('renders with code generation off (by closures)', () => {
    const script = `const { render } = require(${JSON.stringify(require.resolve('..'))});
let out = ''; for (let i = 0; i < 20; i += 1) out = render('<b>{{ user.name }}</b>{{#each list as n}}{{ n }}{{/each}}', { user: { name: 'A&B' }, list: [1, 2] });
process.stdout.write(out);`;
    const output = execFileSync(process.execPath, ['--disallow-code-generation-from-strings', '-e', script]);
    expect(String(output)).toBe('<b>A&amp;B</b>12');
  });
});
