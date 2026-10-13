// Lines of a text, as ECMAScript ends them (\r\n, \r, \n, LS, PS), and a shebang line (#!...) at its start.

const LINE_BREAK = /\r\n|[\r\n\u2028\u2029]/u;
const SHEBANG = /^#!([^\r\n]+)/u;
// The statements a break without a label leaves.
const BREAKABLE_TYPE = /^(?:(?:Do)?While|For(?:In|Of)?|Switch)Statement$/u;

/** A new global matcher of line breaks (it keeps its place: one per loop). */
const lineBreakMatcher = () => new RegExp(LINE_BREAK.source, 'gu');

export { LINE_BREAK, SHEBANG, BREAKABLE_TYPE, lineBreakMatcher };
