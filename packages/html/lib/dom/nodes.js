// The nodes of the DOM of @xufa/html: documents, elements (of HTML, SVG, MathML), attributes, text, comments, doctypes
// and fragments, as the DOM standard (https://dom.spec.whatwg.org) has them, for what reads and changes a parsed tree:
// a sanitizer, a scraper, a test. Trees are made by the HTML parser (parse5's, ./adapter.js) and written by its
// serializer (innerHTML, outerHTML). No events, layout, styles, scripts or networking.
//
// The tree is linked (parent, first and last child, siblings); childNodes and attributes are live lists. Removing a
// node moves the live NodeIterators of its document as the standard says (./iterator.js), so a tree can be changed
// while it is walked.
import { DOMException } from './exception.js';

const NAMESPACES = {
  HTML: 'http://www.w3.org/1999/xhtml',
  SVG: 'http://www.w3.org/2000/svg',
  MATHML: 'http://www.w3.org/1998/Math/MathML',
  XML: 'http://www.w3.org/XML/1998/namespace',
  XMLNS: 'http://www.w3.org/2000/xmlns/',
};

const NODE_TYPES = {
  ELEMENT_NODE: 1,
  ATTRIBUTE_NODE: 2,
  TEXT_NODE: 3,
  CDATA_SECTION_NODE: 4,
  ENTITY_REFERENCE_NODE: 5,
  ENTITY_NODE: 6,
  PROCESSING_INSTRUCTION_NODE: 7,
  COMMENT_NODE: 8,
  DOCUMENT_NODE: 9,
  DOCUMENT_TYPE_NODE: 10,
  DOCUMENT_FRAGMENT_NODE: 11,
  NOTATION_NODE: 12,
};

// XML's Name production (https://www.w3.org/TR/xml/#NT-Name): the targets of processing instructions.
const NAME_START =
  ':A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D' +
  '\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}';
const NAME_CHAR = `${NAME_START}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040`;
// (XML's ranges have combining marks, U+0300 to U+036F, as characters of names: not misleading here.)
// eslint-disable-next-line no-misleading-character-class
const NAME = new RegExp(`^[${NAME_START}][${NAME_CHAR}]*$`, 'u');

// The names of elements, attributes, prefixes and doctypes, as the DOM standard has them now (whatwg/dom#1079: what
// the HTML parser makes, not XML's names). An element's: an ASCII letter then anything but ASCII white space, NUL, /
// and >; or :, _ or a non-ASCII character, then ASCII letters and digits, -, ., :, _ and non-ASCII characters.
const ELEMENT_LOCAL_NAME = /^(?:[A-Za-z][^\t\n\f\r /\0>]*|[:_\u0080-\u{10FFFF}][\w\-.:\u0080-\u{10FFFF}]*)$/u;
const ATTRIBUTE_LOCAL_NAME = /^[^\t\n\f\r /\0=>]+$/;
const NAMESPACE_PREFIX = /^[^\t\n\f\r /\0>]+$/;
const DOCTYPE_NAME = /^[^\t\n\f\r \0>]*$/;

const invalid = (what, name) => new DOMException(`"${name}" is not a valid ${what}.`, 'InvalidCharacterError');

function validateName(name) {
  if (!NAME.test(name)) throw new DOMException(`"${name}" did not match the Name production`, 'InvalidCharacterError');
}

function validateElementName(name) {
  if (!ELEMENT_LOCAL_NAME.test(name)) throw invalid('element name', name);
}

function validateAttributeName(name) {
  if (!ATTRIBUTE_LOCAL_NAME.test(name)) throw invalid('attribute name', name);
}

function validateDoctypeName(name) {
  if (!DOCTYPE_NAME.test(name)) throw invalid('doctype name', name);
}

// The namespace, prefix and local name of a qualified name in a namespace (the DOM's "validate and extract"), of an
// element or (`attribute`) an attribute.
function validateAndExtract(namespace, qualifiedName, attribute = false) {
  const ns = namespace === '' || namespace === undefined ? null : namespace;
  const colon = qualifiedName.indexOf(':');
  const prefix = colon === -1 ? null : qualifiedName.slice(0, colon);
  const localName = colon === -1 ? qualifiedName : qualifiedName.slice(colon + 1);
  if (prefix !== null && !NAMESPACE_PREFIX.test(prefix)) throw invalid('namespace prefix', prefix);
  if (attribute) validateAttributeName(localName);
  else validateElementName(localName);
  const fail = (message) => {
    throw new DOMException(message, 'NamespaceError');
  };
  if (prefix !== null && ns === null)
    fail('A namespace was given but a prefix was also extracted from the qualifiedName');
  if (prefix === 'xml' && ns !== NAMESPACES.XML)
    fail('A prefix of "xml" was given but the namespace was not the XML namespace');
  if ((qualifiedName === 'xmlns' || prefix === 'xmlns') && ns !== NAMESPACES.XMLNS) {
    fail('A prefix or qualifiedName of "xmlns" was given but the namespace was not the XMLNS namespace');
  }
  if (ns === NAMESPACES.XMLNS && qualifiedName !== 'xmlns' && prefix !== 'xmlns') {
    fail('The XMLNS namespace was given but neither the prefix nor qualifiedName was "xmlns"');
  }
  return { namespace: ns, prefix, localName };
}

// The namespace of a prefix (null: the default namespace) where an element is (the DOM standard's "locate a
// namespace"): its own, or one its xmlns attributes or those of its ancestors declare.
function locateNamespace(element, prefix) {
  if (prefix === 'xml') return NAMESPACES.XML;
  if (prefix === 'xmlns') return NAMESPACES.XMLNS;
  for (let node = element; node; node = node.parentElement) {
    if (node._namespace !== null && node._prefix === prefix) return node._namespace;
    const declaration = node._attrs.find(
      (attr) =>
        attr._namespace === NAMESPACES.XMLNS &&
        (prefix === null
          ? attr._prefix === null && attr._localName === 'xmlns'
          : attr._prefix === 'xmlns' && attr._localName === prefix)
    );
    if (declaration) return declaration._value === '' ? null : declaration._value;
  }
  return null;
}

// The prefix of a namespace where an element is ("locate a namespace prefix"): its own, or the first xmlns:prefix
// attribute declaring it, on it or on its ancestors.
function locatePrefix(element, namespace) {
  for (let node = element; node; node = node.parentElement) {
    if (node._namespace === namespace && node._prefix !== null) return node._prefix;
    const declaration = node._attrs.find((attr) => attr._prefix === 'xmlns' && attr._value === namespace);
    if (declaration) return declaration._localName;
  }
  return null;
}

// The root of a node (getRootNode()), and an order of the trees: the order their roots were first compared in.
const rootOf = (node) => {
  let root = node;
  while (root._parent) root = root._parent;
  return root;
};
const TREE_ORDER = new WeakMap();
let trees = 0;
const treeOrder = (root) => {
  if (!TREE_ORDER.has(root)) {
    trees += 1;
    TREE_ORDER.set(root, trees);
  }
  return TREE_ORDER.get(root);
};

// WebIDL's conversions: unsigned long, and the arguments an operation requires.
const toUint32 = (value) => Number(value) >>> 0;
function required(given, count, name) {
  if (given < count) {
    throw new TypeError(
      `Failed to execute '${name}': ${count} argument${count > 1 ? 's' : ''} required, but only ${given} present.`
    );
  }
}

