// @xufa/purify against DOMPurify 3.3.3 on jsdom 27.4.0 (DOMPurify's way in Node), with a configuration that keeps the
// text only (no tags, as an API that cleans what users send): the first call (loaded, a window made, one text
// sanitized: ms, less is better), and calls a second on texts of 60 characters, 1 KB and 10 KB.
// node bench/micro/purify.js [rounds]
const { versus, rate } = require('../lib/versus.js');

const CONFIG = { ALLOWED_TAGS: [], ALLOWED_ATTR: [], KEEP_CONTENT: true };
const INPUTS = {
  'an error text (60 characters)': 'Book not found, retrieving the book 123<script>alert(1)</script>',
  'a message of 1 KB': (
    'Hello <b>there</b>, this is your <a href="https://x.example/p?q=1">list</a>: ' +
    'read two chapters a day & keep 3 < 4. '
  ).repeat(8),
  'a message of 10 KB': '<p>Paragraph with <i>emphasis</i> and <img src=x onerror=alert(1)> plus text.</p>'.repeat(110),
};

function load(library) {
  if (library === 'ours') return require('@xufa/purify');
  const createDOMPurify = require('dompurify');
  const { JSDOM } = require('jsdom');
  return createDOMPurify(new JSDOM('<!DOCTYPE html>').window);
}

versus({
  file: __filename,
  theirs: 'DOMPurify 3.3.3 + jsdom 27.4.0',
  ours: '@xufa/purify',
  unit: 'calls/s',
  cases: {
    'the first call: loaded and one text sanitized': { lower: true, unit: 'ms' },
    ...Object.fromEntries(Object.keys(INPUTS).map((name) => [name, {}])),
  },
  measure(library, caseName) {
    if (caseName.startsWith('the first call')) {
      const start = process.hrtime.bigint();
      load(library).sanitize(INPUTS['an error text (60 characters)'], CONFIG);
      return Number(process.hrtime.bigint() - start) / 1e6;
    }
    const purify = load(library);
    const input = INPUTS[caseName];
    return rate(() => purify.sanitize(input, CONFIG), { ms: 1500, warm: 200 });
  },
});
