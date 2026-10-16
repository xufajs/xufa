// The interface of each HTML element (the HTML standard's index of elements, obsolete ones too): HTMLDivElement for
// <div>, HTMLHeadingElement for <h1> to <h6>... An element of a name the standard does not have is an
// HTMLUnknownElement, but one of a valid custom element name (<my-widget>), which is an HTMLElement. The interfaces
// are classes with no members of their own here but those of nodes.js (links, images, templates, forms).
import {
  HTMLElement,
  HTMLAnchorElement,
  HTMLAreaElement,
  HTMLImageElement,
  HTMLUnknownElement,
  HTMLTemplateElement,
  HTMLFormElement,
  tokenListProperty,
  LINK_ELEMENT_TYPES,
} from './nodes.js';

// Interface: its elements.
const ELEMENTS = {
  HTMLAudioElement: ['audio'],
  HTMLBaseElement: ['base'],
  HTMLBodyElement: ['body'],
  HTMLBRElement: ['br'],
  HTMLButtonElement: ['button'],
  HTMLCanvasElement: ['canvas'],
  HTMLDataElement: ['data'],
  HTMLDataListElement: ['datalist'],
  HTMLDetailsElement: ['details'],
  HTMLDialogElement: ['dialog'],
  HTMLDirectoryElement: ['dir'],
  HTMLDivElement: ['div'],
  HTMLDListElement: ['dl'],
  HTMLEmbedElement: ['embed'],
  HTMLFieldSetElement: ['fieldset'],
  HTMLFontElement: ['font'],
  HTMLFrameElement: ['frame'],
  HTMLFrameSetElement: ['frameset'],
  HTMLHeadElement: ['head'],
  HTMLHeadingElement: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  HTMLHRElement: ['hr'],
  HTMLHtmlElement: ['html'],
  HTMLIFrameElement: ['iframe'],
  HTMLInputElement: ['input'],
  HTMLLabelElement: ['label'],
  HTMLLegendElement: ['legend'],
  HTMLLIElement: ['li'],
  HTMLLinkElement: ['link'],
  HTMLMapElement: ['map'],
  HTMLMarqueeElement: ['marquee'],
  HTMLMenuElement: ['menu'],
  HTMLMetaElement: ['meta'],
  HTMLMeterElement: ['meter'],
  HTMLModElement: ['del', 'ins'],
  HTMLObjectElement: ['object'],
  HTMLOListElement: ['ol'],
  HTMLOptGroupElement: ['optgroup'],
  HTMLOptionElement: ['option'],
  HTMLOutputElement: ['output'],
  HTMLParagraphElement: ['p'],
  HTMLParamElement: ['param'],
  HTMLPictureElement: ['picture'],
  HTMLPreElement: ['pre', 'listing', 'xmp'],
  HTMLProgressElement: ['progress'],
  HTMLQuoteElement: ['blockquote', 'q'],
  HTMLScriptElement: ['script'],
  HTMLSelectElement: ['select'],
  HTMLSlotElement: ['slot'],
  HTMLSourceElement: ['source'],
  HTMLSpanElement: ['span'],
  HTMLStyleElement: ['style'],
  HTMLTableCaptionElement: ['caption'],
  HTMLTableCellElement: ['td', 'th'],
  HTMLTableColElement: ['col', 'colgroup'],
  HTMLTableElement: ['table'],
  HTMLTableRowElement: ['tr'],
  HTMLTableSectionElement: ['tbody', 'thead', 'tfoot'],
  HTMLTextAreaElement: ['textarea'],
  HTMLTimeElement: ['time'],
  HTMLTitleElement: ['title'],
  HTMLTrackElement: ['track'],
  HTMLUListElement: ['ul'],
  HTMLVideoElement: ['video'],
};

// The elements whose interface is HTMLElement itself.
const PLAIN = [
  'abbr',
  'address',
  'article',
  'aside',
  'b',
  'bdi',
  'bdo',
  'cite',
  'code',
  'dd',
  'dfn',
  'dt',
  'em',
  'figcaption',
  'figure',
  'footer',
  'header',
  'hgroup',
  'i',
  'kbd',
  'main',
  'mark',
  'nav',
  'noscript',
  'rp',
  'rt',
  'ruby',
  's',
  'samp',
  'search',
  'section',
  'small',
  'strong',
  'sub',
  'summary',
  'sup',
  'u',
  'var',
  'wbr',
  // obsolete
  'acronym',
  'basefont',
  'big',
  'center',
  'nobr',
  'noembed',
  'noframes',
  'plaintext',
  'rb',
  'rtc',
  'strike',
  'tt',
];

// The classes, by interface and by element.
const INTERFACES = {};
const BY_ELEMENT = new Map(PLAIN.map((name) => [name, HTMLElement]));
for (const [name, elements] of Object.entries(ELEMENTS)) {
  // (A class of that name: its constructor's name is the interface's.)
  const Class = { [name]: class extends HTMLElement {} }[name];
  INTERFACES[name] = Class;
  for (const element of elements) BY_ELEMENT.set(element, Class);
}
// (Those with members, in nodes.js.)
BY_ELEMENT.set('a', HTMLAnchorElement);
BY_ELEMENT.set('area', HTMLAreaElement);
BY_ELEMENT.set('img', HTMLImageElement);
BY_ELEMENT.set('template', HTMLTemplateElement);
BY_ELEMENT.set('form', HTMLFormElement);
tokenListProperty(INTERFACES.HTMLLinkElement, 'relList', 'rel', LINK_ELEMENT_TYPES);
tokenListProperty(INTERFACES.HTMLLinkElement, 'sizes', 'sizes');
tokenListProperty(INTERFACES.HTMLOutputElement, 'htmlFor', 'for');

// A valid custom element name (HTML standard): a lowercase ASCII letter first, a hyphen, no uppercase ASCII letter,
// and not one of the names SVG and MathML had first.
const PCEN_CHAR =
  '\\-._0-9a-z\\u00B7\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u203F-\\u2040' +
  '\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}';
const CUSTOM_ELEMENT_NAME = new RegExp(`^[a-z][${PCEN_CHAR}]*-[${PCEN_CHAR}]*$`, 'u');
const RESERVED = new Set([
  'annotation-xml',
  'color-profile',
  'font-face',
  'font-face-src',
  'font-face-uri',
  'font-face-format',
  'font-face-name',
  'missing-glyph',
]);

const isCustomElementName = (name) => CUSTOM_ELEMENT_NAME.test(name) && !RESERVED.has(name);

// The class of an HTML element of a local name.
function htmlClassOf(localName) {
  return BY_ELEMENT.get(localName) ?? (isCustomElementName(localName) ? HTMLElement : HTMLUnknownElement);
}

export { INTERFACES as HTML_INTERFACES, htmlClassOf, isCustomElementName };
