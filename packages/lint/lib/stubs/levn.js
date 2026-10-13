'use strict';

// levn, for the comments that configure rules (/* eslint no-undef: "error", eqeqeq: off */): what they hold as an
// object, written as JSON whose keys, strings in single quotes and single words may go without double quotes.
function parse(type, text) {
  const json = text
    .trim()
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (all, inner) => JSON.stringify(inner.replace(/\\'/g, "'")))
    .replace(/([{,]\s*|^\s*)([A-Za-z_$@/][\w$@/-]*)\s*:/g, '$1"$2":')
    .replace(/([:[,]\s*)([A-Za-z_$][\w$-]*)(?=\s*[,}\]]|\s*$)/g, (all, before, word) =>
      ['true', 'false', 'null'].includes(word) ? all : `${before}"${word}"`
    );
  return JSON.parse(json.startsWith('{') ? json : `{${json}}`);
}

module.exports = { parse };