const isDocument = (value) => value instanceof Node && value.nodeType === NODE_TYPES.DOCUMENT_NODE;
// The document of nodes made by their constructors (new Text()): the window's (globalThis.document), else one made
// for them (document.js sets how).
let documentFactory = null;
let ownDocument = null;
const setDocumentFactory = (factory) => {
  documentFactory = factory;
};
function defaultDocument() {
  if (isDocument(globalThis.document)) return globalThis.document;
  ownDocument ??= documentFactory();
  return ownDocument;
}

const asciiLowercase = (text) => text.replace(/[A-Z]+/g, (letters) => letters.toLowerCase());
const asciiUppercase = (text) => text.replace(/[a-z]+/g, (letters) => letters.toUpperCase());

// A live list of nodes or attributes. Its items are read again when it is read after its owner changed (invalidate()),
// or each time when it has no owner to say so (cached false: the elements a query finds); list[i] is read through a
// Proxy, so it is current too. (Rebuilding it on each change made a sanitize of many children quadratic.)
const INDEX = /^(?:0|[1-9]\d*)$/;
// (Its fields start with _: not among its keys.)
const isIndex = (key) =>
  typeof key === 'string' && key.charCodeAt(0) >= 48 && key.charCodeAt(0) <= 57 && INDEX.test(key);
// A named property of a list (HTMLCollection's: an element by its id or name), when the list has them and the name is
// not one of the list's own properties or its prototype's.
const namedOf = (target, key) =>
  target._named && typeof key === 'string' && key !== '' && !Reflect.has(target, key) ? target.namedItem(key) : null;
// (As WebIDL has them: indexes and names read-only, names not enumerable, the other properties as on any object.)
const LIST_HANDLER = {
  get(target, key, receiver) {
    if (isIndex(key)) return target._sync()[key];
    if (key === 'length') return target._sync().length;
    return namedOf(target, key) ?? Reflect.get(target, key, receiver);
  },
  has(target, key) {
    if (isIndex(key)) return Number(key) < target._sync().length;
    return Reflect.has(target, key) || namedOf(target, key) !== null;
  },
  set(target, key, value) {
    if (isIndex(key) || namedOf(target, key) !== null) return false;
    return Reflect.set(target, key, value);
  },
  defineProperty(target, key, descriptor) {
    if (isIndex(key) || namedOf(target, key) !== null) return false;
    return Reflect.defineProperty(target, key, descriptor);
  },
  deleteProperty(target, key) {
    if (isIndex(key)) return Number(key) >= target._sync().length;
    if (namedOf(target, key) !== null) return false;
    return Reflect.deleteProperty(target, key);
  },
  ownKeys(target) {
    const own = Reflect.ownKeys(target).filter((key) => typeof key !== 'string' || key[0] !== '_');
    const names = target._named ? target._names().filter((name) => !own.includes(name)) : [];
    return [...target._sync().keys()].map(String).concat(names, own);
  },
  getOwnPropertyDescriptor(target, key) {
    if (typeof key === 'string' && INDEX.test(key)) {
      const items = target._sync();
      return Number(key) < items.length
        ? { value: items[key], writable: false, enumerable: true, configurable: true }
        : undefined;
    }
    const named = namedOf(target, key);
    if (named) return { value: named, writable: false, enumerable: false, configurable: true };
    return Reflect.getOwnPropertyDescriptor(target, key);
  },
};

class LiveList {
  constructor(read, cached = true) {
    this._read = read;
    this._cached = cached;
    this._items = null;
    // (The list itself, behind its Proxy: its owner invalidates it there, not through the Proxy.)
    this._target = this;
    return new Proxy(this, LIST_HANDLER);
  }

  _sync() {
    if (!this._cached || this._items === null) this._items = this._read();
    return this._items;
  }

  // (Its owner changed: read again when next read.)
  invalidate() {
    this._items = null;
  }

  get length() {
    return this._sync().length;
  }

  item(index) {
    return this._sync()[index] ?? null;
  }
}
// (A list with indexes and a length: its iterator is Array.prototype.values, as WebIDL has it.)
Object.defineProperty(LiveList.prototype, Symbol.iterator, {
  value: Array.prototype.values,
  writable: true,
  configurable: true,
});

// The methods of a list that is iterable in WebIDL (NodeList, DOMTokenList): Array.prototype's forEach, entries,
// keys and values.
const ITERABLE = {
  forEach: Array.prototype.forEach,
  entries: Array.prototype.entries,
  keys: Array.prototype.keys,
  values: Array.prototype.values,
};
const iterable = (Class) => {
  for (const [name, method] of Object.entries(ITERABLE)) {
    Object.defineProperty(Class.prototype, name, { value: method, writable: true, configurable: true });
  }
};

class NodeList extends LiveList {}
iterable(NodeList);

// A list that does not change (querySelectorAll()): its items as own properties, read as an array's are, where a
// Proxy's trap costs microseconds a read. A NodeList all the same (its prototype, its length getter).
function staticNodeList(items) {
  const list = Object.create(NodeList.prototype);
  Object.defineProperties(list, { _items: { value: items }, _cached: { value: true }, _target: { value: list } });
  for (let i = 0; i < items.length; i += 1) {
    Object.defineProperty(list, i, { value: items[i], enumerable: true, configurable: true });
  }
  return list;
}

// The element children of a node, live.
class HTMLCollection extends LiveList {
  namedItem(name) {
    const key = String(name);
    if (key === '') return null;
    for (const element of this._sync()) {
      if (element.getAttribute('id') === key) return element;
      if (element._namespace === NAMESPACES.HTML && element.getAttribute('name') === key) return element;
    }
    return null;
  }

  // Its supported property names: ids, then names of HTML elements, in tree order, once each.
  _names() {
    const names = [];
    for (const element of this._sync()) {
      const id = element.getAttribute('id');
      if (id && !names.includes(id)) names.push(id);
      const name = element._namespace === NAMESPACES.HTML ? element.getAttribute('name') : null;
      if (name && !names.includes(name)) names.push(name);
    }
    return names;
  }
}
// (Named properties: collection.foo is namedItem('foo').)
Object.defineProperty(HTMLCollection.prototype, '_named', { value: true });

class Node {
  constructor(ownerDocument) {
    this._owner = ownerDocument;
    this._parent = null;
    this._first = null;
    this._last = null;
    this._prev = null;
    this._next = null;
    this._childList = null;
    this._childCount = 0;
  }

  get ownerDocument() {
    return this.nodeType === NODE_TYPES.DOCUMENT_NODE ? null : this._owner;
  }

  get parentNode() {
    return this._parent;
  }

  get parentElement() {
    return this._parent && this._parent.nodeType === NODE_TYPES.ELEMENT_NODE ? this._parent : null;
  }

  get firstChild() {
    return this._first;
  }

  get lastChild() {
    return this._last;
  }

  get previousSibling() {
    return this._prev;
  }

  get nextSibling() {
    return this._next;
  }

  get childNodes() {
    if (!this._childList) {
      this._childList = new NodeList(() => this._children());
      this._childItems = this._childList._target;
    }
    return this._childList;
  }

  // The element that stands for a node in the lookups of namespaces (the DOM standard's "locate a namespace"): itself,
  // the document's root, an attribute's element, or the parent element of the others; none for doctypes and fragments.
  _namespaceElement() {
    switch (this.nodeType) {
      case NODE_TYPES.ELEMENT_NODE:
        return this;
      case NODE_TYPES.DOCUMENT_NODE:
        return this.documentElement;
      case NODE_TYPES.DOCUMENT_TYPE_NODE:
      case NODE_TYPES.DOCUMENT_FRAGMENT_NODE:
        return null;
      case NODE_TYPES.ATTRIBUTE_NODE:
        return this._element;
      default:
        return this.parentElement;
    }
  }

