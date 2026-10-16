# @xufa/purify

DOMPurify, the XSS sanitizer of HTML, on the DOM of [@xufa/html](../html): ready in Node with no jsdom. Its library is
DOMPurify's (3.3.3, ported by `tools/port-purify`), so it removes what DOMPurify removes; its test suite passes on it
(309 tests, the XSS vectors of its fixtures included).

```sh
npm install @xufa/purify
```

```js
import DOMPurify from '@xufa/purify'; // or require('@xufa/purify')

DOMPurify.sanitize('<img src=x onerror=alert(1)><b>Hi</b>'); // '<img src="x"><b>Hi</b>'
DOMPurify.sanitize('<p>Hi <b>there</b> & <script>x</script></p>', { ALLOWED_TAGS: [], KEEP_CONTENT: true });
// 'Hi there &amp; '
```

DOMPurify's API as it is: `sanitize(dirty, config)` with all its options (`ALLOWED_TAGS`, `ALLOWED_ATTR`, `FORBID_*`,
`ADD_*`, `USE_PROFILES`, `KEEP_CONTENT`, `WHOLE_DOCUMENT`, `RETURN_DOM`, `RETURN_DOM_FRAGMENT`, `SAFE_FOR_TEMPLATES`,
`SANITIZE_NAMED_PROPS`, `PARSER_MEDIA_TYPE`, `NAMESPACE`, `IN_PLACE`, ...), `setConfig`, `clearConfig`,
`isValidAttribute`, `addHook`, `removeHook`, `removeHooks`, `removed`, and `DOMPurify(window)` for another window. The
nodes it returns (`RETURN_DOM`) are of `@xufa/html/dom`.

## How it was checked

- DOMPurify's own tests on it: 309 pass. Skipped: its tests that put what it returns into a page and wait for
  `alert()` (the DOM of @xufa/html runs no scripts), and its bootstrap tests (they load it into a page by a `<script>`).
- Against DOMPurify on jsdom 27: the same output for its 216 XSS vectors with 12 configurations, and for 37,000 random
  markups. Where the two differed (text inside a `<table>`: jsdom puts it after the table), DOMPurify in Chrome gives
  ours: jsdom does not follow the HTML standard there.
- The DOM it runs on parses with parse5 (html5lib's conformance suite passes), and has the live `NodeIterator`,
  namespaces and attribute rules DOMPurify relies on. DOMPurify's README warns against DOMs that do not
  (happy-dom).

Measured against DOMPurify on jsdom 27, with a configuration that keeps text only (fresh processes, medians):

|                               | DOMPurify + jsdom     | @xufa/purify |
| ----------------------------- | --------------------- | ------------ |
| Loaded and the first call     | 760 ms, 28 MB of heap | 48 ms, 6 MB  |
| An error text (60 characters) | 733 µs                | 65 µs        |
| A message of 1 KB             | 1,982 µs              | 260 µs       |
| A message of 10 KB            | 35,463 µs             | 2,796 µs     |

And DOMPurify on jsdom slows down while it works: 1.2 ms a call over its first 1,000 calls, 8.2 ms over its 8,000th, its
heap at 438 MB. @xufa/purify stays at its time and memory.
