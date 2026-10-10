// A template as a function: its parts as a tree of blocks (if, each, with, partials), each a closure that gives its
// text. Expressions are those of @xufa/expression, with the filters of the engine; the names of a block (the item
// of an each, the name of a with) are in a context made over the one around it.
import { ExpressionError, FORBIDDEN } from '@xufa/expression';
import { scan } from './scanner.js';
import { TemplateError } from './errors.js';
import { SafeString, escapeHtml } from './filters.js';

const NAME = /^[A-Za-z_$][\w$]*$/;
// A path: a name and members of it by name or index (user.name, items[0].price, user?.address.city).
const PATH = /^[A-Za-z_$][\w$]*(?:\s*\??\.\s*[A-Za-z_$][\w$]*|\s*\[\s*\d+\s*\])*$/;
const SIMPLE_PATH = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
const PATH_PART = /[A-Za-z_$][\w$]*|\[\s*(\d+)\s*\]/g;
const NOT_PATHS = new Set(['true', 'false', 'null', 'undefined']);
// The blocks of the templates that extend the one rendered, by name: [their contents, the nearest first] (in the
// context, so the partials it renders see them too).
const BLOCKS = Symbol('xufa.template.blocks');
// {{extends 'name'}}: the template this one extends (Django's {% extends %}); {{extends layout}}: the name an
// expression gives when it renders (Django's {% extends variable %}).
const EXTENDS = /^extends\s+(['"])([\w./-]+)\1\s*$/;
const EXTENDS_VALUE = /^extends\s+(?!['"])(\S.*)$/;
const BLOCK_NAME = /^[\w-]+$/;
// Renders of a list of nodes before it is made one function (see render()).
const INLINE_AFTER = 16;
const { hasOwnProperty } = Object.prototype;

const isPlainObject = (value) => {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

// A value as text: null and undefined are nothing; arrays and plain objects, JSON.
function stringify(value) {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (value instanceof SafeString) return value.value;
  if (Array.isArray(value) || isPlainObject(value)) return JSON.stringify(value);
  return String(value);
}

// The entries of what an each goes through: [key, value] (indexes for lists).
function entriesOf(value) {
  if (value === null || value === undefined || value === false) return [];
  if (Array.isArray(value)) return value.map((item, i) => [i, item]);
  if (value instanceof Map) return [...value];
  if (typeof value === 'string' || typeof value[Symbol.iterator] === 'function')
    return [...value].map((item, i) => [i, item]);
  if (typeof value === 'object') return Object.entries(value);
  return [];
}

// Whether nodes may read a name (`block` for block.super, `loop` in an each): any expression that names it, and
// any partial or block inside (which could; told apart no further).
const BLOCK = /\bblock\b/;
const LOOP = /\bloop\b/;
function mayRead(nodes, name) {
  return nodes.some((node) => {
    switch (node.type) {
      case 'text':
        return false;
      case 'output':
        return name.test(node.source);
      case 'if':
        return (
          node.branches.some((branch) => name.test(branch.source) || mayRead(branch.nodes, name)) ||
          Boolean(node.otherwise && mayRead(node.otherwise, name))
        );
      case 'each':
      case 'with':
        return (
          name.test(node.source) ||
          mayRead(node.nodes, name) ||
          Boolean(node.otherwise && mayRead(node.otherwise, name))
        );
      default:
        return true;
    }
  });
}

// A context over another, with names of its own (as own properties: a name __proto__, of data given to a partial,
// does not set its prototype).
function child(context, names) {
  const scope = Object.create(context);
  const keys = Object.keys(names);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (key === '__proto__') {
      Object.defineProperty(scope, key, { value: names[key], enumerable: true, writable: true, configurable: true });
    } else scope[key] = names[key];
  }
  return scope;
}

class TemplateCompiler {
  // `engine`: the TemplateEngine (its expressions, partials and escaping); `name`: of the template, for errors.
  constructor(engine, source, { name, escape }) {
    this.engine = engine;
    this.source = source;
    this.name = name;
    this.escape = escape;
  }

  error(message, position, code = 'XUFA_TEMPLATE_ERR_SYNTAX', cause) {
    return new TemplateError(message, { code, source: this.source, position, name: this.name, cause });
  }

  // An expression of a tag at `offset` of the template: its function; its errors as errors of the template, there.
  expression(text, offset) {
    let fn;
    try {
      fn = this.engine.expressions.compile(text);
    } catch (err) {
      if (err instanceof ExpressionError) {
        const message = err.message.replace(/ \(line \d+, column \d+\)$/, '');
        throw this.error(
          message,
          offset + (err.position || 0),
          err.code === 'XUFA_EXPR_ERR_FORBIDDEN' ? err.code : undefined
        );
      }
      throw err;
    }
    const compiler = this;
    return (context) => {
      try {
        return fn(context);
      } catch (err) {
        if (err instanceof ExpressionError) {
          const message = err.message.replace(/ \(line \d+, column \d+\)$/, '');
          throw compiler.error(message, offset + (err.position || 0), 'XUFA_TEMPLATE_ERR_RUNTIME', err);
        }
        throw err;
      }
    };
  }

  // The keys of an expression that is a path (compiled already: its names are checked), to read it inline; null for
  // the others, and in strict engines (whose errors the closures give).
  pathOf(text) {
    if (!this.engine.inline) return null;
    let keys;
    // Most are names and dots (user.name): split; the others are read part by part.
    if (SIMPLE_PATH.test(text)) keys = text.split('.');
    else {
      if (!PATH.test(text)) return null;
      keys = [];
      PATH_PART.lastIndex = 0;
      for (let match = PATH_PART.exec(text); match !== null; match = PATH_PART.exec(text)) {
        keys.push(match[1] === undefined ? match[0] : Number(match[1]));
      }
    }
    if (NOT_PATHS.has(keys[0]) || keys.some((key) => typeof key === 'string' && FORBIDDEN.has(key))) return null;
    return keys;
  }

  // What writes a value: escaped (escaped true) or as it is.
  converter(escaped) {
    const escape = escaped ? this.escape : null;
    if (!escape) return stringify;
    const html = escape === escapeHtml;
    return (result) => {
      if (typeof result === 'string') return escape(result);
      // Numbers and booleans have nothing to escape (with the HTML escaping).
      if (typeof result === 'number' || typeof result === 'boolean')
        return html ? String(result) : escape(String(result));
      return result instanceof SafeString ? result.value : escape(stringify(result));
    };
  }

  // The value of a name of the context, or of the globals of the expressions (as expressions read names).
  reader() {
    const { globals } = this.engine.expressions;
    return (context, name) => {
      const value = context[name];
      if (value !== undefined || name in context) return value;
      return hasOwnProperty.call(globals, name) ? globals[name] : undefined;
    };
  }

  // A list of nodes as one function of JavaScript: its texts, and its paths read inline (as members of null are
  // nothing in templates), joined with +; the other nodes are called (V). Nothing of the template is code there: texts
  // and names are JSON literals, and paths were checked. Null when functions cannot be made (code generation off).
  inlined(nodes, items) {
    if (!nodes.some((node) => node.type === 'output' && this.pathOf(node.source))) return null;
    const parts = [];
    const values = [];
    const key = (part) => (typeof part === 'number' ? String(part) : JSON.stringify(part));
    nodes.forEach((node, i) => {
      if (node.type === 'text') parts.push(JSON.stringify(node.text));
      else if (node.type === 'output' && this.pathOf(node.source)) {
        const [first, ...rest] = this.pathOf(node.source);
        let read = `id(ctx, ${JSON.stringify(first)})`;
        if (rest.length) {
          read = `(t = ${read}) == null ? undefined : `;
          rest.forEach((part, j) => {
            read += j === rest.length - 1 ? `t[${key(part)}]` : `(t = t[${key(part)}]) == null ? undefined : `;
          });
        }
        parts.push(`${node.escape ? 'o' : 's'}(${read})`);
      } else {
        values.push(items[i]);
        parts.push(`V[${values.length - 1}](ctx, depth)`);
      }
    });
    try {
      // eslint-disable-next-line no-new-func
      const make = new Function(
        'V',
        'o',
        's',
        'id',
        `return function inlined(ctx, depth) { let t; return ${parts.join(' + ')}; };`
      );
      return make(values, this.converter(true), this.converter(false), this.reader());
    } catch {
      return null;
    }
  }

  checkName(name, position) {
    if (!NAME.test(name) || FORBIDDEN.has(name)) throw this.error(`${name} cannot be a name`, position);
  }

  // The tree: { nodes } of the template, and whether it is one expression alone (its value: fill()).
  build() {
    const parts = scan(this.source, this.name);
    const root = { type: 'root', nodes: [] };
    const stack = [root];
    const top = () => stack[stack.length - 1];
    this.parent = null;
    this.blocks = new Map();
    let tags = 0;
    parts.forEach((part) => {
      const block = top();
      const target = block.otherwise || block.current || block.nodes;
      if (part.kind !== 'comment' && !(part.kind === 'text' && !part.text.trim())) tags += 1;
      switch (part.kind) {
        case 'text':
          target.push({ type: 'text', text: part.text });
          break;
        case 'comment':
          break;
        case 'output':
        case 'raw':
          if (!part.body) throw this.error('Empty tag', part.position);
          if (part.kind === 'output' && (EXTENDS.test(part.body) || EXTENDS_VALUE.test(part.body))) {
            // As Django's: the first tag (the texts out of the blocks of a template that extends another are not
            // written).
            if (tags !== 1) throw this.error("{{extends 'name'}} is the first tag of a template", part.position);
            const literal = EXTENDS.exec(part.body);
            if (literal) [, , this.parent] = literal;
            else {
              const [, source] = EXTENDS_VALUE.exec(part.body);
              this.parent = { value: this.expression(source, part.start + part.body.indexOf(source)), source };
            }
            break;
          }
          target.push({
            type: 'output',
            value: this.expression(part.body, part.start),
            source: part.body,
            escape: part.kind === 'output',
          });
          break;
        case '#':
          stack.push(this.open(part, target));
          break;
        case 'else':
          this.otherwise(part, block);
          break;
        case '/': {
          const name = part.body.slice(1).trim();
          if (block.type === 'root') throw this.error(`{{/${name}}} closes no block`, part.position);
          // {{/block}}, or {{/block name}} (Django's {% endblock name %}).
          const closes =
            block.type === 'block' ? name === 'block' || name === `block ${block.name}` : name === block.type;
          if (!closes) throw this.error(`{{/${name}}} closes {{#${block.type}}}`, part.position);
          stack.pop();
          break;
        }
        case '>':
          target.push(this.partial(part));
          break;
        default:
      }
    });
    if (stack.length > 1) {
      const open = top();
      throw this.error(`{{#${open.type}}} is not closed`, open.position);
    }
    const single = parts.length === 1 && (parts[0].kind === 'output' || parts[0].kind === 'raw') ? root.nodes[0] : null;
    return { nodes: root.nodes, single };
  }

  open(part, target) {
    const body = part.body.slice(1);
    const match = /^\s*([a-z]+)\b/.exec(body);
    if (!match) throw this.error('Expected a block: {{#if}}, {{#each}} or {{#with}}', part.position);
    const keyword = match[1];
    const offset = part.start + 1 + match[0].length;
    const rest = body.slice(match[0].length);
    const restOffset = offset + (rest.length - rest.trimStart().length);
    const expression = rest.trim();
    if (!expression) throw this.error(`{{#${keyword}}} needs an expression`, part.position);
    if (keyword === 'block') {
      if (!BLOCK_NAME.test(expression)) throw this.error(`${expression} cannot be the name of a block`, part.position);
      if (this.blocks.has(expression)) throw this.error(`Two blocks named ${expression}`, part.position);
      const node = { type: 'block', name: expression, position: part.position, nodes: [], otherwise: null };
      this.blocks.set(expression, node);
      target.push(node);
      return node;
    }
    if (keyword === 'if') {
      const node = { type: 'if', position: part.position, branches: [], otherwise: null };
      node.branches.push({ test: this.expression(expression, restOffset), source: expression, nodes: [] });
      node.current = node.branches[0].nodes;
      target.push(node);
      return node;
    }
    if (keyword === 'each' || keyword === 'with') {
      // ... as item, key (each) or ... as name (with).
      const names = /\s+as\s+([A-Za-z_$][\w$]*)(?:\s*,\s*([A-Za-z_$][\w$]*))?\s*$/.exec(expression);
      if (keyword === 'with' && (!names || names[2]))
        throw this.error('{{#with value as name}} needs one name', part.position);
      const source = names ? expression.slice(0, names.index) : expression;
      const item = names ? names[1] : 'item';
      const key = names ? names[2] || null : null;
      this.checkName(item, part.position);
      if (key) this.checkName(key, part.position);
      const node = {
        type: keyword,
        position: part.position,
        value: this.expression(source, restOffset),
        source,
        item,
        key,
        nodes: [],
        otherwise: null,
      };
      target.push(node);
      return node;
    }
    throw this.error(`Unknown block {{#${keyword}}} (if, each, with, block)`, part.position);
  }

  otherwise(part, block) {
    const match = /^else(?:\s+if\s+([\s\S]+))?$/.exec(part.body);
    if (!match) throw this.error('Expected {{else}} or {{else if condition}}', part.position);
    if (block.type === 'if') {
      if (block.otherwise) throw this.error('{{else}} after {{else}}', part.position);
      if (match[1]) {
        const offset = part.start + part.body.indexOf(match[1]);
        const branch = { test: this.expression(match[1], offset), source: match[1], nodes: [] };
        block.branches.push(branch);
        block.current = branch.nodes;
      } else block.otherwise = [];
      return;
    }
    if (block.type === 'each' && !match[1] && !block.otherwise) {
      block.otherwise = [];
      return;
    }
    throw this.error('{{else}} out of {{#if}} or {{#each}}', part.position);
  }

  // The closure of the contents of a block (made once), and whether they may read `block` (block.super): those that
  // do not are rendered on the context as it is, with no block of their own.
  contentOf(node) {
    if (!node.content) {
      node.content = this.render(node.nodes);
      node.content.readsBlock = mayRead(node.nodes, BLOCK);
    }
    return node.content;
  }

  partial(part) {
    const match = /^>\s*([\w./-]+)\s*([\s\S]*)$/.exec(part.body);
    if (!match) throw this.error('Expected {{> name}} or {{> name context}}', part.position);
    const [, name, rest] = match;
    const value = rest ? this.expression(rest, part.start + part.body.indexOf(rest, 1 + name.length)) : null;
    return { type: 'partial', name, value, position: part.position };
  }

  // The closure of a list of nodes: it gives their text. Texts are joined with +, which V8 makes cheap (ropes, flattened
  // once); an array joined at the end costs more than the rest of a short template.
  render(nodes) {
    const items = nodes.map((node) => this.renderNode(node));
    const closures = this.joined(items);
    if (!this.engine.inline || !nodes.some((node) => node.type === 'output')) return closures;
    // With paths: closures first, and once the template has been rendered INLINE_AFTER times, one function that reads
    // them inline (making it costs more than a few renders: templates rendered a few times do not pay it).
    const { hot } = this;
    let run = closures;
    let tried = false;
    return (context, depth) => {
      if (!tried && hot.renders >= INLINE_AFTER) {
        tried = true;
        run = this.inlined(nodes, items) || closures;
      }
      return run(context, depth);
    };
  }

  // Closures joined: their texts with +.
  joined(items) {
    switch (items.length) {
      case 0:
        return () => '';
      case 1:
        return items[0];
      case 2: {
        const [a, b] = items;
        return (context, depth) => a(context, depth) + b(context, depth);
      }
      case 3: {
        const [a, b, c] = items;
        return (context, depth) => a(context, depth) + b(context, depth) + c(context, depth);
      }
      default:
        return (context, depth) => {
          let text = '';
          for (let i = 0; i < items.length; i += 1) text += items[i](context, depth);
          return text;
        };
    }
  }

  renderNode(node) {
    switch (node.type) {
      case 'text': {
        const { text } = node;
        return () => text;
      }
      case 'output': {
        const { value } = node;
        const convert = this.converter(node.escape);
        return (context) => convert(value(context));
      }
      case 'if': {
        const branches = node.branches.map((branch) => ({ test: branch.test, body: this.render(branch.nodes) }));
        const otherwise = node.otherwise ? this.render(node.otherwise) : null;
        return (context, depth) => {
          for (let i = 0; i < branches.length; i += 1) {
            if (branches[i].test(context)) return branches[i].body(context, depth);
          }
          return otherwise ? otherwise(context, depth) : '';
        };
      }
      case 'each': {
        const body = this.render(node.nodes);
        const otherwise = node.otherwise ? this.render(node.otherwise) : null;
        const { value, item, key } = node;
        const readsLoop = mayRead(node.nodes, LOOP);
        return (context, depth) => {
          const list = value(context);
          // Lists as they are; the rest as [key, value] entries.
          const isList = Array.isArray(list);
          const entries = isList ? list : entriesOf(list);
          const { length } = entries;
          if (length === 0) return otherwise ? otherwise(context, depth) : '';
          let text = '';
          // One scope for the items, each in turn (rendering is synchronous: nothing keeps it), and `loop` when the
          // body may read it. The names were checked when it was compiled (none is __proto__); those given go over loop.
          const scope = Object.create(context);
          const loop = readsLoop ? { index: 0, number: 1, first: true, last: false, length, key: null } : null;
          if (loop) scope.loop = loop;
          for (let i = 0; i < length; i += 1) {
            const entryKey = isList ? i : entries[i][0];
            if (loop) {
              loop.index = i;
              loop.number = i + 1;
              loop.first = i === 0;
              loop.last = i === length - 1;
              loop.key = entryKey;
            }
            scope[item] = isList ? entries[i] : entries[i][1];
            if (key) scope[key] = entryKey;
            text += body(scope, depth);
          }
          return text;
        };
      }
      case 'with': {
        const body = this.render(node.nodes);
        const { value, item } = node;
        return (context, depth) => body(child(context, { [item]: value(context) }), depth);
      }
      case 'block': {
        // The contents of the nearest template that has the block (those that extend this one go first), with
        // block.super: those of the one it extends.
        const own = this.contentOf(node);
        const { name } = node;
        return (context, depth) => {
          const given = context[BLOCKS] && context[BLOCKS][name];
          // Its own contents, which do not read block.super: no block to make.
          if (!given && !own.readsBlock) return own(context, depth);
          const chain = given ? (given.includes(own) ? given : [...given, own]) : [own];
          if (!chain[0].readsBlock) return chain[0](context, depth);
          const at = (index) => {
            const block = {
              get super() {
                return new SafeString(index + 1 < chain.length ? at(index + 1) : '');
              },
            };
            return chain[index](child(context, { block }), depth);
          };
          return at(0);
        };
      }
      case 'partial': {
        const { engine } = this;
        const { name, value, position } = node;
        const compiler = this;
        return (context, depth) => {
          if (depth >= engine.maxDepth) {
            throw compiler.error(
              `Partials deeper than ${engine.maxDepth} (${name})`,
              position,
              'XUFA_TEMPLATE_ERR_PARTIAL'
            );
          }
          const partial = engine.partialOf(name, compiler.escape);
          if (!partial) throw compiler.error(`Unknown partial ${name}`, position, 'XUFA_TEMPLATE_ERR_PARTIAL');
          let scope = context;
          if (value) {
            const given = value(context);
            scope = given && typeof given === 'object' ? child(context, given) : context;
          }
          return partial.text(scope, depth + 1);
        };
      }
      default:
        throw new Error(`Unknown node ${node.type}`);
    }
  }

  // The template: render(context) gives its text (render.text(context, depth), for partials); with one expression
  // alone, render.value(context) gives its value (not as text).
  compile() {
    const { nodes, single } = this.build();
    // How many times the template was rendered (whole, or as a partial).
    const hot = { renders: 0 };
    this.hot = hot;
    const inner = this.parent ? this.extending() : this.render(nodes);
    const text = (context, depth) => {
      hot.renders += 1;
      return inner(context, depth);
    };
    const render = (context) => text(context === null || context === undefined ? {} : context, 0);
    render.text = text;
    if (single) render.value = (context) => single.value(context === null || context === undefined ? {} : context);
    Object.defineProperty(render, 'source', { value: this.source });
    // render.stream(context, { chunkSize }): the text in chunks, made as they are read (made the first time it is used).
    let streamer = null;
    render.stream = (context, options = {}) => {
      // A template that extends another is given whole.
      if (!streamer) streamer = this.parent ? streamWhole(inner) : this.streamNodes(nodes);
      hot.renders += 1;
      return chunksOf(streamer, context === null || context === undefined ? {} : context, options.chunkSize || CHUNK);
    };
    return render;
  }

  // A template that extends another: the one it extends (found as partials are, by its name), rendered with the blocks
  // of this one after those of the templates that extend this one (the nearest first).
  extending() {
    const { engine, parent } = this;
    const compiler = this;
    const own = [...this.blocks.values()].map((node) => [node.name, this.contentOf(node)]);
    return (context, depth) => {
      const name = typeof parent === 'string' ? parent : parent.value(context);
      if (typeof name !== 'string' || name === '') {
        throw compiler.error(
          `{{extends ${parent.source}}} gives no name of a template (${typeof name})`,
          0,
          'XUFA_TEMPLATE_ERR_PARTIAL'
        );
      }
      if (depth >= engine.maxDepth) {
        throw compiler.error(`Templates deeper than ${engine.maxDepth} (${name})`, 0, 'XUFA_TEMPLATE_ERR_PARTIAL');
      }
      const base = engine.partialOf(name, compiler.escape);
      if (!base) throw compiler.error(`Unknown template ${name} to extend`, 0, 'XUFA_TEMPLATE_ERR_PARTIAL');
      const blocks = { ...context[BLOCKS] };
      for (const [name, content] of own) blocks[name] = blocks[name] ? [...blocks[name], content] : [content];
      const scope = Object.create(context);
      scope[BLOCKS] = blocks;
      return base.text(scope, depth + 1);
    };
  }

  // A list of nodes as a generator: the text of each node is added to state.text, and given (yield) when it is
  // chunkSize long. Lists of each and branches of if are generators too (a list of many items is given as it is
  // made); the other nodes are their closures.
  streamNodes(nodes) {
    const parts = nodes.map((node) => this.streamNode(node));
    return function* streamList(context, depth, state) {
      for (let i = 0; i < parts.length; i += 1) yield* parts[i](context, depth, state);
    };
  }

  streamNode(node) {
    if (node.type === 'if') {
      const branches = node.branches.map((branch) => ({ test: branch.test, body: this.streamNodes(branch.nodes) }));
      const otherwise = node.otherwise ? this.streamNodes(node.otherwise) : null;
      return function* streamIf(context, depth, state) {
        for (let i = 0; i < branches.length; i += 1) {
          if (branches[i].test(context)) {
            yield* branches[i].body(context, depth, state);
            return;
          }
        }
        if (otherwise) yield* otherwise(context, depth, state);
      };
    }
    if (node.type === 'each') {
      const otherwise = node.otherwise ? this.streamNodes(node.otherwise) : null;
      const { value, item, key } = node;
      // An item without lists of its own is rendered as render() does (inline, when hot), and the chunks are cut
      // between items; one with lists is a generator too.
      if (!hasEach(node.nodes)) {
        const text = this.render(node.nodes);
        return function* streamItems(context, depth, state) {
          const list = value(context);
          const isList = Array.isArray(list);
          const entries = isList ? list : entriesOf(list);
          const { length } = entries;
          if (length === 0) {
            if (otherwise) yield* otherwise(context, depth, state);
            return;
          }
          const { chunkSize } = state;
          let chunk = state.text;
          for (let i = 0; i < length; i += 1) {
            const entryKey = isList ? i : entries[i][0];
            const scope = Object.create(context);
            scope.loop = { index: i, number: i + 1, first: i === 0, last: i === length - 1, length, key: entryKey };
            scope[item] = isList ? entries[i] : entries[i][1];
            if (key) scope[key] = entryKey;
            chunk += text(scope, depth);
            if (chunk.length >= chunkSize) {
              state.text = '';
              yield chunk;
              chunk = '';
            }
          }
          state.text = chunk;
        };
      }
      const body = this.streamNodes(node.nodes);
      return function* streamEach(context, depth, state) {
        const list = value(context);
        const isList = Array.isArray(list);
        const entries = isList ? list : entriesOf(list);
        const { length } = entries;
        if (length === 0) {
          if (otherwise) yield* otherwise(context, depth, state);
          return;
        }
        for (let i = 0; i < length; i += 1) {
          const entryKey = isList ? i : entries[i][0];
          // As render(): the names were checked when it was compiled.
          const scope = Object.create(context);
          scope.loop = { index: i, number: i + 1, first: i === 0, last: i === length - 1, length, key: entryKey };
          scope[item] = isList ? entries[i] : entries[i][1];
          if (key) scope[key] = entryKey;
          yield* body(scope, depth, state);
        }
      };
    }
    const text = this.renderNode(node);
    return function* streamText(context, depth, state) {
      state.text += text(context, depth);
      if (state.text.length >= state.chunkSize) {
        const chunk = state.text;
        state.text = '';
        yield chunk;
      }
    };
  }
}

// Whether nodes have an each (in them, or in their branches).
function hasEach(nodes) {
  return nodes.some(
    (node) =>
      node.type === 'each' ||
      (node.type === 'if' &&
        (node.branches.some((branch) => hasEach(branch.nodes)) || hasEach(node.otherwise || []))) ||
      (node.type === 'with' && hasEach(node.nodes))
  );
}

// The size of the chunks of streams (characters).
const CHUNK = 65536;

function streamWhole(text) {
  return function* streamText(context, depth, state) {
    state.text += text(context, depth);
    while (state.text.length >= state.chunkSize) {
      yield state.text.slice(0, state.chunkSize);
      state.text = state.text.slice(state.chunkSize);
    }
  };
}

function* chunksOf(streamer, context, chunkSize) {
  const state = { text: '', chunkSize };
  yield* streamer(context, 0, state);
  if (state.text) yield state.text;
}

export { TemplateCompiler, stringify };