  lookupNamespaceURI(prefix) {
    const element = this._namespaceElement();
    return element ? locateNamespace(element, prefix === '' || prefix === undefined ? null : prefix) : null;
  }

  isDefaultNamespace(namespace) {
    const element = this._namespaceElement();
    const ns = namespace === '' || namespace === undefined ? null : namespace;
    return (element ? locateNamespace(element, null) : null) === ns;
  }

  lookupPrefix(namespace) {
    if (namespace === null || namespace === undefined || namespace === '') return null;
    const element = this._namespaceElement();
    return element ? locatePrefix(element, String(namespace)) : null;
  }

  get nodeValue() {
    return null;
  }

  set nodeValue(value) {}

  get isConnected() {
    let node = this;
    while (node._parent) node = node._parent;
    return node.nodeType === NODE_TYPES.DOCUMENT_NODE;
  }

  get baseURI() {
    return 'about:blank';
  }

  hasChildNodes() {
    return this._first !== null;
  }

  // The children as an array (a copy).
  _children() {
    const children = [];
    for (let child = this._first; child; child = child._next) children.push(child);
    return children;
  }

  getRootNode() {
    let node = this;
    while (node._parent) node = node._parent;
    return node;
  }

  contains(other) {
    required(arguments.length, 1, 'contains');
    if (other !== null && other !== undefined && !(other instanceof Node)) {
      throw new TypeError("contains's argument is not a Node.");
    }
    for (let node = other; node; node = node._parent) if (node === this) return true;
    return false;
  }

  // Where other is from this (the DOM standard's algorithm): attributes are where their element is (after it), two
  // of one element in the order of its attributes; nodes of two trees in an order of the trees, the same both ways.
  compareDocumentPosition(other) {
    if (this === other) return 0;
    let node1 = other;
    let node2 = this;
    let attr1 = null;
    let attr2 = null;
    if (node1.nodeType === NODE_TYPES.ATTRIBUTE_NODE) {
      attr1 = node1;
      node1 = attr1._element;
    }
    if (node2.nodeType === NODE_TYPES.ATTRIBUTE_NODE) {
      attr2 = node2;
      node2 = attr2._element;
      if (attr1 && node1 && node2 === node1) {
        for (const attr of node2._attrs) {
          if (attr === attr1) return 32 | 2;
          if (attr === attr2) return 32 | 4;
        }
      }
    }
    const root1 = node1 ? rootOf(node1) : attr1;
    const root2 = node2 ? rootOf(node2) : attr2;
    if (!node1 || !node2 || root1 !== root2) return 1 | 32 | (treeOrder(root1) < treeOrder(root2) ? 2 : 4);
    if ((!attr1 && node1 !== node2 && node1.contains(node2)) || (node1 === node2 && attr2)) return 8 | 2;
    if ((!attr2 && node1 !== node2 && node2.contains(node1)) || (node1 === node2 && attr1)) return 16 | 4;
    return node1._order(node2) < 0 ? 2 : 4;
  }

  // Negative when this comes before other in tree order (of one tree).
  _order(other) {
    const path = (node) => {
      const nodes = [];
      for (let n = node; n; n = n._parent) nodes.unshift(n);
      return nodes;
    };
    const a = path(this);
    const b = path(other);
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
    if (i === a.length) return -1;
    if (i === b.length) return 1;
    for (let node = a[i]; node; node = node._next) if (node === b[i]) return -1;
    return 1;
  }

  isSameNode(other) {
    return this === other;
  }

  // The DOM's "equals": the same kind, the same names and data, equal attributes and equal children.
  isEqualNode(other) {
    if (other === null || other === undefined) return false;
    if (!(other instanceof Node)) throw new TypeError("isEqualNode's argument is not a Node.");
    if (this.nodeType !== other.nodeType) return false;
    switch (this.nodeType) {
      case NODE_TYPES.DOCUMENT_TYPE_NODE:
        if (this.name !== other.name || this.publicId !== other.publicId || this.systemId !== other.systemId)
          return false;
        break;
      case NODE_TYPES.ELEMENT_NODE:
        if (
          this._namespace !== other._namespace ||
          this._prefix !== other._prefix ||
          this._localName !== other._localName ||
          this._attrs.length !== other._attrs.length ||
          !this._attrs.every((attr) => other._attrs.some((each) => attr.isEqualNode(each)))
        ) {
          return false;
        }
        break;
      case NODE_TYPES.ATTRIBUTE_NODE:
        if (
          this._namespace !== other._namespace ||
          this._localName !== other._localName ||
          this._value !== other._value
        ) {
          return false;
        }
        break;
      case NODE_TYPES.PROCESSING_INSTRUCTION_NODE:
        if (this.target !== other.target || this._data !== other._data) return false;
        break;
      case NODE_TYPES.TEXT_NODE:
      case NODE_TYPES.CDATA_SECTION_NODE:
      case NODE_TYPES.COMMENT_NODE:
        if (this._data !== other._data) return false;
        break;
      default:
    }
    if (this._childCount !== other._childCount) return false;
    for (let a = this._first, b = other._first; a; a = a._next, b = b._next) if (!a.isEqualNode(b)) return false;
    return true;
  }

  // The text of the node: of its descendant text nodes for elements and fragments.
  get textContent() {
    let text = '';
    const walk = (node) => {
      for (let child = node._first; child; child = child._next) {
        if (child.nodeType === NODE_TYPES.TEXT_NODE || child.nodeType === NODE_TYPES.CDATA_SECTION_NODE) {
          text += child._data;
        } else if (child.nodeType === NODE_TYPES.ELEMENT_NODE) walk(child);
      }
    };
    walk(this);
    return text;
  }

  set textContent(value) {
    const text = value === null || value === undefined ? '' : String(value);
    while (this._first) this._removeChild(this._first);
    if (text !== '') this._insert(this._documentForChildren().createTextNode(text), null);
  }

  _documentForChildren() {
    return this.nodeType === NODE_TYPES.DOCUMENT_NODE ? this : this._owner;
  }

  appendChild(node) {
    return this.insertBefore(node, null);
  }

  insertBefore(node, child) {
    // (Both arguments, as WebIDL has them: a Node or null for child.)
    if (arguments.length < 2) throw new TypeError("Failed to execute 'insertBefore': 2 arguments required.");
    if (child !== null && !(child instanceof Node))
      throw new TypeError("insertBefore's second argument is not a Node.");
    this._checkInsert(node, child);
    const reference = child === node ? node._next : child;
    this._insert(node, reference ?? null);
    return node;
  }

  replaceChild(node, child) {
    if (!(child instanceof Node)) throw new TypeError("replaceChild's second argument is not a Node.");
    this._checkInsert(node, child, true);
    const reference = child._next === node ? node._next : child._next;
    this._removeChild(child);
    this._insert(node, reference);
    return child;
  }

  removeChild(child) {
    if (!child || child._parent !== this) {
      throw new DOMException('The node to be removed is not a child of this node.', 'NotFoundError');
    }
    this._removeChild(child);
    return child;
  }

