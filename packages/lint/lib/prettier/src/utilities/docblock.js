// @xufa/lint: the docblock of a file (its first /** */ comment) and its pragmas (@format, @flow...), as jest-docblock
// reads and writes them, with \n for lines when the docblock has none (prettier's builds make it so).

const commentEndRe = /\*\/$/;
const commentStartRe = /^\/\*\*?/;
const docblockRe = /^\s*(\/\*\*?(.|\r?\n)*?\*\/)/;
const lineCommentRe = /(^|\s+)\/\/([^\n\r]*)/g;
const ltrimNewlineRe = /^(\r?\n)+/;
const multilineRe = /(?:^|\r?\n) *(@[^\n\r]*?) *\r?\n *(?![^\n\r@]*\/\/[^]*)([^\s@][^\n\r@]+?) *\r?\n/g;
const propertyRe = /(?:^|\r?\n) *@(\S+) *([^\n\r]*)/g;
const stringStartRe = /(\r?\n|^) *\* ?/g;

// The line break of a text: \r\n when most of its lines end so, \n otherwise.
function newlineOf(text) {
  const newlines = text.match(/\r?\n/g);
  if (!newlines) {
    return '\n';
  }
  const crlf = newlines.filter((newline) => newline === '\r\n').length;
  return crlf > newlines.length - crlf ? '\r\n' : '\n';
}

/** The docblock at the start of a text ("" when it has none). */
function extract(contents) {
  const match = docblockRe.exec(contents);
  return match ? match[0].trimStart() : '';
}

/** The text without its docblock. */
function strip(contents) {
  const match = docblockRe.exec(contents);
  return match ? contents.slice(match[0].length) : contents;
}

/** The comments and the pragmas of a docblock: { comments, pragmas: { name: value or values } }. */
function parseWithComments(docblock) {
  const line = newlineOf(docblock);
  docblock = docblock.replace(commentStartRe, '').replace(commentEndRe, '').replaceAll(stringStartRe, '$1');
  // Directives over several lines, on one.
  let previous = '';
  while (previous !== docblock) {
    previous = docblock;
    docblock = docblock.replaceAll(multilineRe, `${line}$1 $2${line}`);
  }
  docblock = docblock.replace(ltrimNewlineRe, '').trimEnd();
  const pragmas = Object.create(null);
  const comments = docblock.replaceAll(propertyRe, '').replace(ltrimNewlineRe, '').trimEnd();
  for (const [, name, rawValue] of docblock.matchAll(propertyRe)) {
    const value = rawValue.replaceAll(lineCommentRe, '');
    const before = pragmas[name];
    if (typeof before === 'string' || Array.isArray(before)) {
      pragmas[name] = [...(Array.isArray(before) ? before : [before]), value];
    } else {
      pragmas[name] = value;
    }
  }
  return { comments, pragmas };
}

function printKeyValues(key, valueOrArray) {
  return (Array.isArray(valueOrArray) ? valueOrArray : [valueOrArray]).map((value) => `@${key} ${value}`.trim());
}

/** A docblock of comments and pragmas. */
function print({ comments = '', pragmas = {} }) {
  const line = newlineOf(comments);
  const head = '/**';
  const start = ' *';
  const tail = ' */';
  const keys = Object.keys(pragmas);
  const printedObject = keys
    .flatMap((key) => printKeyValues(key, pragmas[key]))
    .map((keyValue) => `${start} ${keyValue}${line}`)
    .join('');
  if (!comments) {
    if (keys.length === 0) {
      return '';
    }
    if (keys.length === 1 && !Array.isArray(pragmas[keys[0]])) {
      return `${head} ${printKeyValues(keys[0], pragmas[keys[0]])[0]}${tail}`;
    }
  }
  const printedComments =
    comments
      .split(line)
      .map((textLine) => `${start} ${textLine}`)
      .join(line) + line;
  return (
    head +
    line +
    (comments ? printedComments : '') +
    (comments && keys.length > 0 ? start + line : '') +
    printedObject +
    tail
  );
}

export { extract, parseWithComments, print, strip };
