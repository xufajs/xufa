// A window of the DOM of @xufa/html: a document (parsed from markup, an empty page by default) and the interfaces
// browsers have on window (Node, Element, DOMParser, NodeFilter, ...), as libraries made for browsers take them
// (DOMPurify: createDOMPurify(window)). No scripts run, nothing is fetched.
import { DOMException } from './exception.js';
import { NodeFilter, NodeIterator, TreeWalker } from './iterator.js';
import {
  Node,
  Attr,
  NamedNodeMap,
  NodeList,
  HTMLCollection,
  Element,
  HTMLElement,
  HTMLAnchorElement,
  HTMLAreaElement,
  HTMLImageElement,
  HTMLUnknownElement,
  DOMTokenList,
  DOMStringMap,
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
} from './nodes.js';
import { Document, HTMLDocument, XMLDocument, DOMImplementation, DOMParser, XMLSerializer } from './document.js';
import { HTML_INTERFACES } from './html-elements.js';

const INTERFACES = {
  Node,
  Attr,
  NamedNodeMap,
  NodeList,
  HTMLCollection,
  Element,
  HTMLElement,
  HTMLAnchorElement,
  HTMLAreaElement,
  HTMLImageElement,
  HTMLUnknownElement,
  DOMTokenList,
  DOMStringMap,
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
  Document,
  HTMLDocument,
  XMLDocument,
  DOMImplementation,
  DOMParser,
  XMLSerializer,
  DOMException,
  NodeFilter,
  NodeIterator,
  TreeWalker,
  ...HTML_INTERFACES,
};

// The methods of ChildNode and ParentNode are [Unscopable]: left out of with (node) { ... }.
for (const Interface of [Element, CharacterData, DocumentType, Document, DocumentFragment]) {
  const own = Object.hasOwn(Interface.prototype, Symbol.unscopables) ? Interface.prototype[Symbol.unscopables] : null;
  const unscopable = Object.assign(Object.create(null), own);
  for (const name of ['before', 'after', 'replaceWith', 'remove', 'prepend', 'append', 'replaceChildren']) {
    if (name in Interface.prototype) unscopable[name] = true;
  }
  Object.defineProperty(Interface.prototype, Symbol.unscopables, { value: unscopable, configurable: true });
}

// [Symbol.toStringTag] of the interfaces: Object.prototype.toString gives [object HTMLDivElement], as in browsers.
for (const [name, Interface] of Object.entries(INTERFACES)) {
  if (typeof Interface === 'function' && !Object.hasOwn(Interface.prototype, Symbol.toStringTag)) {
    Object.defineProperty(Interface.prototype, Symbol.toStringTag, { value: name, configurable: true });
  }
}

const EMPTY_PAGE = '<!DOCTYPE html><html><head></head><body></body></html>';

// A window whose document is the markup given.
function createWindow(html = EMPTY_PAGE) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const window = { ...INTERFACES, document };
  document._defaultView = window;
  window.window = window;
  window.self = window;
  window.globalThis = window;
  return window;
}

export { createWindow, INTERFACES };