  // The checks of the DOM's "ensure pre-insertion validity" (node before child, at the end when null), or of
  // "replace" (replacing: node in the place of child), in the standard's order.
  _checkInsert(node, child, replacing = false) {
    if (!(node instanceof Node)) throw new TypeError('The node to insert is not a Node.');
    const hierarchy = (message) => new DOMException(message, 'HierarchyRequestError');
    const parentType = this.nodeType;
    if (
      parentType !== NODE_TYPES.DOCUMENT_NODE &&
      parentType !== NODE_TYPES.DOCUMENT_FRAGMENT_NODE &&
      parentType !== NODE_TYPES.ELEMENT_NODE
    ) {
      throw hierarchy('This node cannot have children.');
    }
    if (node.contains(this)) throw hierarchy('The new child is an ancestor of the parent.');
    if (replacing ? !child || child._parent !== this : child && child._parent !== this) {
      const message = replacing
        ? 'The node to be replaced is not a child of this node.'
        : 'The reference node is not a child of this node.';
      throw new DOMException(message, 'NotFoundError');
    }
    const type = node.nodeType;
    if (
      type === NODE_TYPES.DOCUMENT_NODE ||
      type === NODE_TYPES.ATTRIBUTE_NODE ||
      (type === NODE_TYPES.TEXT_NODE && parentType === NODE_TYPES.DOCUMENT_NODE) ||
      (type === NODE_TYPES.DOCUMENT_TYPE_NODE && parentType !== NODE_TYPES.DOCUMENT_NODE)
    ) {
      throw hierarchy('This node cannot be inserted here.');
    }
    if (parentType !== NODE_TYPES.DOCUMENT_NODE) return;
    // A document: one element at most, one doctype at most, the doctype before the element, no text.
    const isElement = (n) => n.nodeType === NODE_TYPES.ELEMENT_NODE;
    const isDoctype = (n) => n.nodeType === NODE_TYPES.DOCUMENT_TYPE_NODE;
    const others = this._children().filter((n) => !(replacing && n === child));
    const doctypeAfter = () => {
      for (let n = child?._next; n; n = n._next) if (isDoctype(n)) return true;
      return false;
    };
    const elementBefore = () => {
      for (let n = child?._prev; n; n = n._prev) if (isElement(n)) return true;
      return false;
    };
    let elements = 0;
    if (type === NODE_TYPES.DOCUMENT_FRAGMENT_NODE) {
      const children = node._children();
      elements = children.filter(isElement).length;
      if (elements > 1 || children.some((n) => n.nodeType === NODE_TYPES.TEXT_NODE)) {
        throw hierarchy('A document has one element child and no text.');
      }
    } else if (type === NODE_TYPES.ELEMENT_NODE) elements = 1;
    if (elements === 1 && (others.some(isElement) || (!replacing && child && isDoctype(child)) || doctypeAfter())) {
      throw hierarchy('A document has one element child, after its doctype.');
    }
    if (
      type === NODE_TYPES.DOCUMENT_TYPE_NODE &&
      (others.some(isDoctype) || elementBefore() || (!replacing && !child && others.some(isElement)))
    ) {
      throw hierarchy('A document has one doctype, before its element.');
    }
  }

  // Inserts a node (the children of a fragment) before a child (at the end when null), adopting it.
  _insert(node, before) {
    if (node.nodeType === NODE_TYPES.DOCUMENT_FRAGMENT_NODE) {
      for (const child of node._children()) {
        node._removeChild(child);
        this._insert(child, before);
      }
      return;
    }
    if (node._parent) node._parent._removeChild(node);
    const document = this._documentForChildren();
    if (node._owner !== document) node._adopt(document);
    node._parent = this;
    node._next = before;
    node._prev = before ? before._prev : this._last;
    if (node._prev) node._prev._next = node;
    else this._first = node;
    if (before) before._prev = node;
    else this._last = node;
    this._childCount += 1;
    if (this._childItems) this._childItems._items = null;
    if (this._elementItems) this._elementItems._items = null;
    this._childrenChanged();
  }

  _removeChild(node) {
    // (The live iterators of the document: ./iterator.js.)
    const document = node._owner;
    if (document && document._iterators.size) for (const iterator of document._iterators) iterator._preRemove(node);
    if (node._prev) node._prev._next = node._next;
    else this._first = node._next;
    if (node._next) node._next._prev = node._prev;
    else this._last = node._prev;
    node._parent = null;
    node._prev = null;
    node._next = null;
    this._childCount -= 1;
    if (this._childItems) this._childItems._items = null;
    if (this._elementItems) this._elementItems._items = null;
    this._childrenChanged();
  }

  _childrenChanged() {}

  // Moves the node and its descendants to a document.
  _adopt(document) {
    this._owner = document;
    if (this.nodeType === NODE_TYPES.ELEMENT_NODE) for (const attr of this._attrs) attr._owner = document;
    for (let child = this._first; child; child = child._next) child._adopt(document);
  }

  cloneNode(deep = false) {
    return this._clone(this._owner, deep);
  }

  _clone(document, deep) {
    const copy = this._cloneSelf(document);
    if (deep)
      for (let child = this._first; child; child = child._next) copy._insert(child._clone(document, true), null);
    return copy;
  }

  // ChildNode's remove(): out of its parent, if any.
  remove() {
    if (this._parent) this._parent._removeChild(this);
  }

  // ParentNode's and ChildNode's insertions (of nodes and texts).
  _nodesOf(nodes) {
    const document = this._documentForChildren();
    const list = nodes.map((node) => (node instanceof Node ? node : document.createTextNode(String(node))));
    if (list.length === 1) return list[0];
    const fragment = document.createDocumentFragment();
    for (const node of list) fragment._insert(node, null);
    return fragment;
  }

  append(...nodes) {
    this.insertBefore(this._nodesOf(nodes), null);
  }

  prepend(...nodes) {
    this.insertBefore(this._nodesOf(nodes), this._first);
  }

  replaceChildren(...nodes) {
    const node = this._nodesOf(nodes);
    while (this._first) this._removeChild(this._first);
    this.insertBefore(node, null);
  }

  // (ChildNode's: the siblings they insert by are found before the nodes given move, among those not given.)
  before(...nodes) {
    const parent = this._parent;
    if (!parent) return;
    let previous = this._prev;
    while (previous && nodes.includes(previous)) previous = previous._prev;
    const node = this._nodesOf(nodes);
    parent.insertBefore(node, previous ? previous._next : parent._first);
  }

  after(...nodes) {
    const parent = this._parent;
    if (!parent) return;
    let next = this._next;
    while (next && nodes.includes(next)) next = next._next;
    parent.insertBefore(this._nodesOf(nodes), next);
  }

  replaceWith(...nodes) {
    const parent = this._parent;
    if (!parent) return;
    let next = this._next;
    while (next && nodes.includes(next)) next = next._next;
    const node = this._nodesOf(nodes);
    if (this._parent === parent) parent.replaceChild(node, this);
    else parent.insertBefore(node, next);
  }

  // ParentNode's element children.
  get children() {
    if (!this._elementList) {
      this._elementList = new HTMLCollection(() =>
        this._children().filter((n) => n.nodeType === NODE_TYPES.ELEMENT_NODE)
      );
      this._elementItems = this._elementList._target;
    }
    return this._elementList;
  }

  get firstElementChild() {
    for (let child = this._first; child; child = child._next)
      if (child.nodeType === NODE_TYPES.ELEMENT_NODE) return child;
    return null;
  }

  get lastElementChild() {
    for (let child = this._last; child; child = child._prev)
      if (child.nodeType === NODE_TYPES.ELEMENT_NODE) return child;
    return null;
  }

  get childElementCount() {
    let count = 0;
    for (let child = this._first; child; child = child._next)
      if (child.nodeType === NODE_TYPES.ELEMENT_NODE) count += 1;
    return count;
  }

  get previousElementSibling() {
    for (let node = this._prev; node; node = node._prev) if (node.nodeType === NODE_TYPES.ELEMENT_NODE) return node;
    return null;
  }

  get nextElementSibling() {
    for (let node = this._next; node; node = node._next) if (node.nodeType === NODE_TYPES.ELEMENT_NODE) return node;
    return null;
  }

