// Documents of the DOM of @xufa/html: HTML documents (parsed by parse5 with scripting disabled, as DOMParser parses in
// browsers), XML documents (./xml.js), their DOMImplementation, and DOMParser.
import { parse, parseFragment, serialize, serializeOuter } from '../parse5/index.js';
import { adapterFor } from './adapter.js';
import { DOMException } from './exception.js';
import { NodeFilter, NodeIterator, TreeWalker } from './iterator.js';
import {
  NAMESPACES,
  NODE_TYPES,
  validateName,
  validateElementName,
  validateAttributeName,
  validateDoctypeName,
  validateAndExtract,
  asciiLowercase,
  Node,
  Attr,
  Element,
  HTMLFormElement,
  SVGElement,
  MathMLElement,
  Text,
  CDATASection,
  Comment,
  ProcessingInstruction,
  DocumentType,
  DocumentFragment,
  setDocumentFactory,
} from './nodes.js';
import { htmlClassOf } from './html-elements.js';
import { closest, matches, select } from './select.js';
import { DOCUMENT_NAMES, FORM_NAMES } from './clobber-names.js';
import { parseXml, parseXmlFragment, serializeXml } from './xml.js';

class Document extends Node {
  // { type: 'html' or 'xml', contentType }. new Document() is an XML document, as the DOM standard has it.
  constructor({ type = 'xml', contentType = type === 'html' ? 'text/html' : 'application/xml' } = {}) {
    super(null);
    this._owner = this;
    this._isHTML = type === 'html';
    this._contentType = contentType;
    this._mode = 'no-quirks';
    this._iterators = new Set();
    this._template = null;
    this._implementation = null;
    // (The window of a document: createWindow()'s. Documents made by DOMParser or createDocument() have none.)
    this._defaultView = null;
  }

  get nodeType() {
    return NODE_TYPES.DOCUMENT_NODE;
  }

  get nodeName() {
    return '#document';
  }

  get textContent() {
    return null;
  }

  set textContent(value) {}

  get documentElement() {
    return this.firstElementChild;
  }

  get doctype() {
    for (let child = this._first; child; child = child._next) {
      if (child.nodeType === NODE_TYPES.DOCUMENT_TYPE_NODE) return child;
    }
    return null;
  }

  // (The first element child of <html> by a name, in the HTML namespace.)
  _rootChild(names) {
    const root = this.documentElement;
    if (!root || root._namespace !== NAMESPACES.HTML || root._localName !== 'html') return null;
    for (let child = root._first; child; child = child._next) {
      if (child.nodeType === NODE_TYPES.ELEMENT_NODE && child._namespace === NAMESPACES.HTML) {
        if (names.includes(child._localName)) return child;
      }
    }
    return null;
  }

  get head() {
    return this._rootChild(['head']);
  }

  get body() {
    return this._rootChild(['body', 'frameset']);
  }

  get title() {
    const title = this._descendants((e) => e._localName === 'title' && e._namespace === NAMESPACES.HTML)[0];
    return title ? title.textContent.replace(/[\t\n\f\r ]+/g, ' ').trim() : '';
  }

  set title(value) {
    let title = this._descendants((e) => e._localName === 'title' && e._namespace === NAMESPACES.HTML)[0];
    if (!title) {
      const { head } = this;
      if (!head) return;
      title = this.createElement('title');
      head._insert(title, null);
    }
    title.textContent = value;
  }

  get compatMode() {
    return this._mode === 'quirks' ? 'BackCompat' : 'CSS1Compat';
  }

  get contentType() {
    return this._contentType;
  }

  get characterSet() {
    return 'UTF-8';
  }

  get charset() {
    return 'UTF-8';
  }

  get inputEncoding() {
    return 'UTF-8';
  }

  // (No browsing context: no location.)
  get location() {
    return null;
  }

  get URL() {
    return 'about:blank';
  }

  get documentURI() {
    return 'about:blank';
  }

  get defaultView() {
    return this._defaultView;
  }

  get currentScript() {
    return null;
  }

  get readyState() {
    return 'complete';
  }

  get implementation() {
    this._implementation ??= new DOMImplementation(this);
    return this._implementation;
  }

