// @xufa/lint: small helpers of text (they were the packages trim-newlines, collapse-white-space and
// escape-string-regexp).

/** The text without the line breaks (\r and \n) at its end. */
export function trimNewlinesEnd(text) {
  let end = text.length;
  while (end > 0 && (text[end - 1] === '\r' || text[end - 1] === '\n')) {
    end--;
  }
  return end < text.length ? text.slice(0, end) : text;
}

/** Each run of white space as one space. */
export function collapseWhiteSpace(value) {
  return String(value).replace(/\s+/g, ' ');
}

/** A text as a regular expression that matches it. */
export function escapeStringRegexp(text) {
  return text.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&').replace(/-/g, '\\x2d');
}