  // The descendant elements in tree order that pass a test.
  _descendants(test) {
    const found = [];
    const walk = (node) => {
      for (let child = node._first; child; child = child._next) {
        if (child.nodeType === NODE_TYPES.ELEMENT_NODE) {
          if (test(child)) found.push(child);
          walk(child);
        }
      }
    };
    walk(this);
    return found;
  }

  // getElementsByTagName: by qualified name, ASCII case-insensitively for HTML elements of HTML documents ('*': all).
  getElementsByTagName(name) {
    const document = this._documentForChildren();
    const lower = asciiLowercase(name);
    return new HTMLCollection(
      () =>
        this._descendants((element) => {
          if (name === '*') return true;
          if (element.namespaceURI === NAMESPACES.HTML && document._isHTML) return element._qualifiedName === lower;
          return element._qualifiedName === name;
        }),
      false
    );
  }

  getElementsByTagNameNS(namespace, localName) {
    const ns = namespace === '' ? null : namespace;
    return new HTMLCollection(
      () =>
        this._descendants(
          (element) =>
            (ns === '*' || element.namespaceURI === ns) && (localName === '*' || element.localName === localName)
        ),
      false
    );
  }

  getElementsByClassName(names) {
    const wanted = String(names)
      .split(/[\t\n\f\r ]+/)
      .filter(Boolean);
    return new HTMLCollection(
      () =>
        this._descendants((element) => {
          const classes = (element.getAttribute('class') || '').split(/[\t\n\f\r ]+/);
          return wanted.length > 0 && wanted.every((name) => classes.includes(name));
        }),
      false
    );
  }

  normalize() {
    for (let child = this._first; child;) {
      const next = child._next;
      if (child.nodeType === NODE_TYPES.TEXT_NODE) {
        if (child._data === '') this._removeChild(child);
        else {
          while (child._next && child._next.nodeType === NODE_TYPES.TEXT_NODE) {
            child._data += child._next._data;
            this._removeChild(child._next);
          }
        }
      } else child.normalize();
      child = child._parent === this ? child._next : next;
    }
  }
}
Object.assign(Node, NODE_TYPES);
Object.assign(Node.prototype, NODE_TYPES);
const DOCUMENT_POSITIONS = {
  DOCUMENT_POSITION_DISCONNECTED: 1,
  DOCUMENT_POSITION_PRECEDING: 2,
  DOCUMENT_POSITION_FOLLOWING: 4,
  DOCUMENT_POSITION_CONTAINS: 8,
  DOCUMENT_POSITION_CONTAINED_BY: 16,
  DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC: 32,
};
Object.assign(Node, DOCUMENT_POSITIONS);
Object.assign(Node.prototype, DOCUMENT_POSITIONS);

class Attr extends Node {
  constructor(ownerDocument, namespaceURI, prefix, localName, value) {
    super(ownerDocument);
    this._namespace = namespaceURI;
    this._prefix = prefix;
    this._localName = localName;
    this._value = value;
    this._element = null;
  }

  get nodeType() {
    return NODE_TYPES.ATTRIBUTE_NODE;
  }

  get namespaceURI() {
    return this._namespace;
  }

  get prefix() {
    return this._prefix;
  }

  get localName() {
    return this._localName;
  }

  get name() {
    return this._prefix === null ? this._localName : `${this._prefix}:${this._localName}`;
  }

  get nodeName() {
    return this.name;
  }

  get value() {
    return this._value;
  }

  set value(value) {
    this._value = String(value);
  }

  get nodeValue() {
    return this._value;
  }

  set nodeValue(value) {
    this._value = String(value ?? '');
  }

  get textContent() {
    return this._value;
  }

  set textContent(value) {
    this._value = String(value ?? '');
  }

  get ownerElement() {
    return this._element;
  }

  get specified() {
    return true;
  }

  _cloneSelf(document) {
    return new Attr(document, this._namespace, this._prefix, this._localName, this._value);
  }
}

// The attributes of an element, live: kept up to date on each change of them, as own properties (lists of attributes
// are short and change little, and are read for every element by a sanitizer: no Proxy in the way).
class NamedNodeMap {
  constructor(element) {
    Object.defineProperty(this, '_element', { value: element });
    Object.defineProperty(this, '_length', { value: 0, writable: true });
    this.invalidate();
  }

  invalidate() {
    const attrs = this._element._attrs;
    for (let i = 0; i < attrs.length; i += 1) this[i] = attrs[i];
    for (let i = attrs.length; i < this._length; i += 1) delete this[i];
    this._length = attrs.length;
    // Named properties (not enumerable): each attribute by its qualified name, the first of a name, but names of
    // its own members and, on HTML elements of HTML documents, names with uppercase letters (as WebIDL has them).
    for (const name of this._names ?? []) delete this[name];
    const element = this._element;
    const html = element._namespace === NAMESPACES.HTML && element._owner._isHTML;
    const names = [];
    for (const attr of attrs) {
      const { name } = attr;
      if (names.includes(name) || name in NamedNodeMap.prototype || INDEX.test(name) || (html && /[A-Z]/.test(name))) {
        continue;
      }
      names.push(name);
      Object.defineProperty(this, name, { value: attr, enumerable: false, configurable: true });
    }
    Object.defineProperty(this, '_names', { value: names, configurable: true, writable: true });
  }

  get length() {
    return this._length;
  }

  item(index) {
    return this._element._attrs[index] ?? null;
  }

  [Symbol.iterator]() {
    return this._element._attrs.slice()[Symbol.iterator]();
  }

  getNamedItem(name) {
    return this._element.getAttributeNode(name);
  }

  getNamedItemNS(namespace, localName) {
    return this._element.getAttributeNodeNS(namespace, localName);
  }

  setNamedItem(attr) {
    return this._element.setAttributeNode(attr);
  }

  setNamedItemNS(attr) {
    return this._element.setAttributeNode(attr);
  }

  removeNamedItem(name) {
    const attr = this._element.getAttributeNode(name);
    if (!attr) throw new DOMException(`No attribute ${name}.`, 'NotFoundError');
    this._element._removeAttr(attr);
    return attr;
  }

  removeNamedItemNS(namespace, localName) {
    const attr = this._element.getAttributeNodeNS(namespace, localName);
    if (!attr) throw new DOMException(`No attribute ${localName}.`, 'NotFoundError');
    this._element._removeAttr(attr);
    return attr;
  }
}

class Element extends Node {
  constructor(ownerDocument, namespaceURI, prefix, localName) {
    super(ownerDocument);
    this._namespace = namespaceURI;
    this._prefix = prefix;
    this._localName = localName;
    this._qualifiedName = prefix === null ? localName : `${prefix}:${localName}`;
    this._attrs = [];
    this._attrMap = null;
  }

  get nodeType() {
    return NODE_TYPES.ELEMENT_NODE;
  }

  get namespaceURI() {
    return this._namespace;
  }

  get prefix() {
    return this._prefix;
  }

  get localName() {
    return this._localName;
  }

  // The qualified name, in upper case for HTML elements of HTML documents.
  get tagName() {
    if (this._namespace === NAMESPACES.HTML && this._owner._isHTML) {
      this._upperName ??= asciiUppercase(this._qualifiedName);
      return this._upperName;
    }
    return this._qualifiedName;
  }

  get nodeName() {
    return this.tagName;
  }

  get attributes() {
    this._attrMap ??= new NamedNodeMap(this);
    return this._attrMap;
  }

  _attrsChanged() {
    if (this._attrMap) this._attrMap.invalidate();
  }

