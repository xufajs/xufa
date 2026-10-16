// XML for the DOM of @xufa/html: parsed (well-formed XML 1.0 with namespaces: declarations, doctypes, elements,
// attributes, the five entities and character references, CDATA sections, comments, processing instructions) into a
// document, or into a fragment for innerHTML (in the namespaces of its context); and serialized (the DOM Parsing
// standard's XML serialization: namespace declarations where needed, XHTML void elements as <br />, empty elements as
// <x/>). A document that is not well formed parses into a <parsererror> document, as in browsers; innerHTML throws.
import { DOMException } from './exception.js';
import {
  NAMESPACES,
  NODE_TYPES,
  Attr,
  Text,
  CDATASection,
  Comment,
  ProcessingInstruction,
  DocumentType,
} from './nodes.js';

const PARSER_ERROR_NS = 'http://www.mozilla.org/newlayout/xml/parsererror.xml';
const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const NAME = /^[:A-Z_a-zÀ-ÖØ-öø-˿Ͱ-ͽͿ-῿‌-‍⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�][-.0-9:A-Z_a-z·À-ÖØ-öø-ͽͿ-῿‌-‍‿-⁀⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�]*/;
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'basefont',
  'bgsound',
  'br',
  'col',
  'embed',
  'frame',
  'hr',
  'img',
  'input',
  'keygen',
  'link',
  'menuitem',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

class XmlError extends Error {}

// Text with its references (entities and characters) replaced.
function decode(text, fail) {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z_][\w.-]*);?/g, (whole, ref) => {
    if (!whole.endsWith(';')) fail(`A reference without ';': ${whole}`);
    if (ref[0] === '#') {
      const code = ref[1] === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      if (!(
        code === 0x9 ||
        code === 0xa ||
        code === 0xd ||
        (code >= 0x20 && code <= 0xd7ff) ||
        (code >= 0xe000 && code <= 0xfffd) ||
        (code >= 0x10000 && code <= 0x10ffff)
      )) {
        fail(`A reference to an invalid character: ${whole}`);
      }
      return String.fromCodePoint(code);
    }
    if (!(ref in ENTITIES)) fail(`An undefined entity: ${whole}`);
    return ENTITIES[ref];
  });
}

