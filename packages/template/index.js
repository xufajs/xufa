// @xufa/template: templates of text and HTML with the expressions of @xufa/expression, compiled once and rendered
// many times. {{ expression }} writes a value escaped for HTML ({{{ expression }}} as it is); filters change values
// ({{ name | upper }}); blocks: {{#if}} {{else if}} {{else}} {{/if}}, {{#each items as item, key}} {{else}} {{/each}}
// (with loop.index, loop.first, loop.last...), {{#with value as name}} {{/with}}; partials {{> name}} and
// {{> name context}}; comments {{! ... }} and {{!-- ... --}}; {{~ and ~}} take out the white space around a tag.
//
//   import { render, fill } from '@xufa/template';
//   render('<h1>{{ title | upper }}</h1>{{#each items as item}}<li>{{ item.name }}</li>{{/each}}', data);
//   fill({ url: '{{ env.DATABASE_URL }}', port: '{{ Number(env.PORT ?? 5432) }}' }, { env: process.env });
import { Engine } from '@xufa/expression';
import { TemplateCompiler } from './lib/compiler.js';
import { TemplateError } from './lib/errors.js';
import { FILTERS, SafeString, escapeHtml } from './lib/filters.js';
import { templatePlugin } from './lib/plugin.js';

const NO_ESCAPE = (text) => text;

// The compiled templates by their source, then by escape and name: the source is not copied into a key at each render
// (a template of some kilobytes was, twice a page), and a source given again is the same string, whose hash V8 keeps.
// At most `max` templates: the oldest source goes first.
class SourceCache {
  constructor(max) {
    this.max = max;
    this.sources = new Map();
    this.size = 0;
  }

  get(source, key) {
    const keyed = this.sources.get(source);
    return keyed === undefined ? undefined : keyed.get(key);
  }

  set(source, key, compiled) {
    if (this.max <= 0) return;
    let keyed = this.sources.get(source);
    if (keyed === undefined) {
      keyed = new Map();
      this.sources.set(source, keyed);
    }
    if (!keyed.has(key)) this.size += 1;
    keyed.set(key, compiled);
    while (this.size > this.max && this.sources.size > 1) {
      const [oldest, entries] = this.sources.entries().next().value;
      this.sources.delete(oldest);
      this.size -= entries.size;
    }
  }

  clear() {
    this.sources.clear();
    this.size = 0;
  }
}

class TemplateEngine {
  // `filters`: over the default ones; `globals` and `builtins`: those of the expressions (see @xufa/expression);
  // `escape`: true (HTML, the default), false, or a function of the text; `strict`: names not given and members of
  // null are errors (by default they are nothing); `partials`: sources by name; `maxDepth`: of partials in partials
  // (32); `cacheSize`: of templates kept (500); `inline`: false keeps paths ({{ user.name }}) as closures, not read in a
  // function made for the template (that is, with code generation off).
  constructor(options = {}) {
    this.options = options;
    this.inline = options.inline !== false && !options.strict;
    this.filters = { ...FILTERS, ...options.filters };
    this.partials = new Map(Object.entries(options.partials || {}));
    // loadPartial(name): the source of a partial that is not registered (or undefined).
    this.loadPartial = options.loadPartial || null;
    this.maxDepth = options.maxDepth === undefined ? 32 : options.maxDepth;
    this.cacheSize = options.cacheSize === undefined ? 500 : options.cacheSize;
    const { escape = true } = options;
    if (escape === true) this.escapeFn = escapeHtml;
    else if (escape === false) this.escapeFn = NO_ESCAPE;
    else if (typeof escape === 'function') this.escapeFn = escape;
    else throw new TypeError('escape is true, false or a function');
    this.makeExpressions();
  }

  makeExpressions() {
    const { globals, builtins, strict } = this.options;
    this.expressions = new Engine({
      globals,
      builtins,
      filters: this.filters,
      lenient: !strict,
      strict: Boolean(strict),
      cacheSize: 2000,
    });
    this.cache = new SourceCache(this.cacheSize);
    this.partialCache = new Map();
    this.loadedCache = new SourceCache(this.cacheSize);
  }

  // A filter more (or another): templates compiled before are compiled again.
  filter(name, fn) {
    if (typeof fn !== 'function') throw new TypeError('A filter is a function');
    this.filters[name] = fn;
    this.makeExpressions();
    return this;
  }

  // A partial: its source, by name ({{> name}}).
  partial(name, source) {
    if (typeof source !== 'string') throw new TypeError('A partial is the source of a template');
    this.partials.set(name, source);
    this.partialCache.clear();
    return this;
  }

  partialOf(name, escape) {
    const mode = escape === this.escapeFn ? 'e' : 'r';
    const key = `${mode}:${name}`;
    let compiled = this.partialCache.get(key);
    if (compiled) return compiled;
    const registered = this.partials.get(name);
    if (registered !== undefined) {
      compiled = new TemplateCompiler(this, registered, { name, escape }).compile();
      this.partialCache.set(key, compiled);
      return compiled;
    }
    // Not registered: loadPartial(name) gives its source (the files of a folder: see the plugin), compiled once for each
    // source (a file that changed is compiled again).
    if (!this.loadPartial) return null;
    const source = this.loadPartial(name);
    if (source === undefined || source === null) return null;
    compiled = this.loadedCache.get(source, key);
    if (!compiled) {
      compiled = new TemplateCompiler(this, source, { name, escape }).compile();
      this.loadedCache.set(source, key, compiled);
    }
    return compiled;
  }

  // The function of a template: render(context) gives its text. `options.name` names it in errors; `options.escape`
  // false writes values as they are.
  compile(source, options = {}) {
    if (typeof source !== 'string') throw new TypeError('A template is a string');
    const escape = options.escape === false ? NO_ESCAPE : this.escapeFn;
    const key = `${escape === this.escapeFn ? 'e' : 'r'}:${options.name || ''}`;
    let compiled = this.cache.get(source, key);
    if (!compiled) {
      compiled = new TemplateCompiler(this, source, { name: options.name, escape }).compile();
      this.cache.set(source, key, compiled);
    }
    return compiled;
  }

  render(source, context, options) {
    return this.compile(source, options)(context);
  }

  // Values of data with templates in their strings (configuration, messages...), as they are written (not escaped):
  // a string that is one {{ expression }} alone gives its value (a number, an object...), the others their text;
  // arrays and plain objects are filled item by item. The rest is as it is.
  fill(value, context) {
    if (typeof value === 'string') {
      if (!value.includes('{{')) return value;
      const compiled = this.compile(value, { escape: false });
      return compiled.value ? compiled.value(context) : compiled(context);
    }
    if (Array.isArray(value)) return value.map((item) => this.fill(item, context));
    if (value !== null && typeof value === 'object') {
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) return value;
      const result = {};
      Object.keys(value).forEach((key) => {
        const filled = this.fill(value[key], context);
        // A key __proto__ (of JSON) stays a key: it does not set the prototype.
        if (key === '__proto__') {
          Object.defineProperty(result, key, { value: filled, enumerable: true, writable: true, configurable: true });
        } else result[key] = filled;
      });
      return result;
    }
    return value;
  }
}

const engine = new TemplateEngine();

export const compile = (source, options) => engine.compile(source, options);
export const render = (source, context, options) => engine.render(source, context, options);
export const fill = (value, context) => engine.fill(value, context);

export { TemplateEngine, TemplateError, templatePlugin as plugin, SafeString, escapeHtml, FILTERS };