  // The name an attribute is looked for by: in lower case on HTML elements of HTML documents.
  _attrName(name) {
    const text = String(name);
    return this._namespace === NAMESPACES.HTML && this._owner._isHTML ? asciiLowercase(text) : text;
  }

  getAttributeNode(name) {
    const qualified = this._attrName(name);
    return this._attrs.find((attr) => attr.name === qualified) ?? null;
  }

  getAttributeNodeNS(namespace, localName) {
    const ns = namespace === '' || namespace === undefined ? null : namespace;
    return this._attrs.find((attr) => attr._namespace === ns && attr._localName === localName) ?? null;
  }

  getAttribute(name) {
    const attr = this.getAttributeNode(name);
    return attr ? attr._value : null;
  }

  getAttributeNS(namespace, localName) {
    const attr = this.getAttributeNodeNS(namespace, localName);
    return attr ? attr._value : null;
  }

  hasAttribute(name) {
    return this.getAttributeNode(name) !== null;
  }

  hasAttributeNS(namespace, localName) {
    return this.getAttributeNodeNS(namespace, localName) !== null;
  }

  hasAttributes() {
    return this._attrs.length > 0;
  }

  getAttributeNames() {
    return this._attrs.map((attr) => attr.name);
  }

  setAttribute(name, value) {
    validateAttributeName(String(name));
    const qualified = this._attrName(name);
    const attr = this._attrs.find((a) => a.name === qualified);
    if (attr) attr._value = String(value);
    else this._appendAttr(new Attr(this._owner, null, null, qualified, String(value)));
  }

  setAttributeNS(namespace, qualifiedName, value) {
    const { namespace: ns, prefix, localName } = validateAndExtract(namespace, String(qualifiedName), true);
    const attr = this.getAttributeNodeNS(ns, localName);
    if (attr) attr._value = String(value);
    else this._appendAttr(new Attr(this._owner, ns, prefix, localName, String(value)));
  }

  setAttributeNode(attr) {
    if (attr._element && attr._element !== this) {
      throw new DOMException('The attribute is in use by another element.', 'InUseAttributeError');
    }
    const old = this.getAttributeNodeNS(attr._namespace, attr._localName);
    if (old === attr) return attr;
    if (old) {
      this._attrs[this._attrs.indexOf(old)] = attr;
      old._element = null;
      attr._element = this;
      if (attr._owner !== this._owner) attr._owner = this._owner;
      this._attrsChanged();
    } else this._appendAttr(attr);
    return old;
  }

  setAttributeNodeNS(attr) {
    return this.setAttributeNode(attr);
  }

  _appendAttr(attr) {
    attr._element = this;
    if (attr._owner !== this._owner) attr._owner = this._owner;
    this._attrs.push(attr);
    this._attrsChanged();
  }

  _removeAttr(attr) {
    const index = this._attrs.indexOf(attr);
    if (index !== -1) {
      this._attrs.splice(index, 1);
      attr._element = null;
      this._attrsChanged();
    }
  }

  removeAttribute(name) {
    const attr = this.getAttributeNode(name);
    if (attr) this._removeAttr(attr);
  }

  removeAttributeNS(namespace, localName) {
    const attr = this.getAttributeNodeNS(namespace, localName);
    if (attr) this._removeAttr(attr);
  }

  removeAttributeNode(attr) {
    if (!this._attrs.includes(attr)) throw new DOMException('The attribute is not of this element.', 'NotFoundError');
    this._removeAttr(attr);
    return attr;
  }

  toggleAttribute(name, force) {
    validateAttributeName(String(name));
    const attr = this.getAttributeNode(name);
    if (!attr) {
      if (force === undefined || force === true) {
        this.setAttribute(name, '');
        return true;
      }
      return false;
    }
    if (force === undefined || force === false) {
      this._removeAttr(attr);
      return false;
    }
    return true;
  }

  get id() {
    return this.getAttribute('id') ?? '';
  }

  set id(value) {
    this.setAttribute('id', value);
  }

  get className() {
    return this.getAttribute('class') ?? '';
  }

  set className(value) {
    this.setAttribute('class', value);
  }

  get classList() {
    this._classList ??= new DOMTokenList(this, 'class');
    return this._classList;
  }

  set classList(value) {
    this.classList.value = value;
  }

  get innerHTML() {
    return this._owner._serialize(this._childrenHolder(), false);
  }

  set innerHTML(html) {
    const holder = this._childrenHolder();
    const fragment = this._owner._parseFragment(this, html === null ? '' : String(html));
    while (holder._first) holder._removeChild(holder._first);
    holder._insert(fragment, null);
  }

  get outerHTML() {
    return this._owner._serialize(this, true);
  }

  set outerHTML(html) {
    const parent = this._parent;
    if (!parent) return;
    if (parent.nodeType === NODE_TYPES.DOCUMENT_NODE) {
      throw new DOMException('An element of a document cannot be replaced.', 'NoModificationAllowedError');
    }
    const context = parent.nodeType === NODE_TYPES.DOCUMENT_FRAGMENT_NODE ? this._owner.createElement('body') : parent;
    const fragment = this._owner._parseFragment(context, html === null ? '' : String(html));
    parent.insertBefore(fragment, this);
    parent._removeChild(this);
  }

  // Where the children of innerHTML are: the element (the content of a template).
  _childrenHolder() {
    return this;
  }

  insertAdjacentHTML(position, html) {
    const where = asciiLowercase(String(position));
    const context = where === 'beforebegin' || where === 'afterend' ? this._parent : this;
    if (!context) throw new DOMException('The element has no parent.', 'NoModificationAllowedError');
    const fragment = this._owner._parseFragment(
      context.nodeType === NODE_TYPES.ELEMENT_NODE ? context : this._owner.createElement('body'),
      String(html)
    );
    if (where === 'beforebegin') this._parent.insertBefore(fragment, this);
    else if (where === 'afterbegin') this.insertBefore(fragment, this._first);
    else if (where === 'beforeend') this.insertBefore(fragment, null);
    else if (where === 'afterend') this._parent.insertBefore(fragment, this._next);
    else throw new DOMException(`Invalid position ${position}.`, 'SyntaxError');
  }

  // The DOM's "insert adjacent": a node before this, as its first or last child, or after it (null where there is no
  // parent to put it in).
  _insertAdjacent(position, node) {
    switch (asciiLowercase(String(position))) {
      case 'beforebegin':
        return this._parent ? this._parent.insertBefore(node, this) : null;
      case 'afterbegin':
        return this.insertBefore(node, this._first);
      case 'beforeend':
        return this.insertBefore(node, null);
      case 'afterend':
        return this._parent ? this._parent.insertBefore(node, this._next) : null;
      default:
        throw new DOMException(`Invalid position ${position}.`, 'SyntaxError');
    }
  }

  insertAdjacentElement(position, element) {
    if (!(element instanceof Element))
      throw new TypeError("insertAdjacentElement's second argument is not an Element.");
    return this._insertAdjacent(position, element);
  }

  insertAdjacentText(position, data) {
    this._insertAdjacent(position, this._owner.createTextNode(data));
  }

  matches(selector) {
    return this._owner._matches(this, selector);
  }

  webkitMatchesSelector(selector) {
    return this.matches(selector);
  }

  // (:scope is this element, for every ancestor tried.)
  closest(selector) {
    return this._owner._closest(this, selector);
  }

