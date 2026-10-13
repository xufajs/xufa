// The comments of a source file, as ESTree's ({ type: 'Line' | 'Block', value, range }), from one pass over its
// characters: strings are skipped, and so are the tokens whose text a pass of characters cannot tell from code, taken
// from the tree (`opaque`, collected by index.js while it sets parents): regular expressions (a / starts one only
// where the grammar says), the parts of templates, JSX text and the strings of JSX attributes (which have no escapes).
// (TypeScript's scanner did it, token by token, in four times as long.)

import { getLocFor } from './node-utils.js';
import { SyntaxKind as K } from './version.js';

// Whether a node's text is one such token; `add(start, end)` takes them in the order of the text.
export function addOpaqueToken(node, source, add) {
  switch (node.kind) {
    case K.RegularExpressionLiteral:
    case K.NoSubstitutionTemplateLiteral:
    case K.TemplateHead:
    case K.TemplateMiddle:
    case K.TemplateTail:
      add(node.getStart(source), node.end);
      break;
    case K.JsxText:
      if (node.end > node.pos) add(node.pos, node.end);
      break;
    case K.StringLiteral:
      if (node.parent.kind === K.JsxAttribute) add(node.getStart(source), node.end);
      break;
  }
}

const SLASH = 47;
const STAR = 42;
const BACKSLASH = 92;
const SINGLE_QUOTE = 39;
const DOUBLE_QUOTE = 34;

const isLineBreak = (code) => code === 10 || code === 13 || code === 0x2028 || code === 0x2029;

/**
 * The comments of `source`; with loc, their lines and columns too. `opaque`: [start, end, start, end...] of the tokens
 * to skip whole (see addOpaqueToken), by start.
 */
export function convertComments(source, { loc = false, opaque = [] } = {}) {
  const text = source.text;
  const length = text.length;
  const comments = [];
  let next = 0; // the next opaque token
  let index = 0;
  // A hashbang is no comment (prettier reads it apart).
  if (text.charCodeAt(0) === 35 && text.charCodeAt(1) === 33) {
    while (index < length && !isLineBreak(text.charCodeAt(index))) index++;
  }
  while (index < length) {
    while (next < opaque.length && opaque[next] < index) next += 2;
    if (opaque[next] === index) {
      index = opaque[next + 1];
      next += 2;
      continue;
    }
    const code = text.charCodeAt(index);
    if (code === SLASH) {
      const following = text.charCodeAt(index + 1);
      if (following === SLASH || following === STAR) {
        let end;
        if (following === SLASH) {
          end = index + 2;
          while (end < length && !isLineBreak(text.charCodeAt(end))) end++;
        } else {
          const close = text.indexOf('*/', index + 2);
          end = close === -1 ? length : close + 2;
        }
        const line = following === SLASH;
        const range = [index, end];
        const comment = {
          type: line ? 'Line' : 'Block',
          value: text.slice(index + 2, line ? end : end - 2),
          range,
        };
        if (loc) comment.loc = getLocFor(range, source);
        comments.push(comment);
        index = end;
        continue;
      }
    } else if (code === SINGLE_QUOTE || code === DOUBLE_QUOTE) {
      index++;
      while (index < length) {
        const character = text.charCodeAt(index);
        if (character === BACKSLASH) index += 2;
        else {
          index++;
          if (character === code || isLineBreak(character)) break;
        }
      }
      continue;
    }
    index++;
  }
  return comments;
}