// Parses XML into a node (a document, or an element for fragments), with namespaces in scope.
function parseInto(document, parent, text, scope, fragment) {
  let i = 0;
  const fail = (message) => {
    throw new XmlError(message);
  };
  const stack = [{ node: parent, scope, name: null }];
  let rootSeen = false;
  const top = () => stack[stack.length - 1];
  const append = (node) => top().node._insert(node, null);
  const appendText = (data) => {
    if (!data) return;
    const holder = top().node;
    if (holder.nodeType === NODE_TYPES.DOCUMENT_NODE) {
      if (/[^\t\n\r ]/.test(data)) fail('Text outside the root element');
      return;
    }
    const last = holder._last;
    if (last && last.nodeType === NODE_TYPES.TEXT_NODE && last.constructor === Text) last._data += data;
    else append(new Text(document, data));
  };
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    const end = lt === -1 ? text.length : lt;
    if (end > i) {
      const raw = text.slice(i, end);
      if (raw.includes(']]>')) fail("']]>' in text");
      appendText(decode(raw, fail));
      i = end;
      continue;
    }
    if (text.startsWith('<!--', i)) {
      const close = text.indexOf('-->', i + 4);
      if (close === -1) fail('A comment without its end');
      const data = text.slice(i + 4, close);
      if (data.includes('--') || data.endsWith('-')) fail("'--' in a comment");
      append(new Comment(document, data));
      i = close + 3;
    } else if (text.startsWith('<![CDATA[', i)) {
      const close = text.indexOf(']]>', i + 9);
      if (close === -1) fail('A CDATA section without its end');
      if (top().node.nodeType === NODE_TYPES.DOCUMENT_NODE) fail('A CDATA section outside the root element');
      append(new CDATASection(document, text.slice(i + 9, close)));
      i = close + 3;
    } else if (text.startsWith('<?', i)) {
      const close = text.indexOf('?>', i + 2);
      if (close === -1) fail('A processing instruction without its end');
      const body = text.slice(i + 2, close);
      const target = (NAME.exec(body) || [''])[0];
      if (!target) fail('A processing instruction without a target');
      if (target.toLowerCase() === 'xml') {
        if (i !== 0 || fragment) fail('An XML declaration not at the start');
      } else append(new ProcessingInstruction(document, target, body.slice(target.length).replace(/^[\t\n\r ]+/, '')));
      i = close + 2;
    } else if (text.startsWith('<!DOCTYPE', i)) {
      if (fragment || rootSeen || top().node.nodeType !== NODE_TYPES.DOCUMENT_NODE) fail('A doctype out of place');
      const match =
        /^<!DOCTYPE[\t\n\r ]+([^\t\n\r >[]+)(?:[\t\n\r ]+(?:PUBLIC[\t\n\r ]+("[^"]*"|'[^']*')[\t\n\r ]+("[^"]*"|'[^']*')|SYSTEM[\t\n\r ]+("[^"]*"|'[^']*')))?[\t\n\r ]*(\[[\s\S]*?\][\t\n\r ]*)?>/.exec(
          text.slice(i)
        );
      if (!match) fail('A malformed doctype');
      const unquote = (value) => (value ? value.slice(1, -1) : '');
      append(new DocumentType(document, match[1], unquote(match[2]), unquote(match[3] || match[4])));
      i += match[0].length;
    } else if (text.startsWith('</', i)) {
      const match = /^<\/([^\t\n\r />]+)[\t\n\r ]*>/.exec(text.slice(i));
      if (!match) fail('A malformed end tag');
      const open = top();
      if (stack.length === 1 || open.name !== match[1]) fail(`An end tag that does not match: </${match[1]}>`);
      stack.pop();
      i += match[0].length;
    } else {
      // A start tag: its name, attributes (namespaces declared first), and maybe its end.
      const name = (NAME.exec(text.slice(i + 1)) || [''])[0];
      if (!name) fail('A malformed start tag');
      let j = i + 1 + name.length;
      const attrs = [];
      for (;;) {
        const space = /^[\t\n\r ]*/.exec(text.slice(j))[0];
        j += space.length;
        if (text.startsWith('/>', j) || text[j] === '>') break;
        if (!space) fail(`Attributes without space between them in <${name}>`);
        const attrName = (NAME.exec(text.slice(j)) || [''])[0];
        if (!attrName) fail(`A malformed attribute in <${name}>`);
        j += attrName.length;
        const value = /^[\t\n\r ]*=[\t\n\r ]*("[^"<]*"|'[^'<]*')/.exec(text.slice(j));
        if (!value) fail(`An attribute without a quoted value: ${attrName}`);
        j += value[0].length;
        if (attrs.some((a) => a.name === attrName)) fail(`A repeated attribute: ${attrName}`);
        attrs.push({
          name: attrName,
          value: decode(value[1].slice(1, -1), fail).replace(/[\t\n\r]/g, ' '),
        });
      }
      const selfClosing = text.startsWith('/>', j);
      i = j + (selfClosing ? 2 : 1);
      if (top().node.nodeType === NODE_TYPES.DOCUMENT_NODE) {
        if (rootSeen) fail('More than one root element');
        rootSeen = true;
      }
      const elementScope = { ...top().scope };
      for (const attr of attrs) {
        if (attr.name === 'xmlns') elementScope[''] = attr.value || null;
        else if (attr.name.startsWith('xmlns:')) {
          if (!attr.value) fail(`An empty namespace for the prefix ${attr.name.slice(6)}`);
          elementScope[attr.name.slice(6)] = attr.value;
        }
      }
      const split = (qualified) => {
        const colon = qualified.indexOf(':');
        return colon === -1 ? [null, qualified] : [qualified.slice(0, colon), qualified.slice(colon + 1)];
      };
      const [prefix, localName] = split(name);
      if (prefix === '' || localName === '' || localName.includes(':')) fail(`A malformed name: ${name}`);
      const namespace = prefix === null ? (elementScope[''] ?? null) : elementScope[prefix];
      if (prefix !== null && namespace === undefined) fail(`An undeclared prefix: ${prefix}`);
      const element = document._createElement(namespace, prefix, localName);
      for (const attr of attrs) {
        const [attrPrefix, attrLocal] = split(attr.name);
        let ns = null;
        if (attr.name === 'xmlns' || attrPrefix === 'xmlns') ns = NAMESPACES.XMLNS;
        else if (attrPrefix !== null) {
          ns = elementScope[attrPrefix];
          if (ns === undefined) fail(`An undeclared prefix: ${attrPrefix}`);
        }
        if (element._attrs.some((a) => a._namespace === ns && a._localName === attrLocal)) {
          fail(`A repeated attribute: ${attr.name}`);
        }
        element._appendAttr(new Attr(document, ns, attrPrefix, attrLocal, attr.value));
      }
      append(element);
      if (!selfClosing) stack.push({ node: element, scope: elementScope, name });
    }
  }
  if (stack.length > 1) fail(`An element without its end: <${top().name}>`);
  if (!fragment && !rootSeen) fail('No root element');
}