  querySelector(selector) {
    return this._owner._select(this, selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const found = this._owner._select(this, selector);
    return staticNodeList(found);
  }

  _cloneSelf(document) {
    const copy = document._createElement(this._namespace, this._prefix, this._localName);
    for (const attr of this._attrs) copy._appendAttr(attr._cloneSelf(document));
    return copy;
  }
}

// A set of tokens of an attribute (classList): live, the attribute written back on each change.
// The tokens of an attribute (classList, relList), live: read from the attribute each time it is read, list[i] too
// (LiveList's Proxy), and written back by the DOM standard's update steps.
const tokensOf = (element, attribute) => {
  const value = element.getAttribute(attribute) ?? '';
  return [...new Set(value.split(/[\t\n\f\r ]+/).filter(Boolean))];
};

class DOMTokenList extends LiveList {
  // (supported: the tokens supports() knows, lowercase; none: it throws, as for classList.)
  constructor(element, attribute, supported = null) {
    super(() => tokensOf(element, attribute), false);
    Object.defineProperty(this._target, '_element', { value: element });
    Object.defineProperty(this._target, '_attribute', { value: attribute });
    Object.defineProperty(this._target, '_supported', { value: supported });
  }

  _tokens() {
    return this._sync();
  }

  // (An attribute that is not there and no tokens: left out.)
  _write(tokens) {
    if (tokens.length === 0 && !this._element.hasAttribute(this._attribute)) return;
    this._element.setAttribute(this._attribute, tokens.join(' '));
  }

  static _check(token) {
    const text = String(token);
    if (text === '') throw new DOMException('A token cannot be empty.', 'SyntaxError');
    if (/[\t\n\f\r ]/.test(text)) throw new DOMException('A token cannot have spaces.', 'InvalidCharacterError');
    return text;
  }

  get value() {
    return this._element.getAttribute(this._attribute) ?? '';
  }

  set value(value) {
    this._element.setAttribute(this._attribute, value);
  }

  contains(token) {
    return this._tokens().includes(String(token));
  }

  add(...tokens) {
    const names = tokens.map(DOMTokenList._check);
    const list = this._tokens();
    for (const token of names) if (!list.includes(token)) list.push(token);
    this._write(list);
  }

  remove(...tokens) {
    const removed = new Set(tokens.map(DOMTokenList._check));
    this._write(this._tokens().filter((token) => !removed.has(token)));
  }

  toggle(token, force) {
    const name = DOMTokenList._check(token);
    const has = this.contains(name);
    if (has && force !== true) {
      this.remove(name);
      return false;
    }
    if (!has && force !== false) {
      this.add(name);
      return true;
    }
    return has;
  }

  replace(token, newToken) {
    // (Empty ones first, of both: a SyntaxError before an InvalidCharacterError.)
    const [from, to] = [String(token), String(newToken)];
    if (from === '' || to === '') throw new DOMException('A token cannot be empty.', 'SyntaxError');
    DOMTokenList._check(from);
    DOMTokenList._check(to);
    const list = this._tokens();
    const index = list.indexOf(from);
    if (index === -1) return false;
    list.splice(index, 1, to);
    this._write([...new Set(list)]);
    return true;
  }

  supports(token) {
    if (!this._supported) {
      throw new TypeError(`The "${this._attribute}" attribute has no supported tokens.`);
    }
    return this._supported.includes(asciiLowercase(String(token)));
  }

