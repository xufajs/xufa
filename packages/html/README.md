# @xufa/html

HTML parsed as browsers parse it, and a DOM to read and change what was parsed, with no dependencies. The parser is
parse5's (the HTML standard's tokenizer and tree construction: implied and misnested tags, tables, templates, SVG and
MathML), ported by `tools/port-parse5` with the decoding of entities it uses; its 10,596 tests pass on it, with the
html5lib conformance suite. `@xufa/html/dom` is a DOM of the DOM standard on it, for code made for browsers that reads
trees: a sanitizer ([@xufa/purify](../purify) runs DOMPurify on it), a scraper, a test.

```sh
npm install @xufa/html
```

```js
import { parse, parseFragment, serialize } from '@xufa/html';

const document = parse('<!doctype html><p>a<b>b<i>c</p>d');
serialize(document); // '<!DOCTYPE html><html><head></head><body><p>a<b>b<i>c</i></b></p><b><i>d</i></b></body></html>'
```

## The parser

`parse(html, options)` gives a document and `parseFragment(html)` (or `parseFragment(context, html)`) a fragment, as
parse5 has them (a tree of plain objects, or of your own with `treeAdapter`); `serialize(node)` and `serializeOuter(node)`
write them back as the HTML standard says. `scriptingEnabled`, `sourceCodeLocationInfo`, `onParseError` and the
`Tokenizer` are parse5's.

## The DOM

```js
import { createWindow, DOMParser } from '@xufa/html/dom';

const { document } = createWindow('<ul id="list"><li class="a">One</li><li>Two</li></ul>');
document.querySelectorAll('#list > li').length; // 2
document.querySelector('li.a').textContent; // 'One'
const doc = new DOMParser().parseFromString('<p>Hi <b>there</b>', 'text/html');
doc.body.innerHTML; // '<p>Hi <b>there</b></p>'
```

Documents (HTML, parsed with scripting disabled as `DOMParser` does in browsers; XML, with namespaces, well formed or a
`<parsererror>`), elements of HTML (of their interfaces: `HTMLDivElement`, `HTMLHeadingElement`... and
`HTMLUnknownElement`), SVG and MathML, attributes (names checked as the DOM standard has them now, lower-cased on HTML
elements, namespaces), text, comments, CDATA, processing instructions, doctypes and fragments; `innerHTML` and
`outerHTML` both ways (templates in their content, XML serialization for XML documents), `cloneNode`, `importNode`,
`adoptNode`, the live `NodeIterator` (its reference moved when nodes are removed, so a tree can be changed while walked)
and `TreeWalker`, `querySelector(All)`, `matches` and `closest` (types, ids, classes, attributes, `:not()`, the first,
last and only child, `:empty`, `:root`, `:scope`, `:nth-child()` and `:nth-last-child()` (with `of S`),
`:nth-of-type()`, `:nth-last-of-type()`, the first, last and only of a type, `:is()`, `:where()`, `:has()`, the
namespace prefixes `*|` and `|` (with no `@namespace` in `querySelector`, another prefix is a `SyntaxError`), the
combinators, CSS escapes), `classList` and `relList`, `dataset`, the namespace lookups, `isEqualNode`,
`compareDocumentPosition`, and `href` and `src` of links and images. Documents and forms have the names of the
properties browsers give them (`cookie`, `location`, `submit`, ...), taken from Chrome and jsdom by
`tools/port-purify/clobber-names.js`, so a sanitizer protecting against DOM clobbering finds them.

There are no events, layout, styles, scripts, timers or networking: what code that reads and changes trees needs, not a
browser. The types are those of TypeScript's DOM (`lib.dom`).

**web-platform-tests:** the DOM standard's tests of nodes, traversal, collections and token lists (`test/wpt`, 410 pages
copied by `tools/port-wpt/port.js`) run on it as a browser runs them, with WPT's own `testharness.js`, each page in a
realm of its own (`test/support/wpt.js`): 9,734 subtests pass. Those that fail are listed in `test/wpt-expected.json`
with their reasons, written by `tools/port-wpt/expectations.js`: what this DOM does not have (frames, events,
`MutationObserver`, `Range`, shadow DOM, `moveBefore()`, the selectors of states of forms and user input...), and 11
bugs still to fix. `test/wpt.test.js` fails when a passing subtest fails, and when a listed failure passes.
