// A text as a regular expression that matches it, inside a character class or out of it: what has a meaning is
// escaped with a backslash, and `-` as \x2d (a backslash before it is an error in a pattern with the u flag).
const SPECIAL = /[|\\{}()[\]^$+*?.]/g;

const __default = function escapeRegExp(text) {
  if (typeof text !== 'string') throw new TypeError('Expected a string');
  return text.replace(SPECIAL, '\\$&').replace(/-/g, '\\x2d');
};
export default __default;