  toString() {
    return this.value;
  }
}
iterable(DOMTokenList);

// The data-* attributes of an element as properties (element.dataset, the HTML standard's DOMStringMap):
// data-foo-bar is dataset.fooBar. Its properties are those attributes, read and written as they are, and come before
// those of its prototype ([LegacyOverrideBuiltIns]).
class DOMStringMap {}

// The name of the property of a data-* attribute (null: not one): a hyphen and a lowercase letter, the letter in
// uppercase.
function datasetName(attr) {
  const name = attr._localName;
  if (attr._namespace !== null || !name.startsWith('data-') || /[A-Z]/.test(name)) return null;
  return name.slice(5).replace(/-([a-z])/g, (hyphen, letter) => letter.toUpperCase());
}

// The attribute of a property: a hyphen before each uppercase letter, the letter in lowercase (a name with a hyphen
// and a lowercase letter has none: SyntaxError when set).
function datasetAttribute(name, setting) {
  if (setting && /-[a-z]/.test(name)) {
    throw new DOMException(`"${name}" is not a name of the dataset (a hyphen and a lowercase letter).`, 'SyntaxError');
  }
  return `data-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

const datasetAttr = (element, key) =>
  typeof key === 'string' ? (element._attrs.find((attr) => datasetName(attr) === key) ?? null) : null;

const DATASET_HANDLER = {
  get(target, key, receiver) {
    const attr = datasetAttr(target._element, key);
    return attr ? attr._value : Reflect.get(target, key, receiver);
  },
  has(target, key) {
    return datasetAttr(target._element, key) !== null || Reflect.has(target, key);
  },
  set(target, key, value) {
    if (typeof key !== 'string') return Reflect.set(target, key, value);
    const name = datasetAttribute(key, true);
    validateAttributeName(name);
    target._element.setAttribute(name, String(value));
    return true;
  },
  defineProperty(target, key, descriptor) {
    if (typeof key !== 'string' || !('value' in descriptor)) return false;
    return DATASET_HANDLER.set(target, key, descriptor.value);
  },
  deleteProperty(target, key) {
    if (typeof key !== 'string') return Reflect.deleteProperty(target, key);
    target._element.removeAttribute(datasetAttribute(key, false));
    return true;
  },
  ownKeys(target) {
    const names = [];
    for (const attr of target._element._attrs) {
      const name = datasetName(attr);
      if (name !== null && !names.includes(name)) names.push(name);
    }
    return names;
  },
  getOwnPropertyDescriptor(target, key) {
    const attr = datasetAttr(target._element, key);
    return attr ? { value: attr._value, writable: true, enumerable: true, configurable: true } : undefined;
  },
};

// dataset, on HTML, SVG and MathML elements.
function datasetProperty(Class) {
  const key = Symbol('dataset');
  Object.defineProperty(Class.prototype, 'dataset', {
    get() {
      if (!this[key]) {
        const target = Object.create(DOMStringMap.prototype);
        // (Configurable: not among the map's keys, which a Proxy may only leave out so.)
        Object.defineProperty(target, '_element', { value: this, configurable: true });
        this[key] = new Proxy(target, DATASET_HANDLER);
      }
      return this[key];
    },
    configurable: true,
    enumerable: true,
  });
}

// A property of a token list of an attribute (relList), assigned through its value as browsers do ([PutForwards]).
function tokenListProperty(Class, name, attribute, supported) {
  const key = Symbol(name);
  Object.defineProperty(Class.prototype, name, {
    get() {
      this[key] ??= new DOMTokenList(this, attribute, supported);
      return this[key];
    },
    set(value) {
      this[name].value = value;
    },
    configurable: true,
  });
}

// The values of rel this DOM knows: those browsers support on links (a, area, form) and on <link>.
const LINK_TYPES = ['noreferrer', 'noopener', 'opener'];
const LINK_ELEMENT_TYPES = [
  'alternate',
  'dns-prefetch',
  'expect',
  'icon',
  'manifest',
  'modulepreload',
  'next',
  'preconnect',
  'prefetch',
  'preload',
  'search',
  'stylesheet',
];

class HTMLElement extends Element {}
datasetProperty(HTMLElement);

// A URL attribute as its property reads it: absolute as it is, '' when missing (no page, so no base for others).
function urlProperty(Class, name) {
  Object.defineProperty(Class.prototype, name, {
    get() {
      const value = this.getAttribute(name);
      if (value === null) return '';
      try {
        return new URL(value.trim()).href;
      } catch {
        return value;
      }
    },
    set(value) {
      this.setAttribute(name, value);
    },
    configurable: true,
  });
}

class HTMLAnchorElement extends HTMLElement {}
urlProperty(HTMLAnchorElement, 'href');
tokenListProperty(HTMLAnchorElement, 'relList', 'rel', LINK_TYPES);

class HTMLAreaElement extends HTMLElement {}
urlProperty(HTMLAreaElement, 'href');
tokenListProperty(HTMLAreaElement, 'relList', 'rel', LINK_TYPES);

class HTMLImageElement extends HTMLElement {}
urlProperty(HTMLImageElement, 'src');

class HTMLUnknownElement extends HTMLElement {}

// <template>: its children are in its content, a fragment of the inert document of its document.
class HTMLTemplateElement extends HTMLElement {
  get content() {
    if (!this._content) {
      this._content = new DocumentFragment(this._owner._templateDocument());
    }
    return this._content;
  }

  _childrenHolder() {
    return this.content;
  }

  _adopt(document) {
    super._adopt(document);
    if (this._content) this._content._adopt(document._templateDocument());
  }

  _clone(document, deep) {
    const copy = super._clone(document, deep);
    if (deep && this._content) {
      for (let child = this._content._first; child; child = child._next) {
        copy.content._insert(child._clone(copy.content._owner, true), null);
      }
    }
    return copy;
  }
}

class HTMLFormElement extends HTMLElement {}
tokenListProperty(HTMLFormElement, 'relList', 'rel', LINK_TYPES);

class SVGElement extends Element {}
datasetProperty(SVGElement);

class MathMLElement extends Element {}
datasetProperty(MathMLElement);

class CharacterData extends Node {
  // (ownerDocument, data) by this DOM; (data) by new Text() and new Comment(), of the window's document.
  constructor(ownerDocument, data) {
    const internal = isDocument(ownerDocument);
    super(internal ? ownerDocument : defaultDocument());
    if (internal) this._data = data;
    else this._data = arguments.length === 0 || ownerDocument === undefined ? '' : String(ownerDocument);
  }

  get data() {
    return this._data;
  }

  set data(value) {
    this._data = value === null ? '' : String(value);
  }

  get nodeValue() {
    return this._data;
  }

  set nodeValue(value) {
    this._data = value === null || value === undefined ? '' : String(value);
  }

  get textContent() {
    return this._data;
  }

  set textContent(value) {
    this._data = value === null || value === undefined ? '' : String(value);
  }

  get length() {
    return this._data.length;
  }

  appendData(data) {
    required(arguments.length, 1, 'appendData');
    this._data += String(data);
  }

  // (The DOM's "substring data" and "replace data": offsets and counts as WebIDL's unsigned long, IndexSizeError
  // for an offset past the end, the count cut at the end.)
  substringData(offset, count) {
    required(arguments.length, 2, 'substringData');
    const start = this._offset(offset);
    return this._data.substr(start, toUint32(count));
  }

  insertData(offset, data) {
    required(arguments.length, 2, 'insertData');
    this.replaceData(offset, 0, data);
  }

  deleteData(offset, count) {
    required(arguments.length, 2, 'deleteData');
    this.replaceData(offset, count, '');
  }

  replaceData(offset, count, data) {
    required(arguments.length, 3, 'replaceData');
    const start = this._offset(offset);
    const end = Math.min(start + toUint32(count), this._data.length);
    this._data = this._data.slice(0, start) + String(data) + this._data.slice(end);
  }

  _offset(offset) {
    const start = toUint32(offset);
    if (start > this._data.length) throw new DOMException('The offset is past the end of the data.', 'IndexSizeError');
    return start;
  }

  _cloneSelf(document) {
    return new this.constructor(document, this._data);
  }
}

class Text extends CharacterData {
  get nodeType() {
    return NODE_TYPES.TEXT_NODE;
  }

  get nodeName() {
    return '#text';
  }

  get wholeText() {
    let start = this;
    while (start._prev && start._prev.nodeType === NODE_TYPES.TEXT_NODE) start = start._prev;
    let text = '';
    for (let node = start; node && node.nodeType === NODE_TYPES.TEXT_NODE; node = node._next) text += node._data;
    return text;
  }

  splitText(offset) {
    const start = this._offset(offset);
    const rest = new Text(this._owner, this._data.slice(start));
    this._data = this._data.slice(0, start);
    if (this._parent) this._parent._insert(rest, this._next);
    return rest;
  }
}

class CDATASection extends Text {
  get nodeType() {
    return NODE_TYPES.CDATA_SECTION_NODE;
  }

  get nodeName() {
    return '#cdata-section';
  }
}

class Comment extends CharacterData {
  get nodeType() {
    return NODE_TYPES.COMMENT_NODE;
  }

  get nodeName() {
    return '#comment';
  }
}

class ProcessingInstruction extends CharacterData {
  constructor(ownerDocument, target, data) {
    super(ownerDocument, data);
    this._target = target;
  }

  get nodeType() {
    return NODE_TYPES.PROCESSING_INSTRUCTION_NODE;
  }

  get target() {
    return this._target;
  }

  get nodeName() {
    return this._target;
  }

  _cloneSelf(document) {
    return new ProcessingInstruction(document, this._target, this._data);
  }
}

class DocumentType extends Node {
  constructor(ownerDocument, name, publicId, systemId) {
    super(ownerDocument);
    this._name = name;
    this._publicId = publicId;
    this._systemId = systemId;
  }

  get nodeType() {
    return NODE_TYPES.DOCUMENT_TYPE_NODE;
  }

  get nodeName() {
    return this._name;
  }

  get name() {
    return this._name;
  }

  get publicId() {
    return this._publicId;
  }

  get systemId() {
    return this._systemId;
  }

  get textContent() {
    return null;
  }

  set textContent(value) {}

  _cloneSelf(document) {
    return new DocumentType(document, this._name, this._publicId, this._systemId);
  }
}

class DocumentFragment extends Node {
  // (new DocumentFragment(): of the window's document.)
  constructor(ownerDocument) {
    super(isDocument(ownerDocument) ? ownerDocument : defaultDocument());
  }

  // (The id attribute in no namespace; never ''.)
  getElementById(id) {
    const wanted = String(id);
    if (wanted === '') return null;
    return this._descendants((element) => element.getAttributeNS(null, 'id') === wanted)[0] ?? null;
  }

  get nodeType() {
    return NODE_TYPES.DOCUMENT_FRAGMENT_NODE;
  }

  get nodeName() {
    return '#document-fragment';
  }

  querySelector(selector) {
    return this._owner._select(this, selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const found = this._owner._select(this, selector);
    return staticNodeList(found);
  }

  _cloneSelf(document) {
    return new DocumentFragment(document);
  }
}

export {
  NAMESPACES,
  NODE_TYPES,
  validateName,
  validateElementName,
  validateAttributeName,
  validateDoctypeName,
  validateAndExtract,
  asciiLowercase,
  LiveList,
  NodeList,
  HTMLCollection,
  Node,
  Attr,
  NamedNodeMap,
  Element,
  DOMTokenList,
  DOMStringMap,
  setDocumentFactory,
  tokenListProperty,
  LINK_ELEMENT_TYPES,
  HTMLElement,
  HTMLAnchorElement,
  HTMLAreaElement,
  HTMLImageElement,
  HTMLUnknownElement,
  HTMLTemplateElement,
  HTMLFormElement,
  SVGElement,
  MathMLElement,
  CharacterData,
  Text,
  CDATASection,
  Comment,
  ProcessingInstruction,
  DocumentType,
  DocumentFragment,
};