  // An element of a namespace, of the class of its name.
  _createElement(namespace, prefix, localName) {
    if (namespace === NAMESPACES.HTML) {
      const Class = htmlClassOf(localName);
      return new Class(this, namespace, prefix, localName);
    }
    if (namespace === NAMESPACES.SVG) return new SVGElement(this, namespace, prefix, localName);
    if (namespace === NAMESPACES.MATHML) return new MathMLElement(this, namespace, prefix, localName);
    return new Element(this, namespace, prefix, localName);
  }

  createElement(localName) {
    const name = String(localName);
    validateElementName(name);
    const html = this._isHTML || this._contentType === 'application/xhtml+xml';
    return this._createElement(html ? NAMESPACES.HTML : null, null, this._isHTML ? asciiLowercase(name) : name);
  }

  createElementNS(namespace, qualifiedName) {
    const { namespace: ns, prefix, localName } = validateAndExtract(namespace, String(qualifiedName));
    return this._createElement(ns, prefix, localName);
  }

  createTextNode(data) {
    return new Text(this, String(data));
  }

  createComment(data) {
    return new Comment(this, String(data));
  }

  createCDATASection(data) {
    if (this._isHTML) throw new DOMException('CDATA sections are not in HTML documents.', 'NotSupportedError');
    if (String(data).includes(']]>'))
      throw new DOMException('A CDATA section cannot have "]]>".', 'InvalidCharacterError');
    return new CDATASection(this, String(data));
  }

  createProcessingInstruction(target, data) {
    validateName(String(target));
    if (String(data).includes('?>')) throw new DOMException('Its data cannot have "?>".', 'InvalidCharacterError');
    return new ProcessingInstruction(this, String(target), String(data));
  }

  createDocumentFragment() {
    return new DocumentFragment(this);
  }

  createAttribute(localName) {
    const name = String(localName);
    validateAttributeName(name);
    return new Attr(this, null, null, this._isHTML ? asciiLowercase(name) : name, '');
  }

  createAttributeNS(namespace, qualifiedName) {
    const { namespace: ns, prefix, localName } = validateAndExtract(namespace, String(qualifiedName), true);
    return new Attr(this, ns, prefix, localName, '');
  }

  createNodeIterator(root, whatToShow = NodeFilter.SHOW_ALL, filter = null) {
    if (!(root instanceof Node)) throw new TypeError("createNodeIterator's root is not a Node.");
    return new NodeIterator(root, whatToShow, filter);
  }

  createTreeWalker(root, whatToShow = NodeFilter.SHOW_ALL, filter = null) {
    if (!(root instanceof Node)) throw new TypeError("createTreeWalker's root is not a Node.");
    return new TreeWalker(root, whatToShow, filter);
  }

  importNode(node, deep = false) {
    if (node.nodeType === NODE_TYPES.DOCUMENT_NODE) {
      throw new DOMException('A document cannot be imported.', 'NotSupportedError');
    }
    return node._clone(this, deep);
  }

  adoptNode(node) {
    if (node.nodeType === NODE_TYPES.DOCUMENT_NODE) {
      throw new DOMException('A document cannot be adopted.', 'NotSupportedError');
    }
    if (node._parent) node._parent._removeChild(node);
    node._adopt(this);
    return node;
  }

  // (The id attribute in no namespace; never '').
  getElementById(id) {
    const wanted = String(id);
    if (wanted === '') return null;
    return this._descendants((element) => element.getAttributeNS(null, 'id') === wanted)[0] ?? null;
  }

  getElementsByName(name) {
    return this._descendants((element) => element.getAttribute('name') === name);
  }

