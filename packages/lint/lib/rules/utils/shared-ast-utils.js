// ESLint's shared/ast-utils.js (MIT, see NOTICE.md): statements `break` leaves, line breaks and the shebang.

const breakableTypePattern = /^(?:(?:Do)?While|For(?:In|Of)?|Switch)Statement$/u;
const lineBreakPattern = /\r\n|[\r\n\u2028\u2029]/u;
const shebangPattern = /^#!([^\r\n]+)/u;

function createGlobalLinebreakMatcher() {
  return new RegExp(lineBreakPattern.source, 'gu');
}

export { breakableTypePattern, lineBreakPattern, createGlobalLinebreakMatcher, shebangPattern };