const XML_SCOPE = { xml: NAMESPACES.XML, xmlns: NAMESPACES.XMLNS };

// A document of XML (a <parsererror> document when it is not well formed).
function parseXml(document, text) {
  try {
    parseInto(document, document, text, { ...XML_SCOPE }, false);
  } catch (err) {
    if (!(err instanceof XmlError)) throw err;
    while (document._first) document._removeChild(document._first);
    const error = document.createElementNS(PARSER_ERROR_NS, 'parsererror');
    error._insert(document.createTextNode(`XML Parsing Error: ${err.message}`), null);
    document._insert(error, null);
  }
  return document;
}

// The namespaces in scope at an element: its own and its ancestors' (the nearest wins).
function scopeOf(element) {
  const scope = { ...XML_SCOPE };
  const chain = [];
  for (let node = element; node && node.nodeType === NODE_TYPES.ELEMENT_NODE; node = node._parent) chain.unshift(node);
  for (const node of chain) {
    if (node._prefix) scope[node._prefix] = node._namespace;
    else scope[''] = node._namespace;
    for (const attr of node._attrs) {
      if (attr._namespace === NAMESPACES.XMLNS)
        scope[attr._prefix === null ? '' : attr._localName] = attr._value || null;
    }
  }
  return scope;
}

// innerHTML of an element of an XML document: the markup parsed in its namespaces, or a SyntaxError.
function parseXmlFragment(document, context, text) {
  const fragment = document.createDocumentFragment();
  try {
    parseInto(document, fragment, text, scopeOf(context), true);
  } catch (err) {
    if (!(err instanceof XmlError)) throw err;
    throw new DOMException(`The markup is not well formed: ${err.message}`, 'SyntaxError');
  }
  return fragment;
}

const escapeText = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (text) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\t/g, '&#x9;')
    .replace(/\n/g, '&#xA;')
    .replace(/\r/g, '&#xD;');