  querySelector(selector) {
    return select(this, selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    return Element.prototype.querySelectorAll.call(this, selector);
  }

  // The inert document of the contents of its templates (itself for one).
  _templateDocument() {
    if (this._isTemplateDocument) return this;
    if (!this._template) {
      this._template = new Document({ type: this._isHTML ? 'html' : 'xml', contentType: this._contentType });
      this._template._isTemplateDocument = true;
    }
    return this._template;
  }

  // The markup of a node: of its children (outer: of it too).
  _serialize(node, outer) {
    if (!this._isHTML) return serializeXml(node, outer);
    const options = { treeAdapter: adapterFor(this), scriptingEnabled: false };
    return outer ? serializeOuter(node, options) : serialize(node, options);
  }

  // A fragment of markup parsed in the context of an element.
  _parseFragment(context, html) {
    if (!this._isHTML) return parseXmlFragment(this, context, html);
    return parseFragment(context, html, { treeAdapter: adapterFor(this), scriptingEnabled: false });
  }

  _select(root, selector) {
    return select(root, selector);
  }

  _matches(element, selector) {
    return matches(element, selector);
  }

  _closest(element, selector) {
    return closest(element, selector);
  }

  _clone(document, deep) {
    // (Of its class: an XMLDocument's copy is an XMLDocument.)
    const copy = new this.constructor({ type: this._isHTML ? 'html' : 'xml', contentType: this._contentType });
    copy._mode = this._mode;
    if (deep) for (let child = this._first; child; child = child._next) copy._insert(child._clone(copy, true), null);
    return copy;
  }
}

class HTMLDocument extends Document {}

// The properties browsers have on document and on a <form> (cookie, location, submit, ...), those this DOM has not:
// there, without a value. A sanitizer drops an id or name of one of them (an element would clobber it in a browser).
function addNames(prototype, names) {
  for (const name of names) {
    if (!(name in prototype)) {
      Object.defineProperty(prototype, name, {
        value: undefined,
        writable: true,
        configurable: true,
        enumerable: false,
      });
    }
  }
}
addNames(Document.prototype, DOCUMENT_NAMES);
addNames(HTMLFormElement.prototype, FORM_NAMES);

class XMLDocument extends Document {}

// A document of a type: an HTMLDocument or XMLDocument.
function newDocument(type, contentType) {
  return type === 'html' ? new HTMLDocument({ type, contentType }) : new XMLDocument({ type, contentType });
}

class DOMImplementation {
  constructor(document) {
    this._document = document;
  }

  createDocumentType(name, publicId, systemId) {
    validateDoctypeName(String(name));
    return new DocumentType(this._document, String(name), String(publicId), String(systemId));
  }

  createHTMLDocument(title) {
    const document = newDocument('html');
    document._insert(new DocumentType(document, 'html', '', ''), null);
    const html = document.createElement('html');
    document._insert(html, null);
    const head = document.createElement('head');
    html._insert(head, null);
    if (title !== undefined) {
      const element = document.createElement('title');
      element._insert(document.createTextNode(title), null);
      head._insert(element, null);
    }
    html._insert(document.createElement('body'), null);
    return document;
  }

  createDocument(namespace, qualifiedName, doctype = null) {
    if (arguments.length < 2) throw new TypeError("Failed to execute 'createDocument': 2 arguments required.");
    // (qualifiedName as WebIDL's [LegacyNullToEmptyString] DOMString: null is '', undefined 'undefined'.)
    const name = qualifiedName === null ? '' : String(qualifiedName);
    if (doctype !== null && !(doctype instanceof DocumentType)) {
      throw new TypeError("createDocument's doctype is not a DocumentType.");
    }
    const contentType =
      namespace === NAMESPACES.HTML
        ? 'application/xhtml+xml'
        : namespace === NAMESPACES.SVG
          ? 'image/svg+xml'
          : 'application/xml';
    const document = newDocument('xml', contentType);
    if (doctype) document._insert(document.adoptNode(doctype), null);
    if (name) document._insert(document.createElementNS(namespace, name), null);
    return document;
  }

  hasFeature() {
    return true;
  }
}

const XML_TYPES = new Set(['application/xml', 'text/xml', 'application/xhtml+xml', 'image/svg+xml']);

class DOMParser {
  // A document of markup: HTML ('text/html'), or XML (a <parsererror> document when it is not well formed).
  parseFromString(string, type) {
    const text = String(string);
    if (type === 'text/html') {
      const document = newDocument('html');
      parse(text, { treeAdapter: adapterFor(document), scriptingEnabled: false });
      return document;
    }
    if (XML_TYPES.has(type)) return parseXml(newDocument('xml', type), text);
    throw new TypeError(
      `Failed to execute 'parseFromString' on 'DOMParser': The provided value '${type}' is not a valid enum value of type DOMParserSupportedType.`
    );
  }
}

class XMLSerializer {
  serializeToString(node) {
    return serializeXml(node, true);
  }
}

// (The document of new Text() and its kind, without a window: an HTML one.)
setDocumentFactory(() => newDocument('html'));

export { Document, HTMLDocument, XMLDocument, DOMImplementation, DOMParser, XMLSerializer, newDocument };
