'use strict';

// The skeleton of a text (UTS #39, Unicode Security Mechanisms): two texts that look alike have the same one, also
// across scripts ("pаypal" with a Cyrillic а, "paypal", "раураl" are all "paypal"). An app refuses a new user name
// whose skeleton is taken:
//
//   const key = skeleton(normalizeIdentifier(name));  // stored with the user; unique
//
// The text in NFD, each character replaced by its prototype (confusables.txt: lib/confusables-data.js), in NFD again.
// A skeleton is a key to compare, not a text to show.
let prototypes = null;

function load() {
  prototypes = new Map();
  const data = require('./confusables-data'); // eslint-disable-line global-require
  let start = 0;
  while (start < data.length) {
    const end = data.indexOf('\u0001', start);
    const source = String.fromCodePoint(data.codePointAt(start));
    prototypes.set(source, data.slice(start + source.length, end));
    start = end + 1;
  }
  return prototypes;
}

function skeleton(value) {
  const map = prototypes || load();
  let out = '';
  for (const char of String(value).normalize('NFD')) {
    const prototype = map.get(char);
    out += prototype === undefined ? char : prototype;
  }
  return out.normalize('NFD');
}

module.exports = { skeleton };