// The XML serialization of a node (outer) or its children, in the namespaces declared around it.
function serializeXml(node, outer) {
  let out = '';
  const write = (current, defaultNs, prefixes) => {
    switch (current.nodeType) {
      case NODE_TYPES.ELEMENT_NODE: {
        const declared = { ...prefixes };
        let ns = defaultNs;
        let declarations = '';
        const own = new Set();
        for (const attr of current._attrs) {
          if (attr._namespace === NAMESPACES.XMLNS) own.add(attr._prefix === null ? '' : attr._localName);
        }
        let name;
        if (current._prefix) {
          name = `${current._prefix}:${current._localName}`;
          if (declared[current._prefix] !== current._namespace && !own.has(current._prefix)) {
            declarations += ` xmlns:${current._prefix}="${escapeAttr(current._namespace ?? '')}"`;
          }
          declared[current._prefix] = current._namespace;
        } else {
          name = current._localName;
          if (current._namespace !== defaultNs && !own.has('')) {
            declarations += ` xmlns="${escapeAttr(current._namespace ?? '')}"`;
          }
          ns = current._namespace;
        }
        let attrs = '';
        for (const attr of current._attrs) {
          if (attr._namespace === NAMESPACES.XMLNS) {
            if (attr._prefix === null) ns = attr._value || null;
            else declared[attr._localName] = attr._value;
          }
          let attrName = attr.name;
          if (attr._namespace && attr._namespace !== NAMESPACES.XMLNS && attr._namespace !== NAMESPACES.XML) {
            const prefix = attr._prefix ?? Object.keys(declared).find((p) => declared[p] === attr._namespace);
            if (!prefix) {
              const generated = `ns${Object.keys(declared).length}`;
              declarations += ` xmlns:${generated}="${escapeAttr(attr._namespace)}"`;
              declared[generated] = attr._namespace;
              attrName = `${generated}:${attr._localName}`;
            } else {
              if (declared[prefix] !== attr._namespace && !own.has(prefix)) {
                declarations += ` xmlns:${prefix}="${escapeAttr(attr._namespace)}"`;
                declared[prefix] = attr._namespace;
              }
              attrName = `${prefix}:${attr._localName}`;
            }
          }
          attrs += ` ${attrName}="${escapeAttr(attr._value)}"`;
        }
        out += `<${name}${declarations}${attrs}`;
        const holder =
          current._namespace === NAMESPACES.HTML && current._localName === 'template' ? current.content : current;
        if (!holder._first) {
          if (current._namespace === NAMESPACES.HTML) {
            out += VOID_ELEMENTS.has(current._localName) ? ' />' : `></${name}>`;
          } else out += '/>';
          return;
        }
        out += '>';
        for (let child = holder._first; child; child = child._next) write(child, ns, declared);
        out += `</${name}>`;
        return;
      }
      case NODE_TYPES.TEXT_NODE:
        out += escapeText(current._data);
        return;
      case NODE_TYPES.CDATA_SECTION_NODE:
        out += `<![CDATA[${current._data}]]>`;
        return;
      case NODE_TYPES.COMMENT_NODE:
        out += `<!--${current._data}-->`;
        return;
      case NODE_TYPES.PROCESSING_INSTRUCTION_NODE:
        out += `<?${current._target} ${current._data}?>`;
        return;
      case NODE_TYPES.DOCUMENT_TYPE_NODE: {
        let doctype = `<!DOCTYPE ${current._name}`;
        if (current._publicId) doctype += ` PUBLIC "${current._publicId}"`;
        else if (current._systemId) doctype += ' SYSTEM';
        if (current._systemId) doctype += ` "${current._systemId}"`;
        out += `${doctype}>`;
        return;
      }
      default:
        for (let child = current._first; child; child = child._next) write(child, defaultNs, prefixes);
    }
  };
  // (As the standard's XML serialization starts: no namespace in context, only the xml prefix, whatever is declared
  // around the node; so its elements declare theirs.)
  const defaultNs = null;
  const prefixes = { xml: NAMESPACES.XML };
  if (outer) write(node, defaultNs, prefixes);
  else {
    const holder =
      node.nodeType === NODE_TYPES.ELEMENT_NODE && node._namespace === NAMESPACES.HTML && node._localName === 'template'
        ? node.content
        : node;
    for (let child = holder._first; child; child = child._next) write(child, defaultNs, prefixes);
  }
  return out;
}

export { parseXml, parseXmlFragment, serializeXml, PARSER_ERROR_NS };
