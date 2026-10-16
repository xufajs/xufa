// @xufa/html/dom: a DOM of parsed HTML (and XML), as the DOM standard has it, for code made for browsers that reads
// and changes trees (a sanitizer, a scraper, tests): createWindow(html), DOMParser, the nodes. No scripts, styles,
// layout, events or networking.
export { createWindow, INTERFACES } from './lib/dom/window.js';
export {
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
  HTMLTemplateElement,
  HTMLFormElement,
  DOMTokenList,
  SVGElement,
  MathMLElement,
  CharacterData,
  Text,
  CDATASection,
  Comment,
  ProcessingInstruction,
  DocumentType,
  DocumentFragment,
} from './lib/dom/nodes.js';
export { NodeFilter, NodeIterator, TreeWalker } from './lib/dom/iterator.js';
export { DOMException } from './lib/dom/exception.js';
export {
  Document,
  HTMLDocument,
  XMLDocument,
  DOMImplementation,
  DOMParser,
  XMLSerializer,
} from './lib/dom/document.js';
